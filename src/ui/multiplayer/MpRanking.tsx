// MpRanking — kompakte Live-Rangliste, die während des gesamten Multiplayer-
// Rennens oben eingeblendet wird. Liest direkt aus dem Raum-Zustand und
// aktualisiert sich mit jedem Netzwerk-Update.

import type { RoomState } from '../../firebase/multiplayer'

interface Props {
  room: RoomState | null
  uid: string | null
}

const effScore = (p: { finished?: boolean; finalScore?: number; score?: number }) => (p.finished ? (p.finalScore ?? 0) : (p.score ?? 0))

export function MpRanking({ room, uid }: Props) {
  if (!room) return null
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
