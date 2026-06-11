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
        const ok = await joinRoom(c, user)
        if (!ok) {
          setError('Raum nicht gefunden')
          return
        }
        setOffset(await getServerOffset())
        setCode(c)
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
    if (code) await startCountdown(code)
  }, [code])

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
    if (code) {
      await resetRoom(code)
      setOffset(await getServerOffset())
    }
  }, [code])

  return { room, code, offset, busy, error, create, join, leave, toggleReady, start, toggleCollision, pushProgress, finish, rematch }
}
