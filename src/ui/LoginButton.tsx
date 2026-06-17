// LoginButton — zeigt entweder den "Mit Google anmelden"-Button oder, wenn
// angemeldet, den Nutzer (Bild + Name) mit Abmelden-Option.
// Über das ✏️ öffnet sich der Nickname-Dialog (Name für Bestenlisten/Lobbys).
// Beim ersten Login erscheint der Dialog automatisch als Willkommens-Hinweis.

import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { logout, signInWithGoogle } from '../firebase/auth'
import { getPlayerName, hasPromptedNickname, markNicknamePrompted } from '../firebase/displayName'
import { updateGhostName } from '../firebase/ghosts'
import { updateLeaderboardName } from '../firebase/scores'
import { dailySeed } from '../game/rng'
import { safeAvatarUrl } from './Avatar'
import { NicknameDialog } from './NicknameDialog'

interface LoginButtonProps {
  user: User | null
  /** Wird nach einer Nickname-Änderung aufgerufen (z.B. Bestenliste neu laden). */
  onNameChange?: () => void
}

export function LoginButton({ user, onNameChange }: LoginButtonProps) {
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<'edit' | 'first' | null>(null)

  // Erst-Login: Dialog einmalig automatisch anbieten. markNicknamePrompted()
  // läuft sofort, damit er auch bei Reload/Abbruch nicht erneut aufpoppt.
  useEffect(() => {
    if (!user || hasPromptedNickname()) return
    markNicknamePrompted()
    setDialog('first')
  }, [user])

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

  const handleSaved = () => {
    if (!user) return
    // Namensänderung sofort in Bestenlisten + eigenen Tages-Geist nachziehen
    void updateLeaderboardName(user).then(() => onNameChange?.())
    void updateGhostName(user, dailySeed())
  }

  if (user) {
    const avatar = safeAvatarUrl(user.photoURL)
    return (
      <>
        <div className="user-chip">
          {avatar && <img src={avatar} alt="" referrerPolicy="no-referrer" />}
          <span className="user-name-wrap" title="Nickname ändern" onClick={() => setDialog('edit')}>
            <span className="user-name">{getPlayerName(user, 'Spieler')}</span>
            <span className="nick-edit">✏️</span>
          </span>
          <button className="link-btn" onClick={() => logout()}>
            Abmelden
          </button>
        </div>

        {dialog && <NicknameDialog user={user} firstTime={dialog === 'first'} onClose={() => setDialog(null)} onSaved={handleSaved} />}
      </>
    )
  }

  return (
    <button className="btn google-btn" onClick={handleLogin} disabled={busy}>
      {busy ? 'Anmelden…' : 'Mit Google anmelden'}
    </button>
  )
}
