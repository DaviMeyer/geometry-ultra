// ===========================================================================
// useAuth — React-Hook um den Firebase-Anmeldestatus. Liefert den aktuellen
// Nutzer (oder null) und ob der Status noch geladen wird.
// ===========================================================================

import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { watchAuth } from '../firebase/auth'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // watchAuth gibt die Abmelde-Funktion zurück -> dient als Cleanup
    return watchAuth((u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  return { user, loading }
}
