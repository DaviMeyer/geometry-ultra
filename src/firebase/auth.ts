// ===========================================================================
// Authentifizierung über Google. Dünne Hülle um die Firebase-Auth-Funktionen.
// ===========================================================================

import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { auth } from './config'

const provider = new GoogleAuthProvider()

/** Öffnet das Google-Login-Popup. */
export function signInWithGoogle() {
  return signInWithPopup(auth, provider)
}

/** Meldet den aktuellen Nutzer ab. */
export function logout() {
  return signOut(auth)
}

/** Registriert einen Listener für Login/Logout. Gibt die Abmelde-Funktion zurück. */
export function watchAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback)
}
