// ===========================================================================
// Multiplayer über die Firebase Realtime Database.
//
// Raum-Struktur:
//   rooms/<code>/
//     meta/    { host, seed, state: 'lobby'|'countdown', startAt, createdAt }
//     players/<uid>/ { uid, name, photoURL, ready, x, y, z, alive, score, finished, finalScore }
//
// Synchroner Start: Der Host schreibt eine absolute Startzeit (startAt) in
// Server-Zeit. Alle Clients rechnen über den Server-Offset in ihre lokale Zeit
// um -> alle starten gleichzeitig.
//
// "rooms" wird nur per geheimem Code referenziert; aufräumen erfolgt über
// onDisconnect (Spieler verschwindet bei Verbindungsabbruch).
// ===========================================================================

import type { User } from 'firebase/auth'
import { type Database, get, getDatabase, onDisconnect, onValue, ref, remove, serverTimestamp, set, update } from 'firebase/database'
import { randomSeed } from '../game/rng'
import { app } from './config'

export type RoomPhase = 'lobby' | 'countdown'

export interface RoomMeta {
  host: string
  seed: number
  state: RoomPhase
  startAt?: number
  createdAt?: number
  collision?: boolean
}

export interface RoomPlayer {
  uid: string
  name: string
  photoURL: string | null
  ready: boolean
  x?: number
  y?: number
  z?: number
  alive?: boolean
  score?: number
  finished?: boolean
  finalScore?: number
}

export interface RoomState {
  id: string
  meta: RoomMeta
  players: Record<string, RoomPlayer>
}

// Realtime Database wird erst bei Bedarf initialisiert (braucht databaseURL).
let _db: Database | null = null
function db(): Database {
  if (!_db) _db = getDatabase(app)
  return _db
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // ohne 0/O/1/I
function generateRoomCode(): string {
  let c = ''
  for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return c
}

function newPlayer(user: User): RoomPlayer {
  return {
    uid: user.uid,
    name: user.displayName ?? 'Spieler',
    photoURL: user.photoURL ?? null,
    ready: false,
    x: 0,
    y: 0.6,
    z: 0,
    alive: true,
    score: 0,
    finished: false,
    finalScore: 0,
  }
}

function setupDisconnect(code: string, uid: string) {
  // Spieler automatisch entfernen, wenn die Verbindung abbricht
  onDisconnect(ref(db(), `rooms/${code}/players/${uid}`)).remove()
}

/** Erstellt einen neuen Raum und tritt ihm bei. Gibt den Raum-Code zurück. */
export async function createRoom(user: User): Promise<string> {
  const code = generateRoomCode()
  await set(ref(db(), `rooms/${code}`), {
    meta: { host: user.uid, seed: randomSeed(), state: 'lobby', collision: false, createdAt: serverTimestamp() },
    players: { [user.uid]: newPlayer(user) },
  })
  setupDisconnect(code, user.uid)
  return code
}

/** Tritt einem bestehenden Raum bei. Gibt false zurück, wenn er nicht existiert. */
export async function joinRoom(code: string, user: User): Promise<boolean> {
  const metaSnap = await get(ref(db(), `rooms/${code}/meta`))
  if (!metaSnap.exists()) return false
  await set(ref(db(), `rooms/${code}/players/${user.uid}`), newPlayer(user))
  setupDisconnect(code, user.uid)
  return true
}

/** Verlässt den Raum (entfernt den eigenen Spieler-Knoten). */
export async function leaveRoom(code: string, uid: string): Promise<void> {
  await remove(ref(db(), `rooms/${code}/players/${uid}`))
}

/** Setzt den eigenen Bereit-Status. */
export async function setReady(code: string, uid: string, ready: boolean): Promise<void> {
  await update(ref(db(), `rooms/${code}/players/${uid}`), { ready })
}

/**
 * Liest den Server-Zeit-Offset (Server-Zeit ≈ Date.now() + offset).
 * Hinweis: ".info/serverTimeOffset" ist ein client-lokaler Spezialwert und nur
 * über einen Listener (onValue) lesbar, NICHT über get(). Daher onlyOnce-Listener
 * mit Sicherheits-Fallback.
 */
export function getServerOffset(): Promise<number> {
  return new Promise((resolve) => {
    let done = false
    const finish = (v: number) => {
      if (!done) {
        done = true
        resolve(v)
      }
    }
    onValue(ref(db(), '.info/serverTimeOffset'), (snap) => finish((snap.val() as number) ?? 0), { onlyOnce: true })
    setTimeout(() => finish(0), 2000) // Fallback, falls kein Wert kommt
  })
}

/** Host: schaltet den Kollisionsmodus (Bumper) für den Raum um. */
export async function setCollision(code: string, on: boolean): Promise<void> {
  await update(ref(db(), `rooms/${code}/meta`), { collision: on })
}

/** Host: startet den Countdown. Alle starten 4 Sekunden später gleichzeitig. */
export async function startCountdown(code: string): Promise<void> {
  const offset = await getServerOffset()
  const startAt = Date.now() + offset + 4000
  await update(ref(db(), `rooms/${code}/meta`), { state: 'countdown', startAt })
}

/** Schreibt die aktuelle Position/Score (gedrosselt vom Aufrufer aufrufen). */
export async function pushProgress(code: string, uid: string, p: { x: number; y: number; z: number; alive: boolean; score: number }): Promise<void> {
  await update(ref(db(), `rooms/${code}/players/${uid}`), p)
}

/** Markiert den eigenen Lauf als beendet (Crash). */
export async function finishRace(code: string, uid: string, finalScore: number): Promise<void> {
  await update(ref(db(), `rooms/${code}/players/${uid}`), { finished: true, finalScore, alive: false })
}

/** Host: setzt den Raum für eine neue Runde zurück (zurück in die Lobby). */
export async function resetRoom(code: string): Promise<RoomState | null> {
  const snap = await get(ref(db(), `rooms/${code}`))
  if (!snap.exists()) return null
  const room = snap.val() as RoomState
  const players = room.players ?? {}
  const updates: Record<string, unknown> = {
    'meta/state': 'lobby',
    'meta/seed': randomSeed(),
    'meta/startAt': null,
  }
  for (const uid of Object.keys(players)) {
    updates[`players/${uid}/ready`] = false
    updates[`players/${uid}/finished`] = false
    updates[`players/${uid}/finalScore`] = 0
    updates[`players/${uid}/alive`] = true
    updates[`players/${uid}/score`] = 0
  }
  await update(ref(db(), `rooms/${code}`), updates)
  return room
}

/** Beobachtet den Raum-Zustand. Gibt die Unsubscribe-Funktion zurück. */
export function watchRoom(code: string, callback: (room: RoomState | null) => void): () => void {
  const roomRef = ref(db(), `rooms/${code}`)
  return onValue(roomRef, (snap) => {
    if (!snap.exists()) {
      callback(null)
      return
    }
    const val = snap.val()
    callback({
      id: code,
      meta: val.meta as RoomMeta,
      players: (val.players ?? {}) as Record<string, RoomPlayer>,
    })
  })
}
