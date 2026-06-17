// ===========================================================================
// Spielername-Helfer: optionaler Nickname statt Google-Anzeigename.
//
// Der Nickname wird pro Gerät in localStorage gehalten (defensiv gekapselt —
// Storage kann in manchen Browsern/WebViews fehlen oder werfen). Alle
// SCHREIB-Stellen (Scores, Geister, Multiplayer-Spielerknoten) holen den Namen
// über getPlayerName(); die Anzeigen rendern ohnehin nur gespeicherte Daten.
// ===========================================================================

import type { User } from 'firebase/auth'

const NICK_KEY = 'geometryUltraNickname'
const PROMPTED_KEY = 'geometryUltraNickPrompted'

/** Maximale Länge laut Firestore-Rules (RTDB erlaubt 80, bindend ist 64). */
export const NAME_MAX = 64

/** Kürzt Code-Point-sicher (zerschneidet keine Emoji-Surrogate-Paare). */
export function truncateName(name: string, max = NAME_MAX): string {
  return Array.from(name).slice(0, max).join('')
}

export function getNickname(): string | null {
  try {
    const raw = localStorage.getItem(NICK_KEY)
    const trimmed = raw?.trim()
    return trimmed ? truncateName(trimmed) : null
  } catch {
    return null
  }
}

/** Leerer/whitespace-Nickname löscht die Einstellung (zurück zum Google-Namen). */
export function setNickname(raw: string): void {
  try {
    const trimmed = raw.trim()
    if (trimmed) localStorage.setItem(NICK_KEY, truncateName(trimmed))
    else localStorage.removeItem(NICK_KEY)
  } catch {
    // kein Storage verfügbar — Nickname gilt dann nur bis zum Reload nicht
  }
}

/** Der Name, unter dem der Spieler überall auftaucht: Nickname > Google > Fallback. */
export function getPlayerName(user: User | null, fallback = 'Anonym'): string {
  return getNickname() ?? truncateName((user?.displayName ?? '').trim() || fallback)
}

/** True, wenn dem Nutzer der Nickname-Dialog schon einmal angeboten wurde. */
export function hasPromptedNickname(): boolean {
  try {
    return localStorage.getItem(PROMPTED_KEY) === '1'
  } catch {
    return false
  }
}

/** Merkt sich, dass der Erst-Login-Dialog gezeigt wurde (damit er nur einmal kommt). */
export function markNicknamePrompted(): void {
  try {
    localStorage.setItem(PROMPTED_KEY, '1')
  } catch {
    // kein Storage — Dialog kann dann erneut erscheinen, harmlos
  }
}
