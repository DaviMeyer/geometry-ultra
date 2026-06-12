// ===========================================================================
// useEngine — React-Brücke zur Spiel-Engine.
//
// Erstellt die Engine einmalig (an einen Container-DIV gebunden) und übersetzt
// ihre Callbacks in React-State. Liefert außerdem die Steuerungs-Funktionen
// (Lauf starten, neu starten, ins Menü, Mute) für die UI.
//
// Im Daily-Modus wird vor dem Start der beste Geist des Tages geladen.
// ===========================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { Engine } from '../game/Engine'
import type { GhostData } from '../game/ghost'
import type { RemoteState } from '../game/remote'
import { dailySeed, randomSeed } from '../game/rng'
import type { GameMode, ProgressState, ProximityInfo, RunResult } from '../game/types'
import { fetchDailyGhost } from '../firebase/ghosts'

const BEST_KEY = 'geometryUltraBest'

// localStorage kann komplett fehlen/werfen (Safari "Alle Cookies blockieren",
// manche In-App-WebViews). Das darf weder den ersten Render noch die
// Render-Loop (onGameOver) töten -> defensiv kapseln.
function readBest(): number {
  try {
    return parseInt(localStorage.getItem(BEST_KEY) || '0', 10)
  } catch {
    return 0
  }
}
function writeBest(score: number) {
  try {
    localStorage.setItem(BEST_KEY, String(score))
  } catch {
    // kein Storage verfügbar — Bestwert lebt dann nur im State
  }
}

export type UiState = 'menu' | 'playing' | 'gameover'

export function useEngine() {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const modeRef = useRef<GameMode>('classic')
  const progressHandlerRef = useRef<((s: ProgressState) => void) | null>(null)

  const [uiState, setUiState] = useState<UiState>('menu')
  const [score, setScore] = useState(0)
  const [speedPct, setSpeedPct] = useState(0)
  const [turboPct, setTurboPct] = useState(0)
  const [invincibleSec, setInvincibleSec] = useState(0)
  const [best, setBest] = useState(readBest)
  const [isNewBest, setIsNewBest] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [lastGhost, setLastGhost] = useState<GhostData | null>(null)
  const [muted, setMuted] = useState(false)
  const [flashKey, setFlashKey] = useState(0)
  const [proximity, setProximity] = useState<ProximityInfo | null>(null)

  /**
   * Startet einen Lauf. Seed: im Daily aus dem Datum, im Multiplayer per
   * seedOverride (Raum-Seed), sonst zufällig. Geister nur im Daily.
   */
  const beginRun = useCallback(async (mode: GameMode, seedOverride?: number, spawnX = 0) => {
    const engine = engineRef.current
    if (!engine) return
    const seed = seedOverride ?? (mode === 'daily' ? dailySeed() : randomSeed())
    modeRef.current = mode

    let ghosts: GhostData[] = []
    if (mode === 'daily') {
      try {
        const g = await fetchDailyGhost(seed)
        if (g) ghosts = [g]
      } catch (e) {
        console.warn('Tages-Geist konnte nicht geladen werden:', e)
      }
    }

    engine.setGhosts(ghosts)
    engine.start(seed, mode, spawnX)
    setScore(0)
    setSpeedPct(0)
    setTurboPct(0)
    setInvincibleSec(0)
    setLastGhost(null)
    setProximity(null)
    setUiState('playing')
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const engine = new Engine(containerRef.current, {
      onScore: (s, pct, turbo, inv) => {
        setScore(s)
        setSpeedPct(pct)
        setTurboPct(turbo)
        setInvincibleSec(inv)
      },
      onGameOver: (r) => {
        const prevBest = readBest()
        const newBest = r.score > prevBest
        if (newBest) writeBest(r.score)
        setBest(Math.max(prevBest, r.score))
        setIsNewBest(newBest)
        setResult(r)
        setLastGhost(engine.getLastGhost())
        setFlashKey((k) => k + 1) // löst Crash-Flash aus
        setUiState('gameover')
      },
      onRestartRequest: () => {
        // Im Multiplayer kein Sofort-Neustart per Taste (Ablauf steuert die Lobby)
        if (modeRef.current !== 'multiplayer') void beginRun(modeRef.current)
      },
      onMuteChange: (m) => setMuted(m),
      onProgress: (s) => progressHandlerRef.current?.(s),
      onProximity: (info) => setProximity(info),
    })
    engineRef.current = engine
    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [beginRun])

  const toMenu = useCallback(() => {
    engineRef.current?.toMenu()
    setUiState('menu')
  }, [])

  const toggleMute = useCallback(() => {
    const next = !muted
    setMuted(next)
    engineRef.current?.setMuted(next)
  }, [muted])

  /** Setzt den Handler, der die eigene Position empfängt (Multiplayer-Sync). */
  const setProgressHandler = useCallback((fn: ((s: ProgressState) => void) | null) => {
    progressHandlerRef.current = fn
  }, [])

  /** Aktualisiert die Mitspieler-Cubes (Multiplayer). */
  const updateRemote = useCallback((states: RemoteState[]) => {
    engineRef.current?.updateRemotePlayers(states)
  }, [])

  /** Schaltet den Zuschauer-Modus (Kamera folgt führendem Mitspieler). */
  const setSpectating = useCallback((on: boolean) => {
    engineRef.current?.setSpectating(on)
  }, [])

  /** Schaltet den Kollisionsmodus (Bumper) in der Engine. */
  const setCollisionMode = useCallback((on: boolean) => {
    engineRef.current?.setCollisionMode(on)
  }, [])

  /** Server-Zeit-Offset für die Mitspieler-Extrapolation (Multiplayer). */
  const setServerOffset = useCallback((offset: number) => {
    engineRef.current?.setServerOffset(offset)
  }, [])

  return {
    containerRef,
    uiState,
    score,
    speedPct,
    turboPct,
    invincibleSec,
    best,
    isNewBest,
    result,
    lastGhost,
    muted,
    flashKey,
    proximity,
    beginRun,
    toMenu,
    toggleMute,
    setProgressHandler,
    updateRemote,
    setSpectating,
    setCollisionMode,
    setServerOffset,
  }
}
