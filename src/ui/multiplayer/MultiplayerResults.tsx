// MultiplayerResults — nach dem eigenen Crash.
//  - Solange noch jemand fährt: kompaktes Zuschauer-Overlay (lässt die 3D-Szene
//    sichtbar, denn die Kamera folgt dem führenden Mitspieler).
//  - Sobald alle durch sind: voller Endstand mit Rangliste.
// Spieler, die seit längerem nichts mehr senden (Tab zu/Verbindung weg), werden
// wie ausgeschieden behandelt — sonst würde der Endstand nie erscheinen.

import type { User } from 'firebase/auth'
import { isStale, type RoomState } from '../../firebase/multiplayer'
import { Avatar } from '../Avatar'

interface Props {
  room: RoomState | null
  user: User | null
  /** Server-Zeit-Offset (Server-Zeit ≈ Date.now() + offset). */
  offset: number
  onRematch: () => void
  onLeave: () => void
}

const effScore = (p: { finished?: boolean; finalScore?: number; score?: number }) => (p.finished ? (p.finalScore ?? 0) : (p.score ?? 0))

export function MultiplayerResults({ room, user, offset, onRematch, onLeave }: Props) {
  if (!room) {
    return (
      <div className="overlay">
        <div className="subtitle">Raum geschlossen</div>
        <button className="btn" onClick={onLeave}>
          Zum Menü
        </button>
      </div>
    )
  }

  const now = Date.now() + offset
  const done = (p: Parameters<typeof isStale>[0]) => p.finished || isStale(p, now, room.meta.startAt)
  const players = Object.values(room.players ?? {}).sort((a, b) => effScore(b) - effScore(a))
  const allFinished = players.length > 0 && players.every(done)
  const isHost = room.meta.host === user?.uid
  const medals = ['🥇', '🥈', '🥉']

  // ----- Zuschauer-Modus (noch fährt jemand) -----
  if (!allFinished) {
    const leader = players.find((p) => !done(p))
    return (
      <div className="spectate-overlay">
        <div className="spectate-card">
          <div className="spectate-title">💥 Du bist raus — du schaust zu 👀</div>
          {leader && <div className="spectate-sub">Verfolge: {leader.name}</div>}
          <ol className="lb-list compact">
            {players.map((p, i) => (
              <li key={p.uid} className={`lb-row${p.uid === user?.uid ? ' me' : ''}`}>
                <span className="lb-rank">{i + 1}</span>
                <span className="lb-name">
                  {p.name} {p.finished ? '💥' : isStale(p, now, room.meta.startAt) ? '📴' : '🏃'}
                </span>
                <span className="lb-score">{effScore(p)}</span>
              </li>
            ))}
          </ol>
          <button className="link-btn" onClick={onLeave}>
            Zum Menü
          </button>
        </div>
      </div>
    )
  }

  // ----- Endstand (alle durch) -----
  return (
    <div className="overlay fade-in scrollable">
      <h1 className="go-title">ENDSTAND</h1>

      <div className="leaderboard">
        <div className="lb-title">🏁 Rangliste</div>
        <ol className="lb-list">
          {players.map((p, i) => (
            <li key={p.uid} className={`lb-row${p.uid === user?.uid ? ' me' : ''}`}>
              <span className="lb-rank">{i < 3 ? medals[i] : i + 1}</span>
              <Avatar url={p.photoURL} className="lb-avatar" />
              <span className="lb-name">{p.name}</span>
              <span className="lb-score">{effScore(p)}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mode-buttons">
        {isHost && (
          <button className="btn" onClick={onRematch}>
            Revanche
          </button>
        )}
        <button className="btn secondary" onClick={onLeave}>
          Zum Menü
        </button>
      </div>
      {!isHost && <div className="hint">Der Host kann eine Revanche starten — dann geht's für alle zurück in die Lobby.</div>}
    </div>
  )
}
