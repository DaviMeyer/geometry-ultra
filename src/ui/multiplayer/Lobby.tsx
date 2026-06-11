// Lobby — Raum erstellen oder per Code beitreten, Bereit-Status, Host startet.
// Zeigt während der Countdown-Phase einen synchronisierten Countdown.

import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import type { RoomState } from '../../firebase/multiplayer'
import { LoginButton } from '../LoginButton'

interface LobbyProps {
  user: User | null
  room: RoomState | null
  code: string | null
  offset: number
  busy: boolean
  error: string | null
  onCreate: () => void
  onJoin: (code: string) => void
  onLeave: () => void
  onToggleReady: () => void
  onStart: () => void
  onToggleCollision: () => void
  onBack: () => void
}

/** Synchroner Countdown aus der Server-Startzeit (oder null, wenn keiner läuft). */
function useCountdown(startAt: number | undefined, offset: number): number | null {
  const [n, setN] = useState<number | null>(null)
  useEffect(() => {
    if (!startAt) {
      setN(null)
      return
    }
    const tick = () => setN(Math.max(0, Math.ceil((startAt - offset - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [startAt, offset])
  return n
}

export function Lobby(props: LobbyProps) {
  const { user, room, code, offset, busy, error, onCreate, onJoin, onLeave, onToggleReady, onStart, onToggleCollision, onBack } = props
  const [joinCode, setJoinCode] = useState('')
  const countdown = useCountdown(room?.meta.state === 'countdown' ? room.meta.startAt : undefined, offset)

  // ----- nicht angemeldet -----
  if (!user) {
    return (
      <div className="overlay scrollable">
        <h1 className="title">MULTIPLAYER</h1>
        <p className="hint">Zum Spielen im Multiplayer musst du angemeldet sein.</p>
        <LoginButton user={user} />
        <button className="btn secondary" onClick={onBack}>
          Zurück
        </button>
      </div>
    )
  }

  // ----- noch in keinem Raum -----
  if (!room || !code) {
    return (
      <div className="overlay scrollable">
        <h1 className="title">MULTIPLAYER</h1>
        <div className="panel mp-entry">
          <button className="btn" disabled={busy} onClick={onCreate}>
            Raum erstellen
          </button>
          <div className="mp-or">oder</div>
          <div className="mp-join">
            <input
              className="mp-input"
              placeholder="CODE"
              maxLength={4}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            />
            <button className="btn secondary" disabled={busy || joinCode.length < 4} onClick={() => onJoin(joinCode)}>
              Beitreten
            </button>
          </div>
          {error && <div className="mp-error">{error}</div>}
        </div>
        <button className="btn secondary" onClick={onBack}>
          Zurück
        </button>
      </div>
    )
  }

  // ----- Countdown läuft -----
  if (countdown !== null) {
    return (
      <div className="overlay">
        <div className="subtitle">Gleich geht's los…</div>
        <div className="countdown-num">{countdown > 0 ? countdown : 'LOS!'}</div>
      </div>
    )
  }

  // ----- in der Lobby -----
  const players = Object.values(room.players ?? {})
  const isHost = room.meta.host === user.uid
  const me = room.players[user.uid]
  const allReady = players.length > 0 && players.every((p) => p.ready)

  return (
    <div className="overlay scrollable">
      <div className="subtitle">Raum-Code</div>
      <div className="room-code">{code}</div>
      <p className="hint">Teile den Code mit Freunden, damit sie beitreten können.</p>

      <div className="panel mp-players">
        {players.map((p) => (
          <div key={p.uid} className="mp-player">
            {p.photoURL ? <img src={p.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="lb-avatar placeholder" />}
            <span className="mp-player-name">
              {p.name}
              {p.uid === room.meta.host && ' 👑'}
            </span>
            <span className={`mp-ready ${p.ready ? 'on' : 'off'}`}>{p.ready ? 'Bereit' : '…'}</span>
          </div>
        ))}
      </div>

      <div className="collision-row">
        <span>💥 Kollisionsmodus</span>
        {isHost ? (
          <button className={`mp-toggle ${room.meta.collision ? 'on' : 'off'}`} onClick={onToggleCollision}>
            {room.meta.collision ? 'AN' : 'AUS'}
          </button>
        ) : (
          <span className={`mp-toggle ${room.meta.collision ? 'on' : 'off'}`}>{room.meta.collision ? 'AN' : 'AUS'}</span>
        )}
      </div>

      <div className="mode-buttons">
        <button className="btn" onClick={onToggleReady}>
          {me?.ready ? 'Nicht bereit' : 'Bereit'}
        </button>
        {isHost && (
          <button className="btn secondary" disabled={!allReady} onClick={onStart}>
            Rennen starten
          </button>
        )}
      </div>
      {isHost && !allReady && <div className="hint">Warten, bis alle bereit sind…</div>}
      {!isHost && <div className="hint">Der Host startet das Rennen.</div>}

      <button className="link-btn" onClick={onLeave}>
        Raum verlassen
      </button>
    </div>
  )
}
