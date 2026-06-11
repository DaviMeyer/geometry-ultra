// Avatar — rendert ein Profilbild NUR, wenn die URL eine https-URL ist.
// Schützt davor, dass attacker-kontrollierte photoURL-Werte (z.B. http://LAN-IP
// oder Tracking-Endpunkte) als <img src> bei anderen Spielern geladen werden.
// Andernfalls wird ein neutraler Platzhalter angezeigt.

/** Gibt die URL nur zurück, wenn sie via https geladen wird, sonst null. */
export function safeAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    if (new URL(url).protocol === 'https:') return url
  } catch {
    // ungültige URL -> verwerfen
  }
  return null
}

interface AvatarProps {
  url: string | null | undefined
  className: string
}

export function Avatar({ url, className }: AvatarProps) {
  const safe = safeAvatarUrl(url)
  if (safe) return <img className={className} src={safe} alt="" referrerPolicy="no-referrer" />
  return <span className={`${className} placeholder`} />
}
