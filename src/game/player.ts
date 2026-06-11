// ===========================================================================
// Player — der steuerbare Cube samt Leucht-Kanten und nachziehender Spur.
// Kapselt Bewegungsphysik (Sprung, Doppelsprung, seitlich), das Turbo-System
// und die Unverwundbarkeit (Stern). Effekte (Sound/Partikel) löst die Engine
// anhand der Rückgabewerte aus.
// ===========================================================================

import * as THREE from 'three'
import { BOOST_DRAIN, BOOST_MULT, COLORS, GRAVITY, GROUND_Y, INVINCIBLE_SPEED_BONUS, INVINCIBLE_TIME, JUMP_V, LANE_LIMIT, SIDE_SPEED, TRAIL_N, TURBO_REGEN } from './types'

interface TrailPiece {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>
  life: number
}

/** Welche Art Sprung ausgelöst wurde (für passenden Sound). */
export type JumpKind = 'none' | 'single' | 'double'

export class Player {
  readonly mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
  private edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>
  private trail: TrailPiece[] = []
  private trailIdx = 0

  velY = 0
  onGround = true
  jumps = 0

  turbo = 0 // 0..1 Turbo-Füllstand
  boosting = false // aktuell Turbo aktiv?
  invincibleTime = 0 // Restzeit Unverwundbarkeit (s)

  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x111133, emissive: COLORS.cyan, emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.25 })
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), mat)
    this.mesh.castShadow = true
    scene.add(this.mesh)

    this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(this.mesh.geometry), new THREE.LineBasicMaterial({ color: COLORS.cyan }))
    this.mesh.add(this.edges)

    for (let i = 0; i < TRAIL_N; i++) {
      const t = i / TRAIL_N
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.5 * (1 - t) }))
      m.visible = false
      scene.add(m)
      this.trail.push({ mesh: m, life: 0 })
    }
  }

  get isBoosting(): boolean {
    return this.boosting
  }
  get isInvincible(): boolean {
    return this.invincibleTime > 0
  }
  get position(): THREE.Vector3 {
    return this.mesh.position
  }

  /** Versucht zu springen; gibt zurück, welcher Sprung ausgelöst wurde. */
  jump(): JumpKind {
    if (this.jumps >= 2) return 'none'
    this.velY = JUMP_V * (this.jumps === 0 ? 1 : 0.86)
    this.onGround = false
    this.jumps++
    return this.jumps === 1 ? 'single' : 'double'
  }

  /** Lädt den Turbo (Kristalle/Ultra-Bonus). */
  addTurbo(amount: number) {
    this.turbo = Math.max(0, Math.min(1, this.turbo + amount))
  }

  /** Startet die Unverwundbarkeit (Stern). */
  makeInvincible() {
    this.invincibleTime = INVINCIBLE_TIME
  }

  /**
   * Aktualisiert Turbo & Unverwundbarkeit pro Frame und liefert den
   * Tempo-Multiplikator (>1 wenn Boost aktiv).
   */
  tickPower(dt: number, boostHeld: boolean): number {
    if (this.invincibleTime > 0) this.invincibleTime = Math.max(0, this.invincibleTime - dt)

    if (boostHeld && this.turbo > 0) {
      // Boost aktiv -> Turbo verbrauchen (KEINE gleichzeitige Aufladung)
      this.boosting = true
      this.turbo = Math.max(0, this.turbo - BOOST_DRAIN * dt)
    } else if (boostHeld) {
      // Shift gehalten, aber Balken leer -> kein Boost, auch kein Nachladen
      this.boosting = false
    } else {
      // Shift losgelassen -> langsam wieder aufladen
      this.boosting = false
      this.turbo = Math.min(1, this.turbo + TURBO_REGEN * dt)
    }

    // Tempo-Faktoren stapeln sich: Turbo (stark) + Stern-Modus (mittel)
    let mult = 1
    if (this.boosting) mult += BOOST_MULT - 1 // +0.8
    if (this.isInvincible) mult += INVINCIBLE_SPEED_BONUS // +0.45
    return mult
  }

  /**
   * Bewegung pro Frame: seitlich, Schwerkraft/Sprung, Cube-Rotation, Aussehen.
   * `dz` = bereits zurückgelegte Vorwärtsstrecke (für die Rollrotation).
   * Gibt true zurück, wenn der Cube in diesem Frame gelandet ist.
   */
  updateMovement(dt: number, sideInput: number, dz: number): boolean {
    // seitlich
    this.mesh.position.x += sideInput * SIDE_SPEED * dt
    this.mesh.position.x = Math.max(-LANE_LIMIT, Math.min(LANE_LIMIT, this.mesh.position.x))

    // Schwerkraft / Sprung
    this.velY += GRAVITY * dt
    this.mesh.position.y += this.velY * dt
    let landed = false
    if (this.mesh.position.y <= GROUND_Y) {
      this.mesh.position.y = GROUND_Y
      if (!this.onGround) landed = true
      this.velY = 0
      this.onGround = true
      this.jumps = 0
    }

    // Cube-Rotation: rollt vorwärts, kippt beim Lenken
    this.mesh.rotation.x -= dz * 0.5
    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, -sideInput * 0.4, 0.15)

    this.updateLook()
    return landed
  }

  /** Färbt den Cube: Regenbogen-Glanz bei Unverwundbarkeit, gelb bei Turbo, sonst cyan. */
  private updateLook() {
    if (this.isInvincible) {
      const hue = (performance.now() * 0.0012) % 1 // legendärer Regenbogen-Glanz
      this.mesh.material.emissive.setHSL(hue, 1, 0.55)
      this.edges.material.color.setHSL(hue, 1, 0.75)
      this.mesh.material.emissiveIntensity = 1.3
      const pulse = 1 + Math.sin(performance.now() * 0.02) * 0.06
      this.mesh.scale.setScalar(pulse)
    } else {
      const col = this.isBoosting ? COLORS.yellow : COLORS.cyan
      this.mesh.material.emissive.setHex(col)
      this.edges.material.color.setHex(col)
      this.mesh.material.emissiveIntensity = 0.6
      this.mesh.scale.setScalar(1)
    }
  }

  private trailColor(): number {
    if (this.isInvincible) return COLORS.gold
    return this.isBoosting ? COLORS.yellow : COLORS.cyan
  }

  /** Setzt am aktuellen Ort ein neues Trail-Stück (beim Spielen jeden Frame). */
  emitTrail() {
    const tp = this.trail[this.trailIdx]
    tp.mesh.visible = true
    tp.mesh.position.copy(this.mesh.position)
    tp.mesh.scale.set(0.9, 0.9, 0.9)
    tp.mesh.material.color.setHex(this.trailColor())
    tp.life = 1
    this.trailIdx = (this.trailIdx + 1) % TRAIL_N
  }

  /** Lässt die Spur verblassen (läuft immer, auch im Menü). */
  updateTrail(dt: number) {
    for (const t of this.trail) {
      if (!t.mesh.visible) continue
      t.life -= dt * 2.2
      if (t.life <= 0) {
        t.mesh.visible = false
        continue
      }
      t.mesh.material.opacity = t.life * 0.5
      const s = 0.9 * t.life
      t.mesh.scale.set(s, s, s)
    }
  }

  /** Sanfte Schwebe-/Dreh-Animation im Menü. */
  menuFloat(dt: number, t: number) {
    this.mesh.rotation.y += dt * 0.6
    this.mesh.rotation.x += dt * 0.3
    this.mesh.position.y = GROUND_Y + Math.sin(t * 1.5) * 0.3
  }

  setVisible(v: boolean) {
    this.mesh.visible = v
  }

  reset() {
    this.mesh.position.set(0, GROUND_Y, 0)
    this.mesh.rotation.set(0, 0, 0)
    this.mesh.scale.setScalar(1)
    this.velY = 0
    this.onGround = true
    this.jumps = 0
    this.turbo = 0
    this.boosting = false
    this.invincibleTime = 0
    for (const t of this.trail) {
      t.mesh.visible = false
      t.life = 0
    }
  }
}
