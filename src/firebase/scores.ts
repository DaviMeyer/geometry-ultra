// ===========================================================================
// Highscores in Firestore.
//
// Schema: Collection "scores", ein Dokument pro Nutzer (Doc-ID = uid).
// Dadurch steht in der Bestenliste pro Spieler nur sein bester Lauf.
// Gespeichert wird nur, wenn der neue Score den bisherigen übertrifft.
// ===========================================================================

import type { User } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { dailySeed } from '../game/rng'
import { db } from './config'
import { getPlayerName } from './displayName'

const safeName = (user: User) => getPlayerName(user)

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
    displayName: safeName(user),
    photoURL: user.photoURL ?? null,
    score,
    mode,
    seed,
    updatedAt: serverTimestamp(),
  })
  return true
}

/**
 * Zieht eine Namensänderung sofort in die Bestenlisten nach — die Docs werden
 * sonst nur bei einem NEUEN Rekord geschrieben, Top-Spieler blieben also ewig
 * unter dem alten Namen stehen. Name-only-Updates bestehen die Rules (Score
 * bleibt unverändert >= bisher). Fehler (z.B. noch kein Eintrag) sind egal.
 */
export async function updateLeaderboardName(user: User): Promise<void> {
  const displayName = safeName(user)
  await updateDoc(doc(db, 'scores', user.uid), { displayName }).catch(() => {})
  await updateDoc(doc(db, 'dailyScores', String(dailySeed()), 'entries', user.uid), { displayName }).catch(() => {})
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
    displayName: safeName(user),
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
