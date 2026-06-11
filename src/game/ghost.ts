// ===========================================================================
// Geister (Ghosts) — Aufzeichnung und Wiedergabe vergangener Läufe.
//
// Ein Geist ist die Aufzeichnung der Spielerposition über die Spielzeit.
// Aufgezeichnet wird in festen Intervallen (Samples). Bei der Wiedergabe wird
// die Position zur aktuellen Spielzeit interpoliert und als durchscheinender
// Cube gezeigt.
//
// Wichtig: Geister sind nur sinnvoll bei GLEICHEM Seed (gleiches Level) —
// daher nur im Daily-Modus genutzt. Sie kollidieren nicht, sind rein visuell.
// ===========================================================================

import * as THREE from 'three'
import { COLORS, GROUND_Y } from './types'

export interface GhostData {
  seed: number
  score: number
  name?: string
  interval: number // Sekunden zwischen zwei Samples
  xs: number[]
  ys: number[]
  zs: number[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Zeichnet während eines Laufs die Spielerposition in festen Intervallen auf. */
export class GhostRecorder {
  readonly interval = 1 / 12
  private acc = 0
  private xs: number[] = []
  private ys: number[] = []
  private zs: number[] = []

  reset() {
    this.acc = 0
    this.xs = []
    this.ys = []
    this.zs = []
  }

  record(dt: number, x: number, y: number, z: number) {
    this.acc += dt
    if (this.acc >= this.interval) {
      this.acc -= this.interval
      this.xs.push(round2(x))
      this.ys.push(round2(y))
      this.zs.push(round2(z))
    }
  }

  /** Baut das speicherbare Geist-Objekt für den gerade beendeten Lauf. */
  build(seed: number, score: number): GhostData {
    return { seed, score, interval: this.interval, xs: this.xs.slice(), ys: this.ys.slice(), zs: this.zs.slice() }
  }

  get sampleCount() {
    return this.xs.length
  }
}

/** Spielt einen oder mehrere Geister synchron zur Spielzeit ab. */
export class GhostPlayer {
  private meshes: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[] = []
  private ghosts: GhostData[] = []

  constructor(private scene: THREE.Scene) {}

  /** Lädt die abzuspielenden Geister und erzeugt bei Bedarf neue Cubes. */
  setGhosts(ghosts: GhostData[]) {
    this.ghosts = ghosts
    // genügend Meshes vorhalten
    while (this.meshes.length < ghosts.length) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: COLORS.purple,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), mat)
      mesh.visible = false
      this.scene.add(mesh)
      this.meshes.push(mesh)
    }
    // alle erst mal verstecken
    for (const m of this.meshes) m.visible = false
  }

  clear() {
    this.ghosts = []
    for (const m of this.meshes) m.visible = false
  }

  /** Positioniert jeden Geist an seiner interpolierten Stelle zur Zeit `elapsed`. */
  update(elapsed: number) {
    for (let g = 0; g < this.ghosts.length; g++) {
      const data = this.ghosts[g]
      const mesh = this.meshes[g]
      const n = data.xs.length
      if (n === 0) {
        mesh.visible = false
        continue
      }
      const fidx = elapsed / data.interval
      const i0 = Math.floor(fidx)
      if (i0 >= n - 1) {
        // Geist ist am Ende seiner Aufzeichnung -> er hat hier nicht überlebt
        mesh.visible = false
        continue
      }
      const frac = fidx - i0
      mesh.visible = true
      mesh.position.set(
        THREE.MathUtils.lerp(data.xs[i0], data.xs[i0 + 1], frac),
        THREE.MathUtils.lerp(data.ys[i0], data.ys[i0 + 1], frac),
        THREE.MathUtils.lerp(data.zs[i0], data.zs[i0 + 1], frac),
      )
      mesh.rotation.x = elapsed * 1.5 // dezente Eigenrotation
    }
  }

  /** Stellt die Geister an ihren Startpunkt (Menü/Reset). */
  resetToStart() {
    for (let g = 0; g < this.ghosts.length; g++) {
      const data = this.ghosts[g]
      const mesh = this.meshes[g]
      if (data.xs.length > 0) {
        mesh.position.set(data.xs[0], data.ys[0] ?? GROUND_Y, data.zs[0])
        mesh.visible = true
      }
    }
  }
}
