// ===========================================================================
// Geister in Firestore — der jeweils beste Lauf eines Tages.
//
// Schema: Collection "dailyGhosts", ein Dokument pro Seed (Doc-ID = seed).
// Es wird nur der beste Lauf des Tages gespeichert. Die Sicherheitsregel
// erlaubt Überschreiben nur, wenn der neue Score höher ist.
//
// Damit der Geist wirklich dem Platz-1-Lauf entspricht: Scheitert ein
// Geist-Upload (Netzabriss nach dem Score-Write etc.), wird der Lauf lokal
// gemerkt und beim nächsten Versuch desselben Tages mitgenommen — sonst kann
// ein späterer, SCHWÄCHERER Lauf zum angezeigten Tages-Geist werden.
// ===========================================================================

import type { User } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import type { GhostData } from '../game/ghost'
import { db } from './config'
import { getPlayerName, truncateName } from './displayName'

const PENDING_KEY = 'geometryUltraPendingGhost'

// Der Pending-Lauf ist an den Besitzer gebunden — sonst würde nach einem
// Account-Wechsel am selben Gerät der Lauf von Spieler A automatisch unter
// der Identität von Spieler B als Tages-Geist veröffentlicht.
interface PendingGhost {
  uid: string
  ghost: GhostData
}

function loadPendingGhost(): PendingGhost | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as PendingGhost
    if (typeof p?.uid !== 'string') return null
    const g = p.ghost
    if (typeof g?.seed !== 'number' || typeof g?.score !== 'number' || !Array.isArray(g?.xs)) return null
    return p
  } catch {
    return null
  }
}

function storePendingGhost(p: PendingGhost | null): void {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p))
    else localStorage.removeItem(PENDING_KEY)
  } catch {
    // kein Storage — Retry entfällt, mehr als best effort geht hier nicht
  }
}

/**
 * Lädt den besten Geist des Tages (oder null, wenn es noch keinen gibt).
 * Defensiv validiert — ein kaputtes/manipuliertes/altes Dokument (z.B. aus der
 * Zeit vor den gehärteten Rules) darf weder die Wiedergabe zerlegen noch als
 * falscher Geist auftauchen.
 */
export async function fetchDailyGhost(seed: number): Promise<GhostData | null> {
  const ref = doc(db, 'dailyGhosts', String(seed))
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const d = snap.data()
  if (
    d.seed !== seed ||
    typeof d.score !== 'number' ||
    d.score < 0 ||
    d.score > 250000 ||
    typeof d.interval !== 'number' ||
    !(d.interval > 0) ||
    !Array.isArray(d.xs) ||
    !Array.isArray(d.ys) ||
    !Array.isArray(d.zs) ||
    d.xs.length === 0 ||
    d.xs.length !== d.ys.length ||
    d.xs.length !== d.zs.length
  ) {
    return null
  }
  return {
    seed: d.seed,
    score: d.score,
    name: typeof d.name === 'string' ? truncateName(d.name) : undefined,
    interval: d.interval,
    xs: d.xs,
    ys: d.ys,
    zs: d.zs,
  }
}

/**
 * Speichert den Geist als Tagesbesten, falls sein Score höher ist als der
 * bisher gespeicherte. Gibt true zurück, wenn gespeichert wurde.
 * Verliert er das Rennen gegen einen fast gleichzeitigen besseren Lauf
 * (Check und Write sind nicht atomar), ist das kein Fehler -> false.
 * Ein früher fehlgeschlagener, besserer Lauf desselben Tages wird automatisch
 * mitgenommen; bei erneutem Scheitern bleibt der beste Lauf lokal gemerkt.
 */
export async function saveDailyGhost(user: User, ghost: GhostData): Promise<boolean> {
  // Pending-Verwaltung: nur der EIGENE Pending desselben Tages wird gemerged;
  // ein fremder (anderes Konto am selben Gerät) bleibt unangetastet liegen.
  const pending = loadPendingGhost()
  const ownPending = pending && pending.uid === user.uid && pending.ghost.seed === ghost.seed ? pending : null
  if (pending && pending.ghost.seed !== ghost.seed) storePendingGhost(null) // alter Tag -> verwerfen
  if (ownPending && ownPending.ghost.score > ghost.score) ghost = ownPending.ghost
  const clearOwnPending = () => {
    if (ownPending) storePendingGhost(null)
  }

  const ref = doc(db, 'dailyGhosts', String(ghost.seed))
  try {
    const existing = await getDoc(ref)
    const prev = existing.exists() ? ((existing.data().score as number) ?? 0) : 0
    if (ghost.score <= prev) {
      clearOwnPending() // es gibt bereits einen besseren Geist
      return false
    }

    await setDoc(ref, {
      uid: user.uid,
      name: getPlayerName(user),
      seed: ghost.seed,
      score: ghost.score,
      interval: ghost.interval,
      xs: ghost.xs,
      ys: ghost.ys,
      zs: ghost.zs,
      createdAt: serverTimestamp(),
    })
    clearOwnPending()
    return true
  } catch (e) {
    if ((e as { code?: string })?.code === 'permission-denied') {
      // jemand war schneller UND besser — kein Fehler, nichts zu retten
      clearOwnPending()
      return false
    }
    // Upload gescheitert (z.B. offline): besten Lauf des Tages für Retry merken
    storePendingGhost({ uid: user.uid, ghost })
    throw e
  }
}

/** Versucht, einen liegengebliebenen Geist-Upload nachzuholen (z.B. beim Start). */
export async function retryPendingGhost(user: User, todaySeed: number): Promise<void> {
  const pending = loadPendingGhost()
  if (!pending) return
  if (pending.ghost.seed !== todaySeed) {
    storePendingGhost(null) // gestriger Lauf — der Tag ist gelaufen
    return
  }
  if (pending.uid !== user.uid) return // gehört einem anderen Konto — nicht anfassen
  await saveDailyGhost(user, pending.ghost).catch(() => {})
}

/**
 * Zieht eine Nickname-Änderung in den heutigen Tages-Geist nach — aber nur,
 * wenn der Geist dem eigenen Konto gehört (Name-only-Update, gleiche Score).
 */
export async function updateGhostName(user: User, todaySeed: number): Promise<void> {
  const ref = doc(db, 'dailyGhosts', String(todaySeed))
  try {
    const snap = await getDoc(ref)
    if (snap.exists() && snap.data().uid === user.uid) {
      await updateDoc(ref, { name: getPlayerName(user) })
    }
  } catch {
    // best effort — beim nächsten besseren Lauf stimmt der Name ohnehin
  }
}
