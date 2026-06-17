// ===========================================================================
// useMultiplayer — React-Hook um die Realtime-Database-Lobby.
//
// Verwaltet den Raum-Zustand (Live-Abo), den Server-Zeit-Offset und stellt die
// Aktionen bereit (erstellen, beitreten, bereit, starten, Position senden,
// beenden, Revanche). Die eigentliche Spielsteuerung übernimmt App.
// ===========================================================================

import type { User } from 'firebase/auth'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProgressState } from '../game/types'
import {
  claimHost,
  createRoom,
  finishRace as mpFinishRace,
  heartbeat,
  isStale,
  kickPlayer,
  pushProgress as mpPushProgress,
  getServerOffset,
  joinRoom,
  leaveRoom,
  resetRoom,
  serverNow,
  setCollision,
  setReady,
  startCountdown,
  watchRoom,
  type RoomState,
} from '../firebase/multiplayer'

/** Wie oft wir ein Lebenszeichen senden (deutlich unter STALE_MS = 15 s). */
const HEARTBEAT_MS = 5000

export function useMultiplayer(user: User | null) {
  const [room, setRoom] = useState<RoomState | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Raum live beobachten, solange ein Code gesetzt ist
  useEffect(() => {
    if (!code) return
    const unsub = watchRoom(code, setRoom)
    return unsub
  }, [code])

  // Lebenszeichen senden, solange wir SICHTBAR in einem Raum sind. Macht die
  // Abwesenheits-Erkennung (isStale) robust gegen unsaubere Verbindungsabbrüche,
  // die onDisconnect verschläft. WICHTIG: nur bei sichtbarem Tab stempeln —
  // ein in den Hintergrund geschobener Tab (Handy gesperrt, App gewechselt)
  // drosselt setInterval zwar, stoppt es aber nicht; ohne diese Sperre würde der
  // Heartbeat genau die Abwesenheit verschleiern, die er erkennen helfen soll.
  // aliveRef wird beim Rauswurf synchron gelöscht, damit kein verspäteter Tick
  // den gerade entfernten eigenen Knoten als Fragment wiederbelebt.
  const aliveRef = useRef(true)
  useEffect(() => {
    if (!code || !user) return
    aliveRef.current = true
    const beat = () => {
      if (aliveRef.current && document.visibilityState === 'visible') void heartbeat(code, user.uid)
    }
    beat()
    const id = setInterval(beat, HEARTBEAT_MS)
    document.addEventListener('visibilitychange', beat) // beim Zurückkehren sofort wieder anmelden
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [code, user])

  // Host-Ausfall: Ist der eingetragene Host nicht mehr (lebendig) im Raum,
  // übernimmt der stabil erste verbleibende LEBENDE Spieler — sonst könnte nie
  // wieder jemand starten oder eine Revanche auslösen. Veraltete Spieler (Tab
  // zu, Verbindung weg) zählen dabei nicht mehr mit.
  useEffect(() => {
    if (!room || !user || !code) return
    const now = serverNow()
    const liveIds = Object.entries(room.players ?? {})
      .filter(([, p]) => !isStale(p, now))
      .map(([k]) => k)
      .sort()
    if (!liveIds.includes(user.uid)) return
    const host = room.players[room.meta.host]
    if (host && !isStale(host, now)) return // Host ist noch da
    if (liveIds[0] !== user.uid) return // nur einer übernimmt
    void claimHost(code, user.uid)
  }, [room, user, code])

  // Rauswurf erkennen: Waren wir schon im Raum und ist unser Knoten plötzlich
  // weg (Host hat uns gekickt), zurück ins Menü mit Hinweis. Eigenes Verlassen
  // setzt code = null und löst das nicht aus (Effekt steigt vorher aus).
  const wasMemberRef = useRef(false)
  useEffect(() => {
    if (!code || !user) {
      wasMemberRef.current = false
      return
    }
    if (!room) return // Raum (noch) nicht geladen oder ganz gelöscht
    if (room.players[user.uid]) {
      wasMemberRef.current = true
      return
    }
    if (!wasMemberRef.current) return // wir waren noch nie drin -> kein Rauswurf
    wasMemberRef.current = false
    aliveRef.current = false // Heartbeat sofort stilllegen (kein Wiederbeleben des Knotens)
    void leaveRoom(code, user.uid).catch(() => {}) // onDisconnect/Presence aufräumen
    setCode(null)
    setRoom(null)
    setError('Du wurdest vom Host aus dem Raum entfernt.')
  }, [room, user, code])

  const create = useCallback(async () => {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      const c = await createRoom(user)
      setOffset(await getServerOffset())
      setCode(c)
    } catch (e) {
      console.error(e)
      setError('Raum konnte nicht erstellt werden. Ist die Realtime Database eingerichtet?')
    } finally {
      setBusy(false)
    }
  }, [user])

  const join = useCallback(
    async (raw: string) => {
      if (!user) return
      const c = raw.trim().toUpperCase()
      if (!c) return
      setBusy(true)
      setError(null)
      try {
        const res = await joinRoom(c, user)
        if (res !== 'ok') {
          setError(res === 'running' ? 'Das Rennen läuft bereits — warte auf die nächste Runde' : res === 'expired' ? 'Dieser Raum ist abgelaufen' : 'Raum nicht gefunden')
          return
        }
        // Code sofort setzen, damit ein "Zurück" während des Offset-Wartens
        // den Raum sauber wieder verlassen kann (kein Zombie-Spieler).
        setCode(c)
        setOffset(await getServerOffset())
      } catch (e) {
        console.error(e)
        setError('Beitritt fehlgeschlagen')
      } finally {
        setBusy(false)
      }
    },
    [user],
  )

  const leave = useCallback(async () => {
    if (code && user) await leaveRoom(code, user.uid).catch(() => {})
    setCode(null)
    setRoom(null)
    setError(null)
  }, [code, user])

  const toggleReady = useCallback(async () => {
    if (!code || !user || !room) return
    const me = room.players[user.uid]
    await setReady(code, user.uid, !me?.ready)
  }, [code, user, room])

  const start = useCallback(async () => {
    // nur aus der Lobby heraus starten (Doppelklick/Spätklick abfangen)
    if (code && room?.meta.state === 'lobby') await startCountdown(code)
  }, [code, room])

  const toggleCollision = useCallback(async () => {
    if (code && room) await setCollision(code, !room.meta.collision)
  }, [code, room])

  const kick = useCallback(
    async (targetUid: string) => {
      if (!code || !user || !room) return
      if (room.meta.host !== user.uid) return // nur der Host darf kicken
      if (targetUid === user.uid) return // sich selbst nicht
      await kickPlayer(code, targetUid).catch(() => {})
    },
    [code, user, room],
  )

  const pushProgress = useCallback(
    (s: ProgressState) => {
      if (code && user) void mpPushProgress(code, user.uid, s)
    },
    [code, user],
  )

  const finish = useCallback(
    (score: number) => {
      if (code && user) void mpFinishRace(code, user.uid, score)
    },
    [code, user],
  )

  const rematch = useCallback(async () => {
    if (!code) return
    try {
      await resetRoom(code)
      setOffset(await getServerOffset())
    } catch (e) {
      console.error('Revanche fehlgeschlagen:', e)
    }
  }, [code])

  return { room, code, offset, busy, error, create, join, leave, toggleReady, start, toggleCollision, kick, pushProgress, finish, rematch }
}
