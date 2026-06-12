// MpRanking — kompakte Live-Rangliste, die während des gesamten Multiplayer-
// Rennens oben eingeblendet wird. Liest direkt aus dem Raum-Zustand und
// aktualisiert sich mit jedem Netzwerk-Update.
//
// Der eigene Score ist lokal quasi-frisch, der der Gegner aber 100-300 ms alt —
// ohne Korrektur zeigt deshalb JEDER Client sich selbst vorne. Daher wird der
// Gegner-Score per Dead Reckoning (score + vz * Alter) hochgerechnet.

import type { RoomState } from '../../firebase/multiplayer'

interface Props {
  room: RoomState | null
  uid: string | null
  /** Server-Zeit-Offset (Server-Zeit ≈ Date.now() + offset). */
  offset: number
}

export function MpRanking({ room, uid, offset }: Props) {
  if (!room) return null
  const now = Date.now() + offset
  const effScore = (p: { finished?: boolean; finalScore?: number; score?: number; t?: number; vz?: number }) => {
    if (p.finished) return p.finalScore ?? 0
    const base = p.score ?? 0
    if (typeof p.t !== 'number' || !p.vz) return base
    const age = Math.max(0, Math.min(0.5, (now - p.t) / 1000))
    return Math.floor(base + p.vz * age)
  }
  const players = Object.values(room.players ?? {}).sort((a, b) => effScore(b) - effScore(a))
  if (players.length === 0) return null

  return (
    <div className="mp-ranking">
      {players.map((p, i) => (
        <div key={p.uid} className={`mp-rank-row${p.uid === uid ? ' me' : ''}`}>
          <span className="mp-rank-pos">{i + 1}</span>
          <span className="mp-rank-name">
            {p.name} {p.finished ? '💥' : ''}
          </span>
          <span className="mp-rank-score">{effScore(p)}</span>
        </div>
      ))}
    </div>
  )
}
