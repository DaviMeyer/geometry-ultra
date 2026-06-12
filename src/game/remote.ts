// ===========================================================================
// RemotePlayers — zeigt die Mitspieler im Multiplayer als farbige Cubes,
// inklusive nachziehender Leucht-Spur (wie der eigene Cube).
//
// Die Netzwerk-Updates kommen nur ~12×/Sekunde an und sind durch Latenz
// zusätzlich veraltet. Damit der Gegner an seiner ECHTEN Position erscheint
// (und nicht um Latenz × Tempo nach hinten versetzt), wird per Dead Reckoning
// extrapoliert: jedes Update trägt einen Server-Zeitstempel (t) und die
// Vorwärtsgeschwindigkeit (vz); pro Frame gilt z ≈ z_paket - vz * Alter.
// Der Korrektursprung bei Paketankunft wird weich abgebaut (kein Ruckeln),
// x/y werden klassisch gelerpt. Jeder Spieler bekommt anhand seiner uid eine
// feste Farbe.
// ===========================================================================

import * as THREE from 'three'

export interface RemoteState {
  uid: string
  /** Anzeigename (für die Abstandsanzeige). */
  name?: string
  x: number
  y: number
  z: number
  alive: boolean
  /** Server-Zeitstempel des Updates (ms), fehlt bei Lobby-Initialdaten. */
  t?: number
  /** Vorwärtsgeschwindigkeit (units/s) zum Zeitpunkt des Updates. */
  vz?: number
}

const TRAIL_N = 14

/** Extrapolation höchstens so weit in die Zukunft (Sender-Stall/Uhrfehler-Schutz). */
const MAX_EXTRAPOLATE_S = 0.5

// Geteilte Geometrien — werden nie entsorgt, aber auch nur einmal angelegt.
const CUBE_GEO = new THREE.BoxGeometry(1.1, 1.1, 1.1)
const CUBE_EDGES_GEO = new THREE.EdgesGeometry(CUBE_GEO)
const TRAIL_GEO = new THREE.BoxGeometry(1, 1, 1)
const EDGE_MAT = new THREE.LineBasicMaterial({ color: 0xffffff })

interface TrailBit {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>
  life: number
}

interface Entry {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
  target: THREE.Vector3 // rohe Paket-Position
  name: string
  t: number | null
  vz: number
  zOffset: number // Restfehler zwischen Anzeige und Extrapolation (wird abgebaut)
  color: THREE.Color
  trail: TrailBit[]
  trailIdx: number
}

/** Wandelt eine uid stabil in einen Farbton (0..1) um. */
function hashHue(uid: string): number {
  let h = 0
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0
  return (h % 360) / 360
}

export class RemotePlayers {
  private map = new Map<string, Entry>()

  constructor(private scene: THREE.Scene) {}

  /** Extrapolierte Soll-Z-Position eines Eintrags zur Server-Zeit `serverNow`. */
  private idealZ(entry: Entry, serverNow: number): number {
    if (entry.t === null || entry.vz <= 0) return entry.target.z
    const age = Math.max(0, Math.min(MAX_EXTRAPOLATE_S, (serverNow - entry.t) / 1000))
    return entry.target.z - entry.vz * age // vorwärts = Welt-Z nimmt ab
  }

  /** Übernimmt die neuesten Positionen aller Mitspieler. */
  setTargets(states: RemoteState[], serverNow: number) {
    const seen = new Set<string>()
    for (const s of states) {
      if (!s.uid) continue // Teil-Knoten ohne uid: niemals einen Cube dafür bauen
      seen.add(s.uid)
      let entry = this.map.get(s.uid)
      const isNew = !entry
      if (!entry) {
        entry = this.createCube(s.uid)
        this.map.set(s.uid, entry)
      }
      entry.target.set(s.x, s.y, s.z)
      if (s.name) entry.name = s.name
      entry.t = typeof s.t === 'number' ? s.t : null
      entry.vz = typeof s.vz === 'number' ? s.vz : 0
      entry.mesh.visible = s.alive
      const iz = this.idealZ(entry, serverNow)
      if (isNew) {
        // nicht von (0,0,0) heranziehen
        entry.mesh.position.set(s.x, s.y, iz)
        entry.zOffset = 0
      } else {
        // Anzeige bleibt stetig: Sprung als Korrekturfehler merken und abbauen.
        // Echte Teleports (z.B. Reset an die Startlinie bei Revanche) aber
        // sofort übernehmen statt sekundenlang hinüberzugleiten.
        entry.zOffset = entry.mesh.position.z - iz
        if (Math.abs(entry.zOffset) > 50) {
          entry.mesh.position.set(s.x, s.y, iz)
          entry.zOffset = 0
        }
      }
    }
    // Spieler, die nicht mehr im Raum sind, entfernen
    for (const [uid, entry] of this.map) {
      if (!seen.has(uid)) {
        this.removeEntry(entry)
        this.map.delete(uid)
      }
    }
  }

  /** Extrapolation + Glättung zur Zielposition, Roll-Rotation und Spur. */
  update(dt: number, serverNow: number) {
    const f = Math.min(1, dt * 10)
    for (const entry of this.map.values()) {
      if (entry.mesh.visible) {
        const beforeZ = entry.mesh.position.z
        // x/y weich lerpen (seitliche Bewegung/Sprünge)
        entry.mesh.position.x += (entry.target.x - entry.mesh.position.x) * f
        entry.mesh.position.y += (entry.target.y - entry.mesh.position.y) * f
        // z: extrapolierte Position direkt setzen, Korrekturfehler exponentiell abbauen
        entry.zOffset *= Math.exp(-dt * 7)
        if (Math.abs(entry.zOffset) < 0.002) entry.zOffset = 0
        entry.mesh.position.z = this.idealZ(entry, serverNow) + entry.zOffset
        const dz = beforeZ - entry.mesh.position.z // vorwärts = positiv
        entry.mesh.rotation.x -= dz * 0.5 // rollt wie der echte Cube
        this.emitTrail(entry)
      }
      this.updateTrail(entry, dt)
    }
  }

  clear() {
    for (const entry of this.map.values()) this.removeEntry(entry)
    this.map.clear()
  }

  /** Position des führenden (am weitesten vorne = kleinstes z) sichtbaren Cubes. */
  getLeaderPosition(): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null
    for (const entry of this.map.values()) {
      if (!entry.mesh.visible) continue
      if (!best || entry.mesh.position.z < best.z) best = entry.mesh.position
    }
    return best
  }

  /** Der längs (Z) nächste sichtbare Mitspieler relativ zu `pz` (Abstandsanzeige). */
  getNearest(pz: number): { name: string; z: number } | null {
    let best: { name: string; z: number } | null = null
    let bestDist = Infinity
    for (const entry of this.map.values()) {
      if (!entry.mesh.visible) continue
      const dist = Math.abs(pz - entry.mesh.position.z)
      if (dist < bestDist) {
        bestDist = dist
        best = { name: entry.name, z: entry.mesh.position.z }
      }
    }
    return best
  }

  /**
   * Bumper-Kollision: liefert den seitlichen Versatz, um aus der Überlappung mit
   * nahen Mitspielern herauszuschieben (0 = keine Kollision). Rechnet gegen die
   * extrapolierte Anzeige-Position; das Längs-Fenster ist etwas großzügiger,
   * weil trotz Dead Reckoning Jitter-Restfehler bleiben.
   */
  resolveCollision(px: number, pz: number, reach: number): number {
    let push = 0
    for (const entry of this.map.values()) {
      if (!entry.mesh.visible) continue
      const ep = entry.mesh.position
      if (Math.abs(pz - ep.z) > 2.2) continue // nur wenn längs nah genug
      const dx = px - ep.x
      const absdx = Math.abs(dx)
      if (absdx < reach) push += (reach - absdx) * (dx >= 0 ? 1 : -1)
    }
    return push
  }

  private emitTrail(entry: Entry) {
    const bit = entry.trail[entry.trailIdx]
    bit.mesh.visible = true
    bit.mesh.position.copy(entry.mesh.position)
    bit.mesh.scale.set(0.85, 0.85, 0.85)
    bit.life = 1
    entry.trailIdx = (entry.trailIdx + 1) % TRAIL_N
  }

  private updateTrail(entry: Entry, dt: number) {
    for (const bit of entry.trail) {
      if (!bit.mesh.visible) continue
      bit.life -= dt * 2.2
      if (bit.life <= 0) {
        bit.mesh.visible = false
        continue
      }
      bit.mesh.material.opacity = bit.life * 0.45
      const s = 0.85 * bit.life
      bit.mesh.scale.set(s, s, s)
    }
  }

  private createCube(uid: string): Entry {
    const color = new THREE.Color().setHSL(hashHue(uid), 0.85, 0.6)
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.3 })
    const mesh = new THREE.Mesh(CUBE_GEO, mat)
    mesh.castShadow = true
    const edges = new THREE.LineSegments(CUBE_EDGES_GEO, EDGE_MAT)
    mesh.add(edges)
    this.scene.add(mesh)

    const trail: TrailBit[] = []
    for (let i = 0; i < TRAIL_N; i++) {
      const m = new THREE.Mesh(TRAIL_GEO, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 }))
      m.visible = false
      this.scene.add(m)
      trail.push({ mesh: m, life: 0 })
    }

    return { mesh, target: new THREE.Vector3(), name: 'Spieler', t: null, vz: 0, zOffset: 0, color, trail, trailIdx: 0 }
  }

  private removeEntry(entry: Entry) {
    this.scene.remove(entry.mesh)
    entry.mesh.material.dispose() // Geometrien sind geteilt, Materialien nicht
    for (const bit of entry.trail) {
      this.scene.remove(bit.mesh)
      bit.mesh.material.dispose()
    }
  }
}
