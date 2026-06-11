// StartScreen — Titelbildschirm mit Login, Steuerung, Modus-Auswahl
// (Endlos + Tägliche Challenge) und globaler Bestenliste.

import type { User } from 'firebase/auth'
import type { GameMode } from '../game/types'
import { Leaderboard } from './Leaderboard'
import { LoginButton } from './LoginButton'

interface StartScreenProps {
  onStart: (mode: GameMode) => void
  onMultiplayer: () => void
  user: User | null
  lbRefreshKey: number
}

export function StartScreen({ onStart, onMultiplayer, user, lbRefreshKey }: StartScreenProps) {
  return (
    <div className="overlay scrollable">
      <div className="top-bar">
        <LoginButton user={user} />
      </div>

      <div className="subtitle">3D Neon Runner</div>
      <h1 className="title">GEOMETRY&nbsp;ULTRA</h1>

      <div className="panel">
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

      <Leaderboard refreshKey={lbRefreshKey} highlightUid={user?.uid ?? null} />
    </div>
  )
}
