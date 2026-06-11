// ===========================================================================
// ParticleSystem — kleiner Pool aus Würfel-Partikeln für Explosionen, Sprünge
// und das Einsammeln von Kristallen. Wiederverwendung statt ständig neu zu
// erzeugen (Pooling). Partikel sind rein kosmetisch -> Math.random ist ok.
// ===========================================================================

import * as THREE from 'three'
import { GRAVITY, PARTICLE_N } from './types'

interface Particle {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>
  vx: number
  vy: number
  vz: number
  life: number
  max: number
}

export class ParticleSystem {
  private particles: Particle[] = []
  private idx = 0

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.28, 0.28, 0.28)
    for (let i = 0; i < PARTICLE_N; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true }))
      mesh.visible = false
      scene.add(mesh)
      this.particles.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, max: 1 })
    }
  }

  /** Erzeugt eine Explosion aus `count` Partikeln am Punkt (x,y,z). */
  burst(x: number, y: number, z: number, color: number, count: number, power: number) {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.idx]
      this.idx = (this.idx + 1) % PARTICLE_N
      p.mesh.visible = true
      p.mesh.material.color.setHex(color)
      p.mesh.position.set(x, y, z)
      const a = Math.random() * Math.PI * 2
      const up = Math.random() * power
      const sp = (0.4 + Math.random()) * power
      p.vx = Math.cos(a) * sp
      p.vz = Math.sin(a) * sp
      p.vy = up
      p.life = p.max = 0.5 + Math.random() * 0.5
      const s = 0.6 + Math.random()
      p.mesh.scale.set(s, s, s)
    }
  }

  update(dt: number) {
    for (const p of this.particles) {
      if (p.life <= 0) {
        if (p.mesh.visible) p.mesh.visible = false
        continue
      }
      p.life -= dt
      p.vy += GRAVITY * 0.5 * dt
      p.mesh.position.x += p.vx * dt
      p.mesh.position.y += p.vy * dt
      p.mesh.position.z += p.vz * dt
      const f = Math.max(0, p.life / p.max)
      p.mesh.material.opacity = f
      p.mesh.scale.setScalar(f * 1.2)
      if (p.life <= 0) p.mesh.visible = false
    }
  }

  reset() {
    for (const p of this.particles) {
      p.mesh.visible = false
      p.life = 0
    }
  }
}
