// HUD — Score, Highscore, Tempo-Anzeige, Turbo-Balken und (falls aktiv)
// Unverwundbarkeits-Countdown.

interface HudProps {
  score: number
  best: number
  speedPct: number
  turboPct: number
  invincibleSec: number
}

export function HUD({ score, best, speedPct, turboPct, invincibleSec }: HudProps) {
  return (
    <div className="hud">
      <div className="hud-top">
        <div className="stat score-stat">
          <div className="label">Score</div>
          <div className="value">{score}</div>
        </div>
        <div className="stat best-stat">
          <div className="label">Best</div>
          <div className="value">{best}</div>
        </div>
      </div>

      {invincibleSec > 0 && <div className="invincible-badge">⭐ UNVERWUNDBAR · {invincibleSec}s</div>}

      <div className="hud-bars">
        <div className="hud-bar">
          <div className="hud-bar-track">
            <div className="hud-bar-fill speed" style={{ width: `${Math.max(2, speedPct)}%` }} />
          </div>
          <div className="hud-bar-label">SPEED</div>
        </div>
        <div className="hud-bar">
          <div className="hud-bar-track">
            <div className={`hud-bar-fill turbo${turboPct >= 100 ? ' full' : ''}`} style={{ width: `${turboPct}%` }} />
          </div>
          <div className="hud-bar-label">⚡ TURBO (Shift halten)</div>
        </div>
      </div>
    </div>
  )
}
