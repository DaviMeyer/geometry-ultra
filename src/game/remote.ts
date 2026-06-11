// ===========================================================================
// RemotePlayers — zeigt die Mitspieler im Multiplayer als farbige Cubes,
// inklusive nachziehender Leucht-Spur (wie der eigene Cube).
//
// Die Netzwerk-Updates kommen nur ~12×/Sekunde an. Damit die Bewegung flüssig
// aussieht, wird pro Frame sanft zur zuletzt empfangenen Zielposition
// interpoliert (lerp). Jeder Spieler bekommt anhand seiner uid eine feste Farbe.
// ===========================================================================

import * as THREE from 'three'

export interface RemoteState {
  uid: string
  x: number
  y: number
  z: number
  alive: boolean
}

const TRAIL_N = 14

interface TrailBit {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>
  life: number
}

interface Entry {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
  target: THREE.Vector3
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

  /** Übernimmt die neuesten Positionen aller Mitspieler. */
  setTargets(states: RemoteState[]) {
    const seen = new Set<string>()
    for (const s of states) {
      seen.add(s.uid)
      let entry = this.map.get(s.uid)
      const isNew = !entry
      if (!entry) {
        entry = this.createCube(s.uid)
        this.map.set(s.uid, entry)
      }
      entry.target.set(s.x, s.y, s.z)
      entry.mesh.visible = s.alive
      if (isNew) entry.mesh.position.copy(entry.target) // nicht von (0,0,0) heranziehen
    }
    // Spieler, die nicht mehr im Raum sind, entfernen
    for (const [uid, entry] of this.map) {
      if (!seen.has(uid)) {
        this.removeEntry(entry)
        this.map.delete(uid)
      }
    }
  }

  /** Interpolation zur Zielposition, Roll-Rotation und Spur. */
  update(dt: number) {
    const f = Math.min(1, dt * 10)
    for (const entry of this.map.values()) {
      if (entry.mesh.visible) {
        const beforeZ = entry.mesh.position.z
        entry.mesh.position.lerp(entry.target, f)
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

  /**
   * Bumper-Kollision: liefert den seitlichen Versatz, um aus der Überlappung mit
   * nahen Mitspielern herauszuschieben (0 = keine Kollision).
   */
  resolveCollision(px: number, pz: number, reach: number): number {
    let push = 0
    for (const entry of this.map.values()) {
      if (!entry.mesh.visible) continue
      const ep = entry.mesh.position
      if (Math.abs(pz - ep.z) > 1.6) continue // nur wenn längs nah genug
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
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), mat)
    mesh.castShadow = true
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0xffffff }))
    mesh.add(edges)
    this.scene.add(mesh)

    const trail: TrailBit[] = []
    for (let i = 0; i < TRAIL_N; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 }))
      m.visible = false
      this.scene.add(m)
      trail.push({ mesh: m, life: 0 })
    }

    return { mesh, target: new THREE.Vector3(), color, trail, trailIdx: 0 }
  }

  private removeEntry(entry: Entry) {
    this.scene.remove(entry.mesh)
    for (const bit of entry.trail) this.scene.remove(bit.mesh)
  }
}
