// LoginButton — zeigt entweder den "Mit Google anmelden"-Button oder, wenn
// angemeldet, den Nutzer (Bild + Name) mit Abmelden-Option.
// Über das ✏️ lässt sich ein Nickname setzen, der statt des Google-Namens in
// allen Bestenlisten/Lobbys verwendet wird (leer lassen = Google-Name).

import type { User } from 'firebase/auth'
import { useState } from 'react'
import { logout, signInWithGoogle } from '../firebase/auth'
import { getNickname, getPlayerName, setNickname } from '../firebase/displayName'
import { updateGhostName } from '../firebase/ghosts'
import { updateLeaderboardName } from '../firebase/scores'
import { dailySeed } from '../game/rng'
import { safeAvatarUrl } from './Avatar'

interface LoginButtonProps {
  user: User | null
  /** Wird nach einer Nickname-Änderung aufgerufen (z.B. Bestenliste neu laden). */
  onNameChange?: () => void
}

export function LoginButton({ user, onNameChange }: LoginButtonProps) {
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [, setRev] = useState(0) // erzwingt Re-Render nach Nickname-Änderung

  const handleLogin = async () => {
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch (e) {
      // Popup vom Nutzer geschlossen o.ä. -> still ignorieren, nur loggen
      console.warn('Login abgebrochen oder fehlgeschlagen:', e)
    } finally {
      setBusy(false)
    }
  }

  const startEdit = () => {
    setDraft(getNickname() ?? '')
    setEditing(true)
  }

  const commitEdit = () => {
    setEditing(false)
    const before = getPlayerName(user)
    setNickname(draft)
    setRev((r) => r + 1)
    if (user && getPlayerName(user) !== before) {
      // Namensänderung sofort in Bestenlisten + eigenen Tages-Geist nachziehen
      void updateLeaderboardName(user).then(() => onNameChange?.())
      void updateGhostName(user, dailySeed())
    }
  }

  if (user) {
    const avatar = safeAvatarUrl(user.photoURL)
    return (
      <div className="user-chip">
        {avatar && <img src={avatar} alt="" referrerPolicy="no-referrer" />}
        {editing ? (
          <input
            className="nick-input"
            autoFocus
            maxLength={24}
            placeholder={user.displayName ?? 'Nickname'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          // Stift als Geschwister-Element: innerhalb des ellipsierten Namens
          // würde er bei langen Namen weggeclippt — und wäre unauffindbar.
          <span className="user-name-wrap" title="Nickname ändern" onClick={startEdit}>
            <span className="user-name">{getPlayerName(user, 'Spieler')}</span>
            <span className="nick-edit">✏️</span>
          </span>
        )}
        <button className="link-btn" onClick={() => logout()}>
          Abmelden
        </button>
      </div>
    )
  }

  return (
    <button className="btn google-btn" onClick={handleLogin} disabled={busy}>
      {busy ? 'Anmelden…' : 'Mit Google anmelden'}
    </button>
  )
}
