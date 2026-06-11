// ===========================================================================
// InputManager — bündelt Tastatur- und Touch-Eingaben. Liefert die seitliche
// Richtung (getSideInput) und ruft Callbacks für Sprung/Dash/Neustart/Mute.
// Die Engine setzt die Callbacks; so bleibt die Eingabe von der Spiellogik
// getrennt.
// ===========================================================================

export interface InputCallbacks {
  onJump: () => void
  onRestart: () => void
  onMute: () => void
}

export class InputManager {
  private keys: Record<string, boolean> = {}
  private touchTargetDir = 0
  private touchStartX: number | null = null
  private touchMoved = false
  private canvas: HTMLElement | null = null

  constructor(private cb: InputCallbacks) {}

  attach(canvas: HTMLElement) {
    this.canvas = canvas
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
  }

  detach() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.onPointerDown)
      this.canvas.removeEventListener('pointermove', this.onPointerMove)
      this.canvas.removeEventListener('pointerup', this.onPointerUp)
    }
  }

  /** -1 (links), 0 (neutral) oder +1 (rechts). */
  getSideInput(): number {
    let s = 0
    if (this.keys['a'] || this.keys['arrowleft']) s -= 1
    if (this.keys['d'] || this.keys['arrowright']) s += 1
    if (this.touchTargetDir !== 0) s = this.touchTargetDir
    return s
  }

  /** Ob der Turbo gerade gehalten wird (Shift). */
  isBoosting(): boolean {
    return !!this.keys['shift']
  }

  reset() {
    this.keys = {}
    this.touchTargetDir = 0
    this.touchStartX = null
    this.touchMoved = false
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return
    const k = e.key.toLowerCase()
    this.keys[k] = true
    if (k === ' ' || k === 'arrowup' || k === 'w') {
      e.preventDefault()
      this.cb.onJump()
    }
    if (k === 'enter') this.cb.onRestart()
    if (k === 'm') this.cb.onMute()
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.key.toLowerCase()] = false
  }

  private onPointerDown = (e: PointerEvent) => {
    this.touchStartX = e.clientX
    this.touchMoved = false
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.touchStartX === null) return
    const dx = e.clientX - this.touchStartX
    if (Math.abs(dx) > 20) {
      this.touchMoved = true
      this.touchTargetDir = Math.sign(dx)
    }
  }

  private onPointerUp = () => {
    if (!this.touchMoved) this.cb.onJump() // Tap = Sprung
    this.touchStartX = null
    this.touchTargetDir = 0
  }
}
