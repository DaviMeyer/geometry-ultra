// ===========================================================================
// Highscores in Firestore.
//
// Schema: Collection "scores", ein Dokument pro Nutzer (Doc-ID = uid).
// Dadurch steht in der Bestenliste pro Spieler nur sein bester Lauf.
// Gespeichert wird nur, wenn der neue Score den bisherigen übertrifft.
// ===========================================================================

import type { User } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './config'

export interface ScoreEntry {
  uid: string
  displayName: string
  photoURL: string | null
  score: number
  mode?: string
  seed?: number
}

/**
 * Speichert den Score, falls er den bisherigen Bestwert des Nutzers übertrifft.
 * Gibt true zurück, wenn ein neuer Bestwert gespeichert wurde.
 */
export async function submitScore(user: User, score: number, mode: string, seed: number): Promise<boolean> {
  const ref = doc(db, 'scores', user.uid)
  const existing = await getDoc(ref)
  const prev = existing.exists() ? ((existing.data().score as number) ?? 0) : 0
  if (score <= prev) return false

  await setDoc(ref, {
    uid: user.uid,
    displayName: user.displayName ?? 'Anonym',
    photoURL: user.photoURL ?? null,
    score,
    mode,
    seed,
    updatedAt: serverTimestamp(),
  })
  return true
}

/** Lädt die besten `max` Scores (absteigend sortiert). */
export async function fetchTopScores(max = 10): Promise<ScoreEntry[]> {
  const q = query(collection(db, 'scores'), orderBy('score', 'desc'), limit(max))
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data() as ScoreEntry)
}

// --- Tägliche Challenge ---
// Eigene Subcollection pro Tag: dailyScores/<seed>/entries/<uid>.
// Dadurch reicht ein automatischer Single-Field-Index (kein Composite-Index nötig).

export async function submitDailyScore(user: User, score: number, seed: number): Promise<boolean> {
  const ref = doc(db, 'dailyScores', String(seed), 'entries', user.uid)
  const existing = await getDoc(ref)
  const prev = existing.exists() ? ((existing.data().score as number) ?? 0) : 0
  if (score <= prev) return false

  await setDoc(ref, {
    uid: user.uid,
    displayName: user.displayName ?? 'Anonym',
    photoURL: user.photoURL ?? null,
    score,
    updatedAt: serverTimestamp(),
  })
  return true
}

/** Lädt die Tages-Bestenliste für einen Seed (absteigend sortiert). */
export async function fetchDailyTop(seed: number, max = 10): Promise<ScoreEntry[]> {
  const q = query(collection(db, 'dailyScores', String(seed), 'entries'), orderBy('score', 'desc'), limit(max))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ ...(d.data() as ScoreEntry), seed }))
}
