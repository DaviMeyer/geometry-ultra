// LoginButton — zeigt entweder den "Mit Google anmelden"-Button oder, wenn
// angemeldet, den Nutzer (Bild + Name) mit Abmelden-Option.

import type { User } from 'firebase/auth'
import { useState } from 'react'
import { logout, signInWithGoogle } from '../firebase/auth'
import { safeAvatarUrl } from './Avatar'

interface LoginButtonProps {
  user: User | null
}

export function LoginButton({ user }: LoginButtonProps) {
  const [busy, setBusy] = useState(false)

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

  if (user) {
    const avatar = safeAvatarUrl(user.photoURL)
    return (
      <div className="user-chip">
        {avatar && <img src={avatar} alt="" referrerPolicy="no-referrer" />}
        <span className="user-name">{user.displayName ?? 'Spieler'}</span>
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
