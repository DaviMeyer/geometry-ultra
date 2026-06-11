// ===========================================================================
// Statischer Szenen-Aufbau: Renderer, Szene, Kamera, Licht, Sternenfeld und
// die recycelbaren Boden-Segmente. Liefert ein Bündel an Referenzen zurück,
// das die Engine weiterverwendet.
// ===========================================================================

import * as THREE from 'three'
import { COLORS, FLOOR_SEG_LEN, FLOOR_SEGS, TRACK_WIDTH } from './types'

export interface SceneBundle {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  rimCyan: THREE.PointLight
  rimPink: THREE.PointLight
  playerGlow: THREE.PointLight
  floorSegments: THREE.Group[]
}

export function createScene(canvas: HTMLCanvasElement): SceneBundle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x06020f)
  scene.fog = new THREE.FogExp2(0x0a0420, 0.012)

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 600)

  // --- Licht ---
  scene.add(new THREE.AmbientLight(0x4422aa, 0.6))

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9)
  keyLight.position.set(8, 26, 10)
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(1024, 1024)
  keyLight.shadow.camera.near = 1
  keyLight.shadow.camera.far = 80
  keyLight.shadow.camera.left = -20
  keyLight.shadow.camera.right = 20
  keyLight.shadow.camera.top = 20
  keyLight.shadow.camera.bottom = -20
  scene.add(keyLight)

  const rimCyan = new THREE.PointLight(COLORS.cyan, 1.1, 60)
  rimCyan.position.set(-12, 6, -10)
  scene.add(rimCyan)

  const rimPink = new THREE.PointLight(COLORS.pink, 1.1, 60)
  rimPink.position.set(12, 6, -20)
  scene.add(rimPink)

  // Licht, das mit dem Spieler mitfährt
  const playerGlow = new THREE.PointLight(COLORS.cyan, 1.6, 22)
  scene.add(playerGlow)

  buildStarfield(scene)
  const floorSegments = buildFloor(scene)

  return { renderer, scene, camera, rimCyan, rimPink, playerGlow, floorSegments }
}

// --- Sternenfeld (rein kosmetisch -> Math.random ist hier ok) ---
function buildStarfield(scene: THREE.Scene) {
  const g = new THREE.BufferGeometry()
  const n = 900
  const pos = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 400
    pos[i * 3 + 1] = Math.random() * 140 + 6
    pos[i * 3 + 2] = -Math.random() * 600
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const m = new THREE.PointsMaterial({ color: 0x9d7bff, size: 0.9, transparent: true, opacity: 0.8 })
  const stars = new THREE.Points(g, m)
  stars.frustumCulled = false
  scene.add(stars)
}

// --- Boden: mehrere Segmente, die nach vorne recycelt werden ---
function makeFloorSegment(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group()

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_WIDTH, FLOOR_SEG_LEN),
    new THREE.MeshStandardMaterial({ color: 0x10082a, metalness: 0.6, roughness: 0.35 }),
  )
  plane.rotation.x = -Math.PI / 2
  plane.receiveShadow = true
  group.add(plane)

  const grid = new THREE.GridHelper(FLOOR_SEG_LEN, 10, COLORS.purple, 0x2a1060)
  grid.position.y = 0.02
  grid.scale.x = TRACK_WIDTH / FLOOR_SEG_LEN
  group.add(grid)

  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.6, FLOOR_SEG_LEN),
      new THREE.MeshStandardMaterial({
        color: side < 0 ? COLORS.cyan : COLORS.pink,
        emissive: side < 0 ? COLORS.cyan : COLORS.pink,
        emissiveIntensity: 1.4,
        metalness: 0.4,
        roughness: 0.2,
      }),
    )
    edge.position.set(side * (TRACK_WIDTH / 2 + 0.1), 0.3, 0)
    group.add(edge)
  }

  scene.add(group)
  return group
}

function buildFloor(scene: THREE.Scene): THREE.Group[] {
  const segments: THREE.Group[] = []
  for (let i = 0; i < FLOOR_SEGS; i++) {
    const seg = makeFloorSegment(scene)
    seg.position.z = -i * FLOOR_SEG_LEN + FLOOR_SEG_LEN
    segments.push(seg)
  }
  return segments
}
