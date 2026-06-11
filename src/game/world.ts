// ===========================================================================
// World — verwaltet Hindernisse, Kristalle und den deterministischen
// Level-Generator. ALLE gameplay-relevanten Zufälle laufen hier über den
// Seed-RNG (rng.ts), damit gleiches Seed = gleiches Level ergibt.
// ===========================================================================

import * as THREE from 'three'
import { Rng } from './rng'
import {
  BASE_SPEED,
  COLORS,
  type CrystalKind,
  MAX_SPEED,
  TRACK_WIDTH,
  type ObstacleType,
} from './types'

export interface Obstacle {
  mesh: THREE.Object3D
  type: ObstacleType
  hw: number
  hh: number
  hd: number
}

export interface Crystal {
  mesh: THREE.Mesh
  kind: CrystalKind
}

export class World {
  readonly obstacles: Obstacle[] = []
  readonly crystals: Crystal[] = []
  private nextSpawnZ = -40
  private rng: Rng

  // Geteilte Geometrien (einmal erzeugt, vielfach genutzt)
  private spikeGeo = new THREE.ConeGeometry(0.75, 1.6, 4)
  private blockGeo = new THREE.BoxGeometry(2.2, 2.4, 2.2)
  private barGeo = new THREE.BoxGeometry(TRACK_WIDTH, 1.0, 0.8)
  private crystalGeo = new THREE.OctahedronGeometry(0.6)
  private ultraGeo = new THREE.OctahedronGeometry(0.85)
  private starGeo = World.makeStarGeometry()

  /** Erzeugt eine echte 5-zackige Sternform (extrudiert). */
  private static makeStarGeometry(): THREE.ExtrudeGeometry {
    const shape = new THREE.Shape()
    const spikes = 5
    const outer = 0.9
    const inner = 0.42
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outer : inner
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    shape.closePath()
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 1 })
    geo.center()
    return geo
  }

  constructor(private scene: THREE.Scene, seed: number) {
    this.rng = new Rng(seed)
  }

  /** Setzt die Welt für einen neuen Lauf mit gegebenem Seed zurück. */
  reset(seed: number) {
    for (const o of this.obstacles) this.scene.remove(o.mesh)
    this.obstacles.length = 0
    for (const c of this.crystals) this.scene.remove(c.mesh)
    this.crystals.length = 0
    this.rng = new Rng(seed)
    this.nextSpawnZ = -50
  }

  private spawnSpike(x: number, z: number) {
    const m = new THREE.Mesh(
      this.spikeGeo,
      new THREE.MeshStandardMaterial({ color: 0x330011, emissive: COLORS.pink, emissiveIntensity: 1.3, metalness: 0.5, roughness: 0.3 }),
    )
    m.position.set(x, 0.8, z)
    m.rotation.y = Math.PI / 4
    m.castShadow = true
    this.scene.add(m)
    this.obstacles.push({ mesh: m, type: 'spike', hw: 0.7, hh: 1.6, hd: 0.7 })
  }

  private spawnBlock(x: number, z: number) {
    const m = new THREE.Mesh(
      this.blockGeo,
      new THREE.MeshStandardMaterial({ color: 0x1a0a33, emissive: COLORS.purple, emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.25 }),
    )
    m.position.set(x, 1.2, z)
    m.castShadow = true
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(this.blockGeo), new THREE.LineBasicMaterial({ color: COLORS.purple }))
    m.add(edges)
    this.scene.add(m)
    this.obstacles.push({ mesh: m, type: 'block', hw: 1.1, hh: 1.2, hd: 1.1 })
  }

  /** Niedrige Barriere über die volle Breite -> muss übersprungen werden. */
  private spawnBar(z: number) {
    const m = new THREE.Mesh(
      this.barGeo,
      new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: COLORS.yellow, emissiveIntensity: 1.1, metalness: 0.5, roughness: 0.3 }),
    )
    m.position.set(0, 0.5, z)
    m.castShadow = true
    this.scene.add(m)
    this.obstacles.push({ mesh: m, type: 'bar', hw: TRACK_WIDTH / 2, hh: 0.5, hd: 0.4 })
  }

  private spawnCrystal(x: number, z: number, kind: CrystalKind = 'normal') {
    let geo: THREE.BufferGeometry = this.crystalGeo
    let mat: THREE.MeshStandardMaterial
    if (kind === 'ultra') {
      geo = this.ultraGeo
      mat = new THREE.MeshStandardMaterial({ color: 0x4a3000, emissive: COLORS.gold, emissiveIntensity: 1.8, metalness: 0.6, roughness: 0.15 })
    } else if (kind === 'star') {
      geo = this.starGeo
      // strahlend gelb-weiß, klar unterscheidbar vom goldenen Ultra-Bonus
      mat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xfff4b0, emissiveIntensity: 2.2, metalness: 0.4, roughness: 0.1 })
    } else {
      mat = new THREE.MeshStandardMaterial({ color: 0x004433, emissive: COLORS.green, emissiveIntensity: 1.6, metalness: 0.3, roughness: 0.2 })
    }
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, 1.4, z)
    this.scene.add(m)
    this.crystals.push({ mesh: m, kind })
  }

  // Positionen über die volle (breitere) Streckenbreite
  private static readonly SPIKE_SLOTS = [-6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6]
  private static readonly BLOCK_SLOTS = [-5.5, -3.5, -1.5, 1.5, 3.5, 5.5]
  private static readonly LANES = [-6, -3, 0, 3, 6]

  /** Erzeugt das nächste Hindernis-Segment. `speed` steuert die Schwierigkeit. */
  generateChunk(speed: number) {
    const diff = (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED) // 0..1
    const z = this.nextSpawnZ
    const r = this.rng.next()

    if (r < 0.3) {
      // Spike-Reihe über die ganze Breite – immer Lücken zum Ausweichen
      const maxCount = Math.min(World.SPIKE_SLOTS.length - 2, 2 + Math.round(diff * 3))
      const count = 1 + this.rng.int(maxCount)
      const slots = World.SPIKE_SLOTS.slice()
      this.rng.shuffle(slots)
      for (let i = 0; i < count && i < slots.length; i++) this.spawnSpike(slots[i], z)
      if (count < slots.length) this.spawnCrystal(slots[count], z)
    } else if (r < 0.55) {
      // Block(s) -> ausweichen oder überspringen
      const x = this.rng.pick(World.BLOCK_SLOTS)
      this.spawnBlock(x, z)
      if (this.rng.next() < 0.6) this.spawnCrystal(-Math.sign(x || 1) * 3, z)
    } else if (r < 0.72) {
      // Bar -> überspringen
      this.spawnBar(z)
      if (this.rng.next() < 0.5) this.spawnCrystal(this.rng.pick(World.LANES), z + 6)
    } else if (r < 0.86) {
      // Slalom: zwei Blöcke versetzt (jetzt bis zum Rand)
      this.spawnBlock(this.rng.pick([-5.5, -3.5, -1.5]), z)
      this.spawnBlock(this.rng.pick([1.5, 3.5, 5.5]), z + 9)
      this.spawnCrystal(0, z + 4.5)
    } else {
      // Bonus-Reihe: meist normale Kristalle, manchmal goldener Ultra-Bonus
      const lane = this.rng.pick(World.LANES)
      if (this.rng.next() < 0.4) {
        this.spawnCrystal(lane, z + 4, 'ultra')
      } else {
        for (let i = 0; i < 4; i++) this.spawnCrystal(lane, z + i * 4)
      }
    }

    // Seltener Unverwundbarkeits-Stern als Belohnung, etwas hinter dem Hindernis
    if (this.rng.next() < 0.045) {
      this.spawnCrystal(this.rng.pick([-4.5, 0, 4.5]), z + 12, 'star')
    }

    // Abstand zum nächsten Chunk – enger bei höherer Schwierigkeit
    const gap = 26 - diff * 9 + this.rng.next() * 8
    this.nextSpawnZ -= gap
  }

  /** Spawnt so lange voraus, bis genug Strecke vor dem Spieler liegt. */
  fillAhead(playerZ: number, spawnAhead: number, speed: number) {
    while (this.nextSpawnZ > playerZ - spawnAhead) this.generateChunk(speed)
  }

  removeObstacle(i: number) {
    this.scene.remove(this.obstacles[i].mesh)
    this.obstacles.splice(i, 1)
  }

  removeCrystal(i: number) {
    this.scene.remove(this.crystals[i].mesh)
    this.crystals.splice(i, 1)
  }
}
