// HUD — Score, Highscore, Tempo-Anzeige, Turbo-Balken, (falls aktiv)
// Unverwundbarkeits-Countdown, die Abstandsanzeige zum nächsten Gegner
// (Multiplayer) bzw. Tages-Geist (Daily) und auf Touch-Geräten der
// gehaltene TURBO-Button (Shift gibt es dort nicht).

import type { ProximityInfo } from '../game/types'

/** Grobe Zeiger = Touch-Gerät (Handy/Tablet). */
export const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

interface HudProps {
  score: number
  best: number
  speedPct: number
  turboPct: number
  invincibleSec: number
  proximity?: ProximityInfo | null
  /** TURBO-Button gehalten/losgelassen (Mobile). */
  onBoost?: (on: boolean) => void
}

function proximityText(p: ProximityInfo): string {
  if (p.meters === 0) return `⚡ ${p.name} ist direkt neben dir!`
  return p.ahead ? `🔺 ${p.name} ist ${p.meters} m vor dir` : `🔻 ${p.name} ist ${p.meters} m hinter dir`
}

export function HUD({ score, best, speedPct, turboPct, invincibleSec, proximity = null, onBoost }: HudProps) {
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

      {proximity && <div className={`proximity-line${proximity.ahead ? ' behind' : ' leading'}`}>{proximityText(proximity)}</div>}

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
          <div className="hud-bar-label">{IS_TOUCH ? '⚡ TURBO (2. Finger halten)' : '⚡ TURBO (Shift halten)'}</div>
        </div>
      </div>

      {/* Touch: TURBO halten — Füllstand läuft als Pegel im Button mit */}
      {IS_TOUCH && onBoost && (
        <button
          className="turbo-btn"
          style={{ ['--fill' as string]: `${turboPct}%` }}
          onPointerDown={(e) => {
            e.preventDefault()
            onBoost(true)
          }}
          onPointerUp={() => onBoost(false)}
          onPointerCancel={() => onBoost(false)}
          onPointerLeave={() => onBoost(false)}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Turbo halten"
        >
          ⚡
        </button>
      )}
    </div>
  )
}
