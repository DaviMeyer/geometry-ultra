// ===========================================================================
// Multiplayer über die Firebase Realtime Database.
//
// Raum-Struktur:
//   rooms/<code>/
//     meta/    { host, seed, state: 'lobby'|'countdown', startAt, createdAt }
//     players/<uid>/ { uid, name, photoURL, ready, x, y, z, alive, score,
//                      finished, finalScore, t, vz }
//
// Synchroner Start: Der Host schreibt eine absolute Startzeit (startAt) in
// Server-Zeit. Alle Clients rechnen über den Server-Offset in ihre lokale Zeit
// um -> alle starten gleichzeitig.
//
// Positions-Sync mit Dead Reckoning: Jedes Progress-Update trägt einen
// Server-Zeitstempel (t, via serverTimestamp) und die aktuelle Vorwärts-
// geschwindigkeit (vz). Empfänger extrapolieren damit die echte Position —
// ohne das sieht jeder Client den Gegner um Latenz × Tempo hinter sich.
//
// "rooms" wird nur per geheimem Code referenziert; aufräumen erfolgt über
// onDisconnect (Spieler verschwindet bei Verbindungsabbruch). Verlässt der
// letzte Spieler (Host) den Raum, wird der ganze Raum gelöscht.
// ===========================================================================

import type { User } from 'firebase/auth'
import { type Database, get, getDatabase, onDisconnect, onValue, ref, remove, serverTimestamp, set, update } from 'firebase/database'
import { randomSeed } from '../game/rng'
import { app } from './config'

export type RoomPhase = 'lobby' | 'countdown'

/** Räume älter als 24 h gelten als verwaist und sind nicht mehr beitretbar. */
const ROOM_TTL_MS = 24 * 60 * 60 * 1000

/** Spieler ohne Progress-Update seit dieser Zeit gelten als abwesend (Tab zu o.ä.). */
export const STALE_MS = 15000

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
  /** Server-Zeitstempel des letzten Progress-Updates (ms). */
  t?: number
  /** Vorwärtsgeschwindigkeit beim letzten Update (units/s, für Extrapolation). */
  vz?: number
}

export interface RoomState {
  id: string
  meta: RoomMeta
  players: Record<string, RoomPlayer>
}

export type JoinResult = 'ok' | 'not-found' | 'running' | 'expired'

// Realtime Database wird erst bei Bedarf initialisiert (braucht databaseURL).
// Beim ersten Zugriff wird außerdem der Server-Zeit-Offset dauerhaft beobachtet.
let _db: Database | null = null
let offsetValue = 0
let offsetReady: Promise<number> | null = null

function db(): Database {
  if (!_db) {
    _db = getDatabase(app)
    offsetReady = new Promise((resolve) => {
      let done = false
      const finish = () => {
        if (!done) {
          done = true
          resolve(offsetValue)
        }
      }
      // ".info/serverTimeOffset" ist ein client-lokaler Spezialwert und nur über
      // einen Listener lesbar. Der Listener bleibt aktiv, damit der Offset auch
      // nach Reconnects aktuell bleibt.
      onValue(ref(_db!, '.info/serverTimeOffset'), (snap) => {
        offsetValue = (snap.val() as number) ?? 0
        finish()
      })
      setTimeout(finish, 2000) // Fallback, falls kein Wert kommt
    })
  }
  return _db
}

/**
 * Wartet auf den ersten Server-Zeit-Offset (Server-Zeit ≈ Date.now() + offset).
 * Liefert immer den LIVE-Wert zum Auflösungszeitpunkt — das gecachte Promise
 * darf nicht den (ggf. per 2s-Fallback auf 0 gesetzten) Erstwert einfrieren.
 */
export function getServerOffset(): Promise<number> {
  db()
  return offsetReady!.then(() => offsetValue)
}

/** Aktuell bekannter Server-Zeit-Offset (live aktualisiert). */
export function currentServerOffset(): number {
  db()
  return offsetValue
}

/** Geschätzte aktuelle Server-Zeit in ms. */
export function serverNow(): number {
  return Date.now() + currentServerOffset()
}

/**
 * True, wenn ein Spieler seit STALE_MS nichts mehr von sich hören lässt.
 * Spieler, die noch NIE ein Progress-Update gesendet haben (Tab ging während
 * des Countdowns in den Hintergrund -> rAF pausiert, Engine läuft nie), werden
 * ab dem Rennstart (startAt) gemessen — sonst blockieren sie den Endstand für
 * immer, obwohl genau das der Zweck der Stale-Erkennung ist.
 */
export function isStale(p: RoomPlayer, now: number, raceStartAt?: number): boolean {
  if (p.finished) return false
  if (typeof p.t === 'number') return now - p.t > STALE_MS
  return typeof raceStartAt === 'number' && now - raceStartAt > STALE_MS
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
    name: (user.displayName ?? 'Spieler').slice(0, 80),
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

/**
 * Wandelt rohe RTDB-Spielerdaten in garantiert vollständige RoomPlayer um.
 * Teil-Knoten OHNE uid-Feld (entstehen, wenn ein update() einen bereits
 * gelöschten Spieler "wiederbelebt", z.B. Revanche-Reset vs. gleichzeitiges
 * Verlassen) werden komplett verworfen — sie haben keinen echten Client mehr.
 * Die uid wird autoritativ aus dem DB-Schlüssel übernommen.
 */
function normalizePlayers(raw: unknown): Record<string, RoomPlayer> {
  const out: Record<string, RoomPlayer> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, val] of Object.entries(raw as Record<string, Partial<RoomPlayer> | null>)) {
    if (!val || typeof val !== 'object' || typeof val.uid !== 'string') continue
    out[key] = { name: 'Spieler', photoURL: null, ready: false, ...val, uid: key }
  }
  return out
}

// onDisconnect gilt pro Verbindung — nach einem Reconnect muss es neu scharf
// gestellt werden, sonst bleibt der Spieler beim nächsten Abbruch als Leiche
// im Raum. Der .info/connected-Listener erledigt das automatisch.
let presenceUnsub: (() => void) | null = null

function setupDisconnect(code: string, uid: string) {
  clearPresence()
  const playerRef = ref(db(), `rooms/${code}/players/${uid}`)
  presenceUnsub = onValue(ref(db(), '.info/connected'), (snap) => {
    if (snap.val() === true) void onDisconnect(playerRef).remove()
  })
}

function clearPresence() {
  presenceUnsub?.()
  presenceUnsub = null
}

/**
 * Erstellt einen neuen Raum und tritt ihm bei. Gibt den Raum-Code zurück.
 * Bei Code-Kollision lehnen die Rules das Überschreiben ab -> neuen Code probieren.
 */
export async function createRoom(user: User): Promise<string> {
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode()
    try {
      await set(ref(db(), `rooms/${code}`), {
        meta: { host: user.uid, seed: randomSeed(), state: 'lobby', collision: false, createdAt: serverTimestamp() },
        players: { [user.uid]: newPlayer(user) },
      })
      setupDisconnect(code, user.uid)
      return code
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

/** Tritt einem bestehenden Raum bei (nur in der Lobby-Phase möglich). */
export async function joinRoom(code: string, user: User): Promise<JoinResult> {
  const metaSnap = await get(ref(db(), `rooms/${code}/meta`))
  if (!metaSnap.exists()) return 'not-found'
  const meta = metaSnap.val() as RoomMeta
  if (typeof meta.createdAt === 'number' && serverNow() - meta.createdAt > ROOM_TTL_MS) return 'expired'
  if (meta.state !== 'lobby') return 'running'
  await set(ref(db(), `rooms/${code}/players/${user.uid}`), newPlayer(user))
  setupDisconnect(code, user.uid)
  return 'ok'
}

/**
 * Verlässt den Raum. Ist der Gehende der Host, wandert die Host-Rolle an den
 * (stabil) ersten verbleibenden Spieler; als letzter Spieler löscht er den Raum.
 */
export async function leaveRoom(code: string, uid: string): Promise<void> {
  clearPresence()
  const playerRef = ref(db(), `rooms/${code}/players/${uid}`)
  try {
    const snap = await get(ref(db(), `rooms/${code}`))
    if (snap.exists()) {
      const room = snap.val() as { meta?: RoomMeta; players?: Record<string, unknown> }
      const remaining = Object.keys(room.players ?? {})
        .filter((k) => k !== uid)
        .sort()
      if (room.meta?.host === uid) {
        if (remaining.length === 0) {
          // Letzter Spieler: ganzen Raum aufräumen (Rules erlauben Host-Delete)
          await onDisconnect(playerRef).cancel().catch(() => {})
          await remove(ref(db(), `rooms/${code}`))
          return
        }
        // Host-Rolle übergeben, damit der Raum startfähig bleibt
        await update(ref(db(), `rooms/${code}/meta`), { host: remaining[0] }).catch(() => {})
      }
    }
  } catch {
    // best effort — zur Not nur den eigenen Knoten entfernen
  }
  await remove(playerRef)
  await onDisconnect(playerRef).cancel().catch(() => {})
}

/**
 * Übernimmt die Host-Rolle (wenn der eingetragene Host den Raum verlassen hat,
 * z.B. per Verbindungsabbruch ohne sauberes leaveRoom).
 */
export async function claimHost(code: string, uid: string): Promise<void> {
  await update(ref(db(), `rooms/${code}/meta`), { host: uid }).catch(() => {})
}

/** Setzt den eigenen Bereit-Status. */
export async function setReady(code: string, uid: string, ready: boolean): Promise<void> {
  await update(ref(db(), `rooms/${code}/players/${uid}`), { ready }).catch(() => {})
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

/**
 * Schreibt die aktuelle Position/Score (gedrosselt vom Aufrufer aufrufen).
 * t wird serverseitig gestempelt -> Empfänger können das Alter des Updates
 * unabhängig von der Uhr des Senders bestimmen. Fehler (z.B. wenn der eigene
 * Knoten gerade entfernt wurde) werden bewusst verschluckt.
 */
export async function pushProgress(code: string, uid: string, p: { x: number; y: number; z: number; alive: boolean; score: number; vz: number }): Promise<void> {
  await update(ref(db(), `rooms/${code}/players/${uid}`), { ...p, t: serverTimestamp() }).catch(() => {})
}

/** Markiert den eigenen Lauf als beendet (Crash). */
export async function finishRace(code: string, uid: string, finalScore: number): Promise<void> {
  await update(ref(db(), `rooms/${code}/players/${uid}`), { finished: true, finalScore, alive: false }).catch(() => {})
}

/**
 * Host: setzt den Raum für eine neue Runde zurück (zurück in die Lobby).
 * Verlässt ein Spieler den Raum zwischen Lesen und Schreiben, lehnen die
 * gehärteten Rules das Update atomar ab (kein Wiederbeleben von Teil-Knoten)
 * -> mit frischem Stand erneut versuchen.
 */
export async function resetRoom(code: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const snap = await get(ref(db(), `rooms/${code}/players`))
    const uids = snap.exists() ? Object.keys((snap.val() as Record<string, unknown>) ?? {}) : []
    const updates: Record<string, unknown> = {
      'meta/state': 'lobby',
      'meta/seed': randomSeed(),
      'meta/startAt': null,
    }
    for (const uid of uids) {
      updates[`players/${uid}/ready`] = false
      updates[`players/${uid}/finished`] = false
      updates[`players/${uid}/finalScore`] = 0
      updates[`players/${uid}/alive`] = true
      updates[`players/${uid}/score`] = 0
      // Position zurück an die Startlinie — sonst stehen die Gegner-Cubes in
      // der nächsten Runde anfangs an ihrer alten Endposition
      updates[`players/${uid}/x`] = 0
      updates[`players/${uid}/y`] = 0.6
      updates[`players/${uid}/z`] = 0
      updates[`players/${uid}/t`] = null
      updates[`players/${uid}/vz`] = null
    }
    try {
      await update(ref(db(), `rooms/${code}`), updates)
      return
    } catch (e) {
      if (attempt === 2) throw e
    }
  }
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
      players: normalizePlayers(val.players),
    })
  })
}
