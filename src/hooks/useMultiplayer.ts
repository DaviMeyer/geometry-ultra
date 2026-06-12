// ===========================================================================
// useMultiplayer — React-Hook um die Realtime-Database-Lobby.
//
// Verwaltet den Raum-Zustand (Live-Abo), den Server-Zeit-Offset und stellt die
// Aktionen bereit (erstellen, beitreten, bereit, starten, Position senden,
// beenden, Revanche). Die eigentliche Spielsteuerung übernimmt App.
// ===========================================================================

import type { User } from 'firebase/auth'
import { useCallback, useEffect, useState } from 'react'
import type { ProgressState } from '../game/types'
import {
  claimHost,
  createRoom,
  finishRace as mpFinishRace,
  pushProgress as mpPushProgress,
  getServerOffset,
  joinRoom,
  leaveRoom,
  resetRoom,
  setCollision,
  setReady,
  startCountdown,
  watchRoom,
  type RoomState,
} from '../firebase/multiplayer'

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

  // Host-Ausfall: Ist der eingetragene Host nicht mehr im Raum, übernimmt der
  // (stabil) erste verbleibende Spieler — sonst könnte nie wieder jemand
  // starten oder eine Revanche auslösen.
  useEffect(() => {
    if (!room || !user || !code) return
    const ids = Object.keys(room.players ?? {}).sort()
    if (!ids.includes(user.uid)) return
    if (room.players[room.meta.host]) return // Host ist noch da
    if (ids[0] !== user.uid) return // nur einer übernimmt
    void claimHost(code, user.uid)
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

  return { room, code, offset, busy, error, create, join, leave, toggleReady, start, toggleCollision, pushProgress, finish, rematch }
}
