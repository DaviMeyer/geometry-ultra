// ===========================================================================
// Geister in Firestore — der jeweils beste Lauf eines Tages.
//
// Schema: Collection "dailyGhosts", ein Dokument pro Seed (Doc-ID = seed).
// Es wird nur der beste Lauf des Tages gespeichert. Die Sicherheitsregel
// erlaubt Überschreiben nur, wenn der neue Score höher ist.
// ===========================================================================

import type { User } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import type { GhostData } from '../game/ghost'
import { db } from './config'

/**
 * Lädt den besten Geist des Tages (oder null, wenn es noch keinen gibt).
 * Defensiv validiert — ein kaputtes/manipuliertes Dokument darf die Wiedergabe
 * nicht zerlegen (Division durch interval, Index-Zugriffe auf die Listen).
 */
export async function fetchDailyGhost(seed: number): Promise<GhostData | null> {
  const ref = doc(db, 'dailyGhosts', String(seed))
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const d = snap.data()
  if (
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
    name: d.name,
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
 */
export async function saveDailyGhost(user: User, ghost: GhostData): Promise<boolean> {
  const ref = doc(db, 'dailyGhosts', String(ghost.seed))
  const existing = await getDoc(ref)
  const prev = existing.exists() ? ((existing.data().score as number) ?? 0) : 0
  if (ghost.score <= prev) return false

  try {
    await setDoc(ref, {
      uid: user.uid,
      name: (user.displayName ?? 'Anonym').slice(0, 64),
      seed: ghost.seed,
      score: ghost.score,
      interval: ghost.interval,
      xs: ghost.xs,
      ys: ghost.ys,
      zs: ghost.zs,
      createdAt: serverTimestamp(),
    })
  } catch (e) {
    if ((e as { code?: string })?.code === 'permission-denied') return false
    throw e
  }
  return true
}
