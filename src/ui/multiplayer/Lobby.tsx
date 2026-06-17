// Lobby — Raum erstellen oder per Code beitreten, Bereit-Status, Host startet.
// Zeigt während der Countdown-Phase einen synchronisierten Countdown.

import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { isStale, serverNow, type RoomState } from '../../firebase/multiplayer'
import { Avatar } from '../Avatar'
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
  onKick: (uid: string) => void
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
  const { user, room, code, offset, busy, error, onCreate, onJoin, onLeave, onToggleReady, onStart, onToggleCollision, onKick, onBack } = props
  const [joinCode, setJoinCode] = useState('')
  const [copied, setCopied] = useState(false)
  const countdown = useCountdown(room?.meta.state === 'countdown' ? room.meta.startAt : undefined, offset)

  const copyCode = async () => {
    if (!code) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code)
      } else {
        // Fallback für unsichere Kontexte / In-App-WebViews ohne Clipboard-API
        const ta = document.createElement('textarea')
        ta.value = code
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        if (!ok) return
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Kopieren nicht möglich — Code steht weiterhin sichtbar zum Abtippen da
    }
  }

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
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            />
            <button className="btn secondary" disabled={busy || joinCode.length < 4} onClick={() => onJoin(joinCode)}>
              Beitreten
            </button>
          </div>
          {error && <div className="mp-error">{error}</div>}
        </div>
        {/* Bewusst NICHT während busy gesperrt: hängt der Beitritt (Netzstörung),
            muss Zurück erreichbar bleiben. Einen evtl. doch noch durchgehenden
            Beitritt räumt App per Aufräum-Effect wieder ab. */}
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
  // Veraltete Spieler (Tab zu, Verbindung weg) ausblenden — sonst bleiben sie
  // als Karteileichen sichtbar und blockieren "alle bereit".
  const now = serverNow()
  const players = Object.values(room.players ?? {}).filter((p) => !isStale(p, now))
  const isHost = room.meta.host === user.uid
  const me = room.players[user.uid]
  // Multiplayer braucht mindestens zwei (lebende) Spieler — allein gegen
  // niemanden zu starten ergibt keinen Sinn.
  const enoughPlayers = players.length >= 2
  const allReady = players.length > 0 && players.every((p) => p.ready)
  const canStart = enoughPlayers && allReady

  return (
    <div className="overlay scrollable">
      <div className="subtitle">Raum-Code</div>
      <button className="room-code-btn" onClick={copyCode} title="Code kopieren">
        <span className="room-code">{code}</span>
      </button>
      <p className="hint">{copied ? '✓ Code kopiert!' : 'Tippe auf den Code zum Kopieren und teile ihn mit Freunden.'}</p>

      <div className="panel mp-players">
        {players.map((p) => (
          <div key={p.uid} className="mp-player">
            <Avatar url={p.photoURL} className="lb-avatar" />
            <span className="mp-player-name">
              {p.name}
              {p.uid === room.meta.host && ' 👑'}
            </span>
            <span className={`mp-ready ${p.ready ? 'on' : 'off'}`}>{p.ready ? 'Bereit' : '…'}</span>
            {isHost && p.uid !== user.uid && (
              <button className="mp-kick" onClick={() => onKick(p.uid)} title={`${p.name} entfernen`} aria-label={`${p.name} entfernen`}>
                ✕
              </button>
            )}
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
          <button className="btn secondary" disabled={!canStart} onClick={onStart}>
            Rennen starten
          </button>
        )}
      </div>
      {isHost && !enoughPlayers && <div className="hint">Warte auf mindestens einen Mitspieler…</div>}
      {isHost && enoughPlayers && !allReady && <div className="hint">Warten, bis alle bereit sind…</div>}
      {!isHost && <div className="hint">Der Host startet das Rennen.</div>}

      <button className="link-btn" onClick={onLeave}>
        Raum verlassen
      </button>
    </div>
  )
}
