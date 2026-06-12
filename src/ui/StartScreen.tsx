// StartScreen — Titelbildschirm mit Login, Steuerung, Modus-Auswahl
// (Endlos + Tägliche Challenge) und globaler Bestenliste.

import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { dailySeed } from '../game/rng'
import type { GameMode } from '../game/types'
import { IS_TOUCH } from './HUD'
import { Leaderboard } from './Leaderboard'
import { LoginButton } from './LoginButton'

/** Heutiger Tages-Seed, der auch über UTC-Mitternacht hinweg aktuell bleibt. */
function useDailySeed(): number {
  const [seed, setSeed] = useState(dailySeed)
  useEffect(() => {
    const id = setInterval(() => {
      const now = dailySeed()
      setSeed((s) => (s === now ? s : now))
    }, 60_000)
    return () => clearInterval(id)
  }, [])
  return seed
}

interface StartScreenProps {
  onStart: (mode: GameMode) => void
  onMultiplayer: () => void
  user: User | null
  lbRefreshKey: number
  onNameChange?: () => void
}

export function StartScreen({ onStart, onMultiplayer, user, lbRefreshKey, onNameChange }: StartScreenProps) {
  const seedToday = useDailySeed()
  return (
    <div className="overlay scrollable">
      <div className="top-bar">
        <LoginButton user={user} onNameChange={onNameChange} />
      </div>

      <div className="subtitle">3D Neon Runner</div>
      <h1 className="title">GEOMETRY&nbsp;ULTRA</h1>

      <div className="panel">
        {IS_TOUCH ? (
          <div className="controls-grid">
            <span>
              <span className="key">👆 Tippen</span>
            </span>
            <span>Springen (2× tippen = Doppelsprung)</span>
            <span>
              <span className="key">👉 Wischen</span>
            </span>
            <span>Seitlich lenken (Finger halten)</span>
            <span>
              <span className="key">✌️ 2. Finger</span>
            </span>
            <span>Turbo: zweiten Finger aufs Display halten (oder ⚡-Button)</span>
          </div>
        ) : (
          <div className="controls-grid">
            <span>
              <span className="key">␣</span> / <span className="key">↑</span> / Klick
            </span>
            <span>Springen (Doppelsprung möglich)</span>
            <span>
              <span className="key">A</span> <span className="key">D</span> / <span className="key">←</span> <span className="key">→</span>
            </span>
            <span>Seitlich ausweichen</span>
            <span>
              <span className="key">⇧ Shift</span>
            </span>
            <span>Turbo (halten, lädt sich auf)</span>
          </div>
        )}
      </div>

      <div className="mode-buttons">
        <button className="btn" onClick={() => onStart('classic')}>
          Endlos-Modus
        </button>
        <button className="btn secondary" onClick={() => onStart('daily')}>
          📅 Tägliche Challenge
        </button>
        <button className="btn secondary" onClick={onMultiplayer}>
          👥 Multiplayer
        </button>
      </div>
      <div className="hint">Tägliche Challenge: gleiches Level für alle · tritt gegen den Tages-Geist an 👻</div>
      <div className="hint">💎 Kristalle laden den Turbo · 🟡 Ultra-Bonus füllt ihn stark · ⭐ Stern = 4 Sek. unverwundbar</div>

      {/* Beide Bestenlisten nebeneinander — klar getrennt nach Modus */}
      <div className="lb-duo">
        <Leaderboard refreshKey={lbRefreshKey} highlightUid={user?.uid ?? null} />
        <Leaderboard mode="daily" seed={seedToday} refreshKey={lbRefreshKey} highlightUid={user?.uid ?? null} />
      </div>
    </div>
  )
}
