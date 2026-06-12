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

/** Events aus Eingabefeldern (z.B. Raumcode-Input) gehören nicht dem Spiel. */
function isEditableTarget(e: Event): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

export class InputManager {
  private keys: Record<string, boolean> = {}
  private touchTargetDir = 0
  private touchStartX: number | null = null
  private touchMoved = false
  private touchBoost = false // gehaltener TURBO-Button (Mobile)
  // Multi-Touch: der ERSTE Finger lenkt/springt, jeder ZUSÄTZLICHE Finger
  // wirkt als gehaltener Turbo ("zweiter Finger = Gas geben").
  private steerPointerId: number | null = null
  private activePointers = new Set<number>()
  private boostPointers = new Set<number>() // Finger einer 2-Finger-Geste springen beim Loslassen nicht
  private canvas: HTMLElement | null = null

  constructor(private cb: InputCallbacks) {}

  attach(canvas: HTMLElement) {
    this.canvas = canvas
    // Browser-Gesten (Scroll/Pan/Doppeltipp-Zoom) auf dem Spielfeld unterbinden,
    // sonst beendet der Browser Wischgesten mit pointercancel.
    canvas.style.touchAction = 'none'
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onWindowBlur)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerCancel)
    canvas.addEventListener('lostpointercapture', this.onPointerCancel)
  }

  detach() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onWindowBlur)
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.onPointerDown)
      this.canvas.removeEventListener('pointermove', this.onPointerMove)
      this.canvas.removeEventListener('pointerup', this.onPointerUp)
      this.canvas.removeEventListener('pointercancel', this.onPointerCancel)
      this.canvas.removeEventListener('lostpointercapture', this.onPointerCancel)
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

  /** Ob der Turbo gerade gehalten wird (Shift, Touch-Button oder zweiter Finger). */
  isBoosting(): boolean {
    return !!this.keys['shift'] || this.touchBoost || this.activePointers.size >= 2
  }

  /** Mobile: TURBO-Button wird gehalten/losgelassen. */
  setTouchBoost(on: boolean) {
    this.touchBoost = on
  }

  reset() {
    this.keys = {}
    this.touchTargetDir = 0
    this.touchStartX = null
    this.touchMoved = false
    this.touchBoost = false
    this.steerPointerId = null
    this.activePointers.clear()
    this.boostPointers.clear()
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat || isEditableTarget(e)) return
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
    if (isEditableTarget(e)) return
    this.keys[e.key.toLowerCase()] = false
  }

  private onWindowBlur = () => {
    // Fokusverlust (Alt-Tab, Overlay): gedrückte Tasten/Gesten nicht hängen lassen
    this.keys = {}
    this.touchTargetDir = 0
    this.touchStartX = null
    this.touchBoost = false
    this.steerPointerId = null
    this.activePointers.clear()
    this.boostPointers.clear()
  }

  private onPointerDown = (e: PointerEvent) => {
    this.activePointers.add(e.pointerId)
    // move/up auch außerhalb des Canvas weiterbekommen (Maus zieht raus etc.)
    try {
      ;(e.target as Element | null)?.setPointerCapture?.(e.pointerId)
    } catch {
      // ältere Browser ohne Pointer Capture — unkritisch
    }
    if (this.steerPointerId === null) {
      // erster Finger: lenkt und springt
      this.steerPointerId = e.pointerId
      this.touchStartX = e.clientX
      this.touchMoved = false
      this.touchTargetDir = 0
    }
    if (this.activePointers.size >= 2) {
      // Zwei-Finger-Geste = Turbo: keiner der beteiligten Finger darf beim
      // Loslassen einen Sprung auslösen
      for (const id of this.activePointers) this.boostPointers.add(id)
    }
  }

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.steerPointerId || this.touchStartX === null) return
    const dx = e.clientX - this.touchStartX
    if (Math.abs(dx) > 20) {
      this.touchMoved = true
      this.touchTargetDir = Math.sign(dx)
    }
  }

  private onPointerUp = (e: PointerEvent) => {
    const wasBoostFinger = this.boostPointers.delete(e.pointerId)
    this.activePointers.delete(e.pointerId)
    if (e.pointerId !== this.steerPointerId) return // Boost-Finger losgelassen — fertig
    if (this.touchStartX !== null && !this.touchMoved && !wasBoostFinger) this.cb.onJump() // Tap = Sprung
    this.steerPointerId = null
    this.touchStartX = null
    this.touchTargetDir = 0
  }

  private onPointerCancel = (e: PointerEvent) => {
    // Geste vom Browser/System abgebrochen: KEIN Sprung, Richtung loslassen —
    // sonst driftet der Cube dauerhaft zur Seite.
    this.boostPointers.delete(e.pointerId)
    this.activePointers.delete(e.pointerId)
    if (e.pointerId === this.steerPointerId) {
      this.steerPointerId = null
      this.touchStartX = null
      this.touchTargetDir = 0
      this.touchMoved = false
    }
  }
}
