// ===========================================================================
// AudioEngine — synthetischer Sound über die WebAudio-API (keine Dateien).
// Portiert aus dem ursprünglichen `audio`-Objekt; `beat()` bekommt jetzt das
// Tempo als Parameter, statt globale Variablen zu lesen.
// ===========================================================================

import { BASE_SPEED } from './types'

type OscType = OscillatorType

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  muted = false
  private beatTimer = 0
  private beatStep = 0

  /** Muss nach einer Nutzerinteraktion aufgerufen werden (Autoplay-Policy). */
  init() {
    if (this.ctx) return
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.5
    this.master.connect(this.ctx.destination)
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private tone(freq: number, dur: number, type: OscType = 'square', vol = 0.3, slideTo: number | null = null) {
    if (!this.ctx || !this.master || this.muted) return
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    g.connect(this.master)
    o.start(t)
    o.stop(t + dur)
  }

  jump() {
    this.tone(420, 0.18, 'square', 0.25, 720)
  }
  /** Cartooniges "Boing" für den Bumper-Zusammenstoß im Kollisionsmodus. */
  bounce() {
    this.tone(420, 0.22, 'sine', 0.32, 120)
    setTimeout(() => this.tone(150, 0.18, 'triangle', 0.22, 360), 70)
  }
  dbljump() {
    this.tone(560, 0.16, 'square', 0.22, 900)
  }
  coin() {
    this.tone(880, 0.08, 'sine', 0.3, 1320)
    setTimeout(() => this.tone(1320, 0.09, 'sine', 0.25), 60)
  }
  /** Goldener Ultra-Bonus: glänzender, voller Klang. */
  ultraCoin() {
    this.tone(1046, 0.1, 'triangle', 0.3, 1568)
    setTimeout(() => this.tone(1568, 0.12, 'triangle', 0.28, 2093), 70)
    setTimeout(() => this.tone(2093, 0.14, 'sine', 0.22), 150)
  }
  /** Stern eingesammelt: kurze, triumphale Power-Melodie (wie ein Mario-Stern). */
  powerMelody() {
    const seq = [523, 659, 784, 1046, 784, 1046, 1318]
    seq.forEach((f, i) => setTimeout(() => this.tone(f, 0.14, 'square', 0.26), i * 110))
  }
  /** Hindernis im Unverwundbarkeits-Modus zerschmettert. */
  smash() {
    this.tone(300, 0.12, 'square', 0.25, 80)
    this.tone(900, 0.08, 'sawtooth', 0.15, 200)
  }
  dash() {
    this.tone(180, 0.25, 'sawtooth', 0.2, 520)
  }
  crash() {
    if (!this.ctx || this.muted) return
    this.tone(160, 0.5, 'sawtooth', 0.35, 40)
    this.tone(90, 0.6, 'square', 0.3, 30)
  }

  /** Treibender Beat; Tempo steuert die BPM. Nur aufrufen, wenn gespielt wird. */
  beat(dt: number, speed: number) {
    if (!this.ctx || this.muted) return
    this.beatTimer -= dt
    if (this.beatTimer <= 0) {
      const bpm = 128 + (speed - BASE_SPEED) * 1.2
      this.beatTimer = 60 / bpm / 2 // Achtel
      this.beatStep = (this.beatStep + 1) % 8
      if (this.beatStep % 4 === 0) this.tone(55, 0.14, 'sine', 0.5, 38) // Kick
      const notes = [110, 110, 165, 110, 130, 110, 196, 165]
      this.tone(notes[this.beatStep], 0.12, 'triangle', 0.12) // Bass
      if (this.beatStep % 2 === 1) this.tone(8000, 0.03, 'square', 0.04) // HiHat
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted
    return this.muted
  }
}
