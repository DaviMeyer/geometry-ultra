// ===========================================================================
// Zentrale Typen, Konstanten und Farben für die Spiel-Engine.
// Bewusst frei von Three.js-Abhängigkeiten, damit es überall importierbar ist.
// ===========================================================================

/** Spielmodi. In Phase A nur "classic", später kommen "daily" und "multiplayer". */
export type GameMode = 'classic' | 'daily' | 'multiplayer'

/** Interner Zustand der Engine-Schleife. */
export type GameState = 'menu' | 'playing' | 'gameover'

/** Ergebnis eines beendeten Laufs (an die React-UI gemeldet). */
export interface RunResult {
  score: number
  distance: number
  mode: GameMode
  seed: number
}

/** Live-Zustand des lokalen Spielers (für Multiplayer-Sync). */
export interface ProgressState {
  x: number
  y: number
  z: number
  alive: boolean
  score: number
}

/** Callbacks, über die die Engine mit React kommuniziert (ohne React zu kennen). */
export interface EngineCallbacks {
  /** HUD-Update: Score, Tempo (%), Turbo-Füllstand (%) und Unverwundbarkeits-Restzeit (s). */
  onScore?: (score: number, speedPercent: number, turboPercent: number, invincibleSec: number) => void
  /** Wird einmal beim Crash aufgerufen. */
  onGameOver?: (result: RunResult) => void
  /** Spieler drückt im GameOver-Zustand Sprung/Enter -> UI soll neu starten. */
  onRestartRequest?: () => void
  /** Mute-Status hat sich geändert (z.B. per Taste M). */
  onMuteChange?: (muted: boolean) => void
  /** Nur im Multiplayer: gedrosselt (~12 Hz) die eigene Position für den Sync. */
  onProgress?: (state: ProgressState) => void
}

// --- Welt-Layout ---
export const TRACK_WIDTH = 14
export const FLOOR_SEG_LEN = 40
export const FLOOR_SEGS = 8

// --- Physik- und Spielkonstanten ---
// LANE_LIMIT reicht bis fast an den Rand: halbe Streckenbreite minus halber Cube.
export const LANE_LIMIT = TRACK_WIDTH / 2 - 0.6 // ≈ 6.4
export const GRAVITY = -38 // Schwerkraft (units/s^2)
export const JUMP_V = 13.5 // Sprungkraft
export const GROUND_Y = 0.6 // Cube-Mittelpunkt am Boden
export const BASE_SPEED = 18 // Start-Vorwärtsgeschwindigkeit (units/s)
export const MAX_SPEED = 46 // Maximalgeschwindigkeit
export const SPEED_RAMP = 0.55 // Beschleunigung pro Sekunde
export const SIDE_SPEED = 16 // seitliche Bewegungsgeschwindigkeit (etwas schneller wegen breiterer Map)
export const SPAWN_AHEAD = 140 // wie weit vorne gespawnt wird
export const DESPAWN_BACK = 18 // hinter Kamera entfernen

// --- Turbo / Boost ---
export const BOOST_MULT = 1.8 // Tempo-Faktor bei aktivem Turbo (Bonus = 0.8)
export const INVINCIBLE_SPEED_BONUS = 0.45 // Zusatz-Tempo im Stern-Modus (weniger als Turbo, stapelbar)
export const TURBO_REGEN = 0.05 // Turbo-Aufladung pro Sekunde (langsam)
export const BOOST_DRAIN = 0.5 // Turbo-Verbrauch pro Sekunde bei aktivem Boost
export const CRYSTAL_TURBO = 0.12 // Turbo durch normalen Kristall
export const ULTRA_TURBO = 0.6 // Turbo durch goldenen Ultra-Bonus
export const INVINCIBLE_TIME = 4 // Sekunden Unverwundbarkeit durch Stern

// --- Effekt-Pools ---
export const TRAIL_N = 26
export const PARTICLE_N = 220

/** Neon-Farbpalette (Hex-Zahlen für Three.js). */
export const COLORS = {
  cyan: 0x00f0ff,
  pink: 0xff2e97,
  purple: 0xb14aff,
  yellow: 0xffe14a,
  green: 0x4dff9e,
  gold: 0xffc83a,
} as const

export type ObstacleType = 'spike' | 'block' | 'bar'

/** Art eines Sammelobjekts. */
export type CrystalKind = 'normal' | 'ultra' | 'star'
