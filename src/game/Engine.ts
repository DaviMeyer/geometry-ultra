// ===========================================================================
// Engine — orchestriert alle Spiel-Bausteine (Szene, Player, World, Partikel,
// Audio, Input) und betreibt die Render-/Update-Schleife.
//
// Bewusst frei von React: die Kommunikation nach außen läuft nur über
// EngineCallbacks. Die React-UI mountet das Spiel über einen Container-DIV.
// ===========================================================================

import * as THREE from 'three'
import { AudioEngine } from './audio'
import { GhostPlayer, GhostRecorder, type GhostData } from './ghost'
import { InputManager } from './input'
import { ParticleSystem } from './particles'
import { Player } from './player'
import { RemotePlayers, type RemoteState } from './remote'
import { createScene, type SceneBundle } from './scene'
import {
  BASE_SPEED,
  COLORS,
  CRYSTAL_TURBO,
  DESPAWN_BACK,
  FLOOR_SEG_LEN,
  FLOOR_SEGS,
  GROUND_Y,
  LANE_LIMIT,
  MAX_SPEED,
  SPAWN_AHEAD,
  SPEED_RAMP,
  ULTRA_TURBO,
  type EngineCallbacks,
  type GameMode,
  type GameState,
} from './types'
import { World, type Crystal } from './world'

export class Engine {
  readonly audio = new AudioEngine()
  private canvas: HTMLCanvasElement
  private bundle: SceneBundle
  private player: Player
  private world: World
  private particles: ParticleSystem
  private input: InputManager
  private recorder = new GhostRecorder()
  private ghostPlayer: GhostPlayer
  private remotePlayers: RemotePlayers

  private state: GameState = 'menu'
  private mode: GameMode = 'classic'
  private seed = 1
  private speed = BASE_SPEED
  private lastSentVz = 0
  private serverOffset = 0 // Server-Zeit ≈ Date.now() + serverOffset
  private score = 0
  private distance = 0
  private elapsed = 0
  private camShake = 0
  private lastReportedScore = -1
  private lastReportedPct = -1
  private lastReportedTurbo = -1
  private lastReportedInv = -1
  private pendingGhosts: GhostData[] = []
  private lastGhost: GhostData | null = null
  private progressAcc = 0
  private spectating = false
  private spectateSnap = false
  private collisionMode = false
  private wasBoosting = false
  private bounceVx = 0 // abklingender Seitwärts-Impuls nach Bumper-Kollision
  private bounceCooldown = 0 // drosselt Sound/Partikel bei Dauerkontakt
  private lastProxKey = '' // Dedup für die Abstandsanzeige

  private lastT = performance.now()
  private rafId = 0
  private goTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private container: HTMLElement,
    private callbacks: EngineCallbacks = {},
  ) {
    this.canvas = document.createElement('canvas')
    this.canvas.style.display = 'block'
    container.appendChild(this.canvas)

    this.bundle = createScene(this.canvas)
    this.player = new Player(this.bundle.scene)
    this.world = new World(this.bundle.scene, this.seed)
    this.particles = new ParticleSystem(this.bundle.scene)
    this.ghostPlayer = new GhostPlayer(this.bundle.scene)
    this.remotePlayers = new RemotePlayers(this.bundle.scene)

    this.input = new InputManager({
      onJump: this.handleJump,
      onRestart: this.handleRestart,
      onMute: this.handleMute,
    })
    this.input.attach(this.canvas)

    // Menü-Ausgangszustand
    this.player.position.set(0, GROUND_Y, 0)
    this.bundle.camera.position.set(0, 6, 12)
    this.bundle.camera.lookAt(0, 1, 0)
    // ein bisschen Deko im Hintergrund
    for (let i = 0; i < 4; i++) this.world.generateChunk()

    // iOS/Autoplay: AudioContext darf nur synchron in einer echten Nutzergeste
    // entsperrt werden. Multiplayer/Daily starten aber aus setTimeout/await heraus
    // — daher hier bei jeder Geste entsperren (init/resume sind idempotent).
    window.addEventListener('pointerdown', this.unlockAudio)
    window.addEventListener('keydown', this.unlockAudio)

    window.addEventListener('resize', this.onResize)
    this.rafId = requestAnimationFrame(this.loop)
  }

  private unlockAudio = () => {
    this.audio.init()
    this.audio.resume()
  }

  // ----------------------------- Öffentliche API -----------------------------

  /** Setzt die Geister, die beim nächsten start() abgespielt werden. */
  setGhosts(ghosts: GhostData[]) {
    this.pendingGhosts = ghosts
  }

  /** Liefert den aufgezeichneten Geist des letzten beendeten Laufs. */
  getLastGhost(): GhostData | null {
    return this.lastGhost
  }

  /** Aktualisiert die Positionen der Mitspieler (Multiplayer, von React). */
  updateRemotePlayers(states: RemoteState[]) {
    this.remotePlayers.setTargets(states, Date.now() + this.serverOffset)
  }

  /** Setzt den Server-Zeit-Offset (für die Extrapolation der Mitspieler). */
  setServerOffset(offset: number) {
    this.serverOffset = offset
  }

  /** Zuschauer-Modus: Kamera folgt dem führenden Mitspieler (nach eigenem Crash). */
  setSpectating(on: boolean) {
    if (on && !this.spectating) this.spectateSnap = true // beim Einschalten direkt hinspringen
    this.spectating = on
  }

  /** Schaltet den Multiplayer-Kollisionsmodus (Bumper) ein/aus. */
  setCollisionMode(on: boolean) {
    this.collisionMode = on
  }

  /** Mobile: TURBO-Button im HUD wird gehalten/losgelassen. */
  setTouchBoost(on: boolean) {
    this.input.setTouchBoost(on)
  }

  /** Startet einen neuen Lauf. spawnX: seitliche Startposition (Multiplayer-Aufstellung). */
  start(seed: number, mode: GameMode = 'classic', spawnX = 0) {
    this.audio.init()
    this.audio.resume()

    this.seed = seed
    this.mode = mode
    this.speed = BASE_SPEED
    this.lastSentVz = 0
    this.score = 0
    this.distance = 0
    this.elapsed = 0
    this.camShake = 0
    this.progressAcc = 0
    this.bounceVx = 0
    this.bounceCooldown = 0
    this.lastProxKey = ''
    this.callbacks.onProximity?.(null)
    this.spectating = false
    this.lastReportedScore = -1
    this.lastReportedPct = -1
    this.lastGhost = null

    if (this.goTimer) {
      clearTimeout(this.goTimer)
      this.goTimer = null
    }

    this.player.reset()
    this.player.position.x = spawnX // Multiplayer: nebeneinander starten
    this.wasBoosting = false
    this.player.setVisible(true)
    this.particles.reset()
    this.input.reset()
    this.world.reset(seed)
    this.recorder.reset()
    this.ghostPlayer.setGhosts(this.pendingGhosts)
    this.ghostPlayer.resetToStart()
    this.remotePlayers.clear()

    this.bundle.camera.position.set(0, 6, 12)
    this.resetFloor()

    // Anfangs-Strecke deterministisch vorab erzeugen
    this.world.fillAhead(0, SPAWN_AHEAD)

    this.state = 'playing'
    this.reportScore(true)
  }

  /** Zurück ins Menü (rotierender Cube). */
  toMenu() {
    this.state = 'menu'
    this.spectating = false
    this.camShake = 0
    this.player.setVisible(true)
    this.player.reset()
    this.ghostPlayer.clear()
    this.remotePlayers.clear()
    // Boden/Welt zurück zum Ursprung — die Menü-Kamera schaut fest auf z≈0;
    // ohne Reset stünden Boden-Segmente noch an der Z-Position des letzten Laufs.
    this.resetFloor()
    this.world.reset(this.seed)
    for (let i = 0; i < 4; i++) this.world.generateChunk()
  }

  setMuted(muted: boolean) {
    this.audio.muted = muted
  }

  dispose() {
    cancelAnimationFrame(this.rafId)
    if (this.goTimer) clearTimeout(this.goTimer)
    this.input.detach()
    window.removeEventListener('pointerdown', this.unlockAudio)
    window.removeEventListener('keydown', this.unlockAudio)
    window.removeEventListener('resize', this.onResize)
    this.bundle.renderer.dispose()
    if (this.canvas.parentElement === this.container) this.container.removeChild(this.canvas)
  }

  // ----------------------------- Eingabe-Handler -----------------------------

  private handleJump = () => {
    if (this.state === 'playing') {
      const kind = this.player.jump()
      if (kind === 'single') this.audio.jump()
      else if (kind === 'double') this.audio.dbljump()
      if (kind !== 'none') {
        const p = this.player.position
        this.particles.burst(p.x, p.y - 0.5, p.z, COLORS.cyan, 8, 4)
      }
    } else if (this.state === 'gameover') {
      this.callbacks.onRestartRequest?.()
    }
  }

  private handleRestart = () => {
    if (this.state === 'gameover') this.callbacks.onRestartRequest?.()
  }

  private handleMute = () => {
    const muted = this.audio.toggleMute()
    this.callbacks.onMuteChange?.(muted)
  }

  // ----------------------------- Schleife -----------------------------

  private loop = (now: number) => {
    let dt = (now - this.lastT) / 1000
    this.lastT = now
    if (dt > 0.05) dt = 0.05

    // Ein einzelner Fehler (z.B. aus einem Callback) darf die rAF-Schleife
    // nicht dauerhaft töten — sonst friert das ganze Spiel ein.
    try {
      if (this.state === 'playing') this.update(dt)
      this.updateVisualsAlways(dt)
      this.bundle.renderer.render(this.bundle.scene, this.bundle.camera)
    } catch (e) {
      console.error('Engine-Frame fehlgeschlagen:', e)
    }
    this.rafId = requestAnimationFrame(this.loop)
  }

  private update(dt: number) {
    this.elapsed += dt
    const mult = this.player.tickPower(dt, this.input.isBoosting())
    if (this.player.boosting && !this.wasBoosting) this.audio.dash() // kurzer Boost-Start-Sound
    this.wasBoosting = this.player.boosting
    this.speed = Math.min(MAX_SPEED, this.speed + SPEED_RAMP * dt)
    const curSpeed = this.speed * mult

    // vorwärts (Welt-Z nimmt ab)
    const dz = curSpeed * dt
    const p = this.player.position
    const prevZ = p.z // für Swept-Kollision (Tunneling bei hohem Tempo/niedriger FPS)
    p.z -= dz
    this.distance += dz
    this.score += dz

    // Geist aufzeichnen + Geister abspielen (synchron zur Spielzeit)
    this.recorder.record(dt, p.x, p.y, p.z)
    this.ghostPlayer.update(this.elapsed)

    // Bewegung (seitlich, Sprung, Rotation)
    const side = this.input.getSideInput()
    const prevY = p.y // Höhe vor der Bewegung (für Y-Interpolation im Swept-Test)
    const landed = this.player.updateMovement(dt, side, dz)
    if (landed) this.particles.burst(p.x, GROUND_Y - 0.5, p.z, COLORS.purple, 6, 3)

    // Multiplayer-Kollisionsmodus: von Mitspielern wegschieben (Bumper)
    if (this.collisionMode && this.mode === 'multiplayer') {
      const push = this.remotePlayers.resolveCollision(p.x, p.z, 1.15)
      if (push !== 0) {
        p.x = Math.max(-LANE_LIMIT, Math.min(LANE_LIMIT, p.x + push))
        // lustiger Schubs: federnder Impuls in Schubrichtung + Boing/Partikel
        this.bounceVx = Math.sign(push) * 14
        if (this.bounceCooldown <= 0) {
          this.bounceCooldown = 0.35
          this.audio.bounce()
          this.particles.burst(p.x - Math.sign(push) * 0.8, p.y, p.z, COLORS.pink, 12, 5)
          this.camShake = Math.max(this.camShake, 0.25)
        }
      }
      // Impuls abklingen lassen — der Spieler kann jederzeit dagegen lenken
      if (this.bounceVx !== 0) {
        p.x += this.bounceVx * dt
        this.bounceVx *= Math.exp(-dt * 6)
        if (Math.abs(this.bounceVx) < 0.3) this.bounceVx = 0
        if (p.x <= -LANE_LIMIT || p.x >= LANE_LIMIT) {
          p.x = Math.max(-LANE_LIMIT, Math.min(LANE_LIMIT, p.x))
          this.bounceVx *= -0.4 // kleiner Abpraller von der Bande
        }
      }
    }
    if (this.bounceCooldown > 0) this.bounceCooldown -= dt

    this.player.emitTrail()

    // Strecke nachfüllen
    this.world.fillAhead(p.z, SPAWN_AHEAD)

    // Hindernisse: Despawn + Kollision
    for (let i = this.world.obstacles.length - 1; i >= 0; i--) {
      const o = this.world.obstacles[i]
      if (o.mesh.position.z > p.z + DESPAWN_BACK) {
        this.world.removeObstacle(i)
        continue
      }
      if (this.hitTest(o.mesh.position, o.hw, o.hh, o.hd, prevZ, prevY)) {
        if (this.player.isInvincible) {
          // unverwundbar: Hindernis zerschmettern statt sterben
          this.audio.smash()
          this.particles.burst(o.mesh.position.x, o.mesh.position.y, o.mesh.position.z, COLORS.gold, 18, 6)
          this.world.removeObstacle(i)
        } else {
          this.gameOver()
          return
        }
      }
    }

    // Kristalle: Einsammeln + Despawn (z-Abstand zum im Frame durchfahrenen
    // Intervall [p.z, prevZ], sonst werden Kristalle bei hohem Tempo übersprungen)
    for (let i = this.world.crystals.length - 1; i >= 0; i--) {
      const c = this.world.crystals[i]
      if (c.mesh.position.z > p.z + DESPAWN_BACK) {
        this.world.removeCrystal(i)
        continue
      }
      const dx = p.x - c.mesh.position.x
      const dy = p.y - c.mesh.position.y
      const nearestZ = Math.max(p.z, Math.min(prevZ, c.mesh.position.z))
      const dzc = nearestZ - c.mesh.position.z
      if (dx * dx + dy * dy + dzc * dzc < 1.7 * 1.7) {
        this.collectCrystal(c)
        this.world.removeCrystal(i)
      }
    }

    // Boden recyceln
    this.recycleFloor(p.z)

    // Kamera folgt sanft
    const cam = this.bundle.camera
    const camTargetX = p.x * 0.45
    cam.position.x += (camTargetX - cam.position.x) * 0.08
    cam.position.y += (6.2 + p.y * 0.3 - cam.position.y) * 0.08
    cam.position.z = p.z + 12
    cam.lookAt(p.x * 0.5, p.y + 1.2, p.z - 8)

    // Glow folgt Spieler
    this.bundle.playerGlow.position.set(p.x, p.y + 0.5, p.z)
    if (this.player.isInvincible) this.bundle.playerGlow.color.setHSL((performance.now() * 0.0012) % 1, 1, 0.6)
    else this.bundle.playerGlow.color.setHex(this.player.isBoosting ? COLORS.yellow : COLORS.cyan)

    this.audio.beat(dt, this.speed)
    this.reportScore(false)
    this.reportProximity()

    // Multiplayer: eigene Position gedrosselt (~12 Hz) nach außen melden.
    // Bei Tempo-Sprüngen (Boost an/aus) sofort senden, damit die Extrapolation
    // der anderen Clients nicht mit veraltetem vz weiterrechnet.
    if (this.mode === 'multiplayer') {
      this.progressAcc += dt
      const speedJump = Math.abs(curSpeed - this.lastSentVz) > 4
      if (this.progressAcc >= 1 / 12 || speedJump) {
        this.progressAcc -= 1 / 12
        if (this.progressAcc < 0 || speedJump) this.progressAcc = 0
        this.lastSentVz = curSpeed
        this.callbacks.onProgress?.({ x: p.x, y: p.y, z: p.z, alive: true, score: Math.floor(this.score), vz: curSpeed })
      }
    }
  }

  /** Visuals, die immer laufen (auch im Menü). */
  private updateVisualsAlways(dt: number) {
    const now = performance.now()

    // Kristalle drehen + schweben (Stern in der Ebene, damit die Form sichtbar bleibt)
    for (const c of this.world.crystals) {
      if (c.kind === 'star') c.mesh.rotation.z += dt * 1.6
      else c.mesh.rotation.y += dt * 2.5
      c.mesh.position.y = 1.4 + Math.sin(now * 0.004 + c.mesh.position.z) * 0.18
    }

    this.player.updateTrail(dt)
    this.particles.update(dt)
    this.remotePlayers.update(dt, Date.now() + this.serverOffset) // Mitspieler extrapolieren + glätten

    // Kamera-Shake
    if (this.camShake > 0) {
      this.camShake -= dt
      this.bundle.camera.position.x += (Math.random() - 0.5) * this.camShake * 1.2
      this.bundle.camera.position.y += (Math.random() - 0.5) * this.camShake * 1.2
    }

    // sanfte Lichtanimation
    const t = now * 0.001
    this.bundle.rimCyan.intensity = 1.0 + Math.sin(t * 2) * 0.3
    this.bundle.rimPink.intensity = 1.0 + Math.cos(t * 2.3) * 0.3

    // Zuschauer-Modus: Kamera folgt dem führenden Mitspieler
    if (this.spectating) {
      const target = this.remotePlayers.getLeaderPosition()
      if (target) {
        this.recycleFloor(target.z) // Boden mitführen, sonst verschwindet die Straße
        this.spectateWorld(dt, target) // Hindernisse/Kristalle am Verfolgten entlang weiterführen
        const cam = this.bundle.camera
        if (this.spectateSnap) {
          // direkt zum Verfolgten springen (kein Hinüber-Gleiten über die ganze Strecke)
          cam.position.set(target.x * 0.45, 6.2 + target.y * 0.3, target.z + 12)
          this.spectateSnap = false
        } else {
          cam.position.x += (target.x * 0.45 - cam.position.x) * 0.08
          cam.position.y += (6.2 + target.y * 0.3 - cam.position.y) * 0.08
          cam.position.z = target.z + 12
        }
        cam.lookAt(target.x * 0.5, target.y + 1.2, target.z - 8)
        this.bundle.playerGlow.position.set(target.x, target.y + 0.5, target.z)
      }
    }

    // Menü: Cube dreht sich
    if (this.state === 'menu') {
      this.player.menuFloat(dt, t)
      this.bundle.camera.position.set(Math.sin(t * 0.3) * 3, 6, 12)
      this.bundle.camera.lookAt(0, 1, 0)
      this.bundle.playerGlow.position.set(0, 1.5, 0)
    }
  }

  // ----------------------------- Helfer -----------------------------

  /**
   * Kollisionstest mit Swept-Z: geprüft wird das gesamte im Frame durchfahrene
   * Z-Intervall [p.z, prevZ], nicht nur die Endposition — sonst tunnelt der
   * Spieler bei hohem Tempo/niedriger Framerate durch schmale Hindernisse.
   * Die Höhe wird auf den Kreuzungszeitpunkt interpoliert: Wer ein Hindernis in
   * sicherer Höhe überquert und im SELBEN Frame dahinter landet, darf nicht
   * rückwirkend mit seiner End-Höhe sterben.
   */
  private hitTest(o: THREE.Vector3, hw: number, hh: number, hd: number, prevZ: number, prevY: number): boolean {
    const p = this.player.position
    const phw = 0.5,
      phh = 0.5,
      phd = 0.5 // etwas kleiner als Cube -> fairer
    if (Math.abs(p.x - o.x) >= phw + hw) return false
    const zw = phd + hd
    if (p.z >= o.z + zw || prevZ <= o.z - zw) return false // Frame-Weg verfehlt das Z-Fenster

    // aktuell im Fenster -> aktuelle Höhe zählt
    if (Math.abs(p.z - o.z) < zw && Math.abs(p.y - o.y) < phh + hh) return true
    // durchgeflogen -> Höhe zum Kreuzungszeitpunkt (linear interpoliert)
    const travel = prevZ - p.z
    const tau = travel > 1e-6 ? Math.min(1, Math.max(0, (prevZ - o.z) / travel)) : 1
    const yAtCrossing = prevY + (p.y - prevY) * tau
    return Math.abs(yAtCrossing - o.y) < phh + hh
  }

  /** Wendet die Wirkung eines eingesammelten Kristalls an (Score, Turbo, Stern). */
  private collectCrystal(c: Crystal) {
    const pos = c.mesh.position
    if (c.kind === 'ultra') {
      this.score += 60
      this.player.addTurbo(ULTRA_TURBO)
      this.audio.ultraCoin()
      this.particles.burst(pos.x, pos.y, pos.z, COLORS.gold, 22, 7)
      this.particles.burst(pos.x, pos.y, pos.z, COLORS.yellow, 12, 5)
    } else if (c.kind === 'star') {
      this.player.makeInvincible()
      this.audio.powerMelody()
      this.particles.burst(pos.x, pos.y, pos.z, COLORS.gold, 30, 8)
    } else {
      this.score += 25
      this.player.addTurbo(CRYSTAL_TURBO)
      this.audio.coin()
      this.particles.burst(pos.x, pos.y, pos.z, COLORS.green, 14, 5)
    }
  }

  private gameOver() {
    this.state = 'gameover'
    this.lastProxKey = ''
    this.callbacks.onProximity?.(null)
    this.audio.crash()
    this.camShake = 0.6
    const p = this.player.position
    this.particles.burst(p.x, p.y, p.z, COLORS.pink, 60, 12)
    this.particles.burst(p.x, p.y, p.z, COLORS.cyan, 40, 9)
    this.player.setVisible(false)

    // aufgezeichneten Lauf als Geist sichern (für Daily-Bestenliste)
    this.lastGhost = this.recorder.build(this.seed, Math.floor(this.score))

    this.callbacks.onGameOver?.({
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      mode: this.mode,
      seed: this.seed,
    })

    this.goTimer = setTimeout(() => this.player.setVisible(true), 700)
  }

  /**
   * Abstand zum nächsten Gegner (Multiplayer) bzw. zum Tages-Geist (Daily) —
   * dedupliziert auf ganze Meter, damit React nicht jeden Frame rendert.
   */
  private reportProximity() {
    if (!this.callbacks.onProximity) return
    let target: { name?: string; z: number } | null = null
    if (this.mode === 'multiplayer') target = this.remotePlayers.getNearest(this.player.position.z)
    else if (this.mode === 'daily') target = this.ghostPlayer.getLeadGhost()

    let key = ''
    let info: { name: string; meters: number; ahead: boolean } | null = null
    if (target) {
      const dz = this.player.position.z - target.z // > 0: der andere ist vor dir (Welt-Z nimmt ab)
      const meters = Math.round(Math.abs(dz))
      const name = target.name || (this.mode === 'daily' ? 'Tages-Geist' : 'Spieler')
      info = { name, meters, ahead: dz > 0 }
      key = `${name}|${dz > 0}|${meters}`
    }
    if (key === this.lastProxKey) return
    this.lastProxKey = key
    this.callbacks.onProximity(info)
  }

  private reportScore(force: boolean) {
    const s = Math.floor(this.score)
    const pct = Math.round(((this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED)) * 100)
    const turboPct = Math.round(this.player.turbo * 100)
    const invSec = Math.ceil(this.player.invincibleTime)
    if (force || s !== this.lastReportedScore || pct !== this.lastReportedPct || turboPct !== this.lastReportedTurbo || invSec !== this.lastReportedInv) {
      this.lastReportedScore = s
      this.lastReportedPct = pct
      this.lastReportedTurbo = turboPct
      this.lastReportedInv = invSec
      this.callbacks.onScore?.(s, Math.max(0, Math.min(100, pct)), turboPct, invSec)
    }
  }

  private resetFloor() {
    const segs = this.bundle.floorSegments
    for (let i = 0; i < segs.length; i++) {
      segs[i].position.z = -i * FLOOR_SEG_LEN + FLOOR_SEG_LEN
    }
  }

  /**
   * Führt im Zuschauer-Modus die Welt am verfolgten Spieler entlang weiter:
   * Hindernisse nachgenerieren + despawnen, Kristalle einsammeln, die er berührt.
   * Funktioniert, weil alle Spieler denselben Seed (= dasselbe Level) haben.
   */
  private spectateWorld(_dt: number, target: THREE.Vector3) {
    this.world.fillAhead(target.z, SPAWN_AHEAD)

    for (let i = this.world.obstacles.length - 1; i >= 0; i--) {
      if (this.world.obstacles[i].mesh.position.z > target.z + DESPAWN_BACK) this.world.removeObstacle(i)
    }

    for (let i = this.world.crystals.length - 1; i >= 0; i--) {
      const c = this.world.crystals[i]
      if (c.mesh.position.z > target.z + DESPAWN_BACK) {
        this.world.removeCrystal(i)
        continue
      }
      const dx = target.x - c.mesh.position.x
      const dy = target.y - c.mesh.position.y
      const dz = target.z - c.mesh.position.z
      if (dx * dx + dy * dy + dz * dz < 1.7 * 1.7) {
        this.particles.burst(c.mesh.position.x, c.mesh.position.y, c.mesh.position.z, COLORS.green, 14, 5)
        this.world.removeCrystal(i)
      }
    }
  }

  /** Schiebt Boden-Segmente, die hinter `refZ` liegen, wieder nach vorne. */
  private recycleFloor(refZ: number) {
    for (const seg of this.bundle.floorSegments) {
      // while statt if: holt auch große Sprünge auf (z.B. Wechsel in den Zuschauer-Modus)
      while (seg.position.z > refZ + FLOOR_SEG_LEN) {
        seg.position.z -= FLOOR_SEG_LEN * FLOOR_SEGS
      }
    }
  }

  private onResize = () => {
    this.bundle.camera.aspect = window.innerWidth / window.innerHeight
    this.bundle.camera.updateProjectionMatrix()
    this.bundle.renderer.setSize(window.innerWidth, window.innerHeight)
  }
}
