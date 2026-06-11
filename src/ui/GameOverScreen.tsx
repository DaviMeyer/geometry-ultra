// GameOverScreen — Crash-Bildschirm mit Endstand, Speicher-Status, Login
// (falls nötig), Neustart/Menü und passender Bestenliste (global oder täglich).

import type { User } from 'firebase/auth'
import type { GameMode } from '../game/types'
import { Leaderboard } from './Leaderboard'
import { LoginButton } from './LoginButton'

interface GameOverScreenProps {
  score: number
  best: number
  isNewBest: boolean
  mode: GameMode
  seed: number
  user: User | null
  saveStatus: string | null
  lbRefreshKey: number
  onRetry: () => void
  onMenu: () => void
}

export function GameOverScreen({ score, best, isNewBest, mode, seed, user, saveStatus, lbRefreshKey, onRetry, onMenu }: GameOverScreenProps) {
  const isDaily = mode === 'daily'

  return (
    <div className="overlay fade-in scrollable">
      <h1 className="go-title">CRASH!</h1>
      {isDaily && <div className="subtitle">Tägliche Challenge</div>}
      {isNewBest && <div className="newbest">★ NEUER REKORD ★</div>}

      <div className="go-stats">
        <div>
          <div className="big" style={{ color: '#fff' }}>
            {score}
          </div>
          <div className="cap">Score</div>
        </div>
        <div>
          <div className="big" style={{ color: 'var(--neon-pink)' }}>
            {best}
          </div>
          <div className="cap">Best (gesamt)</div>
        </div>
      </div>

      {saveStatus && <div className="save-status">{saveStatus}</div>}
      {!user && <LoginButton user={user} />}

      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn" onClick={onRetry}>
          Nochmal
        </button>
        <button className="btn secondary" onClick={onMenu}>
          Menü
        </button>
      </div>

      {isDaily ? (
        <Leaderboard mode="daily" seed={seed} refreshKey={lbRefreshKey} highlightUid={user?.uid ?? null} />
      ) : (
        <Leaderboard mode="global" refreshKey={lbRefreshKey} highlightUid={user?.uid ?? null} />
      )}

      <div className="hint">
        Drücke <span className="key">␣</span> oder <span className="key">Enter</span> für Neustart
      </div>
    </div>
  )
}
