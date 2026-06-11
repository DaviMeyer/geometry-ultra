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

/** Lädt den besten Geist des Tages (oder null, wenn es noch keinen gibt). */
export async function fetchDailyGhost(seed: number): Promise<GhostData | null> {
  const ref = doc(db, 'dailyGhosts', String(seed))
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const d = snap.data()
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
 */
export async function saveDailyGhost(user: User, ghost: GhostData): Promise<boolean> {
  const ref = doc(db, 'dailyGhosts', String(ghost.seed))
  const existing = await getDoc(ref)
  const prev = existing.exists() ? ((existing.data().score as number) ?? 0) : 0
  if (ghost.score <= prev) return false

  await setDoc(ref, {
    uid: user.uid,
    name: user.displayName ?? 'Anonym',
    seed: ghost.seed,
    score: ghost.score,
    interval: ghost.interval,
    xs: ghost.xs,
    ys: ghost.ys,
    zs: ghost.zs,
    createdAt: serverTimestamp(),
  })
  return true
}
