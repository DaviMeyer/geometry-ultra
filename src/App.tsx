// App — Wurzel-Komponente. Verbindet Spiel-Engine (useEngine), Anmeldung
// (useAuth) und Multiplayer-Lobby (useMultiplayer) und schaltet zwischen den
// Oberflächen um. Kümmert sich außerdem um Score-Upload (Solo) bzw. den
// Multiplayer-Ablauf (Countdown -> Start, Positions-Sync, Crash -> finish).

import { useEffect, useRef, useState } from 'react'
import { saveDailyGhost } from './firebase/ghosts'
import { submitDailyScore, submitScore } from './firebase/scores'
import { useAuth } from './hooks/useAuth'
import { useEngine } from './hooks/useEngine'
import { useMultiplayer } from './hooks/useMultiplayer'
import { GameOverScreen } from './ui/GameOverScreen'
import { HUD } from './ui/HUD'
import { StartScreen } from './ui/StartScreen'
import { Lobby } from './ui/multiplayer/Lobby'
import { MpRanking } from './ui/multiplayer/MpRanking'
import { MultiplayerResults } from './ui/multiplayer/MultiplayerResults'

export default function App() {
  const eng = useEngine()
  const { user } = useAuth()
  const mp = useMultiplayer(user)

  const [lbRefresh, setLbRefresh] = useState(0)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [mpActive, setMpActive] = useState(false)

  const { beginRun, setProgressHandler, updateRemote, setSpectating, setCollisionMode } = eng
  const phase = mp.room?.meta.state
  const startAt = mp.room?.meta.startAt
  const seed = mp.room?.meta.seed
  const startedRef = useRef(false)
  const finishedRef = useRef(false)

  const mpPlayers = mp.room ? Object.values(mp.room.players ?? {}) : []
  const allFinished = mpPlayers.length > 0 && mpPlayers.every((p) => p.finished)

  // --- Solo: Score (und im Daily der Geist) nach dem Crash hochladen ---
  useEffect(() => {
    if (eng.uiState !== 'gameover' || !eng.result) {
      if (eng.uiState === 'playing') setSaveStatus(null)
      return
    }
    if (eng.result.mode === 'multiplayer') return // Multiplayer hat eigenen Ablauf
    if (!user) {
      setSaveStatus('Melde dich an, um deinen Score zu speichern')
      return
    }
    const { score, mode, seed: runSeed } = eng.result
    const ghost = eng.lastGhost
    setSaveStatus('Score wird gespeichert…')

    if (mode === 'daily') {
      Promise.all([submitDailyScore(user, score, runSeed), ghost ? saveDailyGhost(user, ghost) : Promise.resolve(false)])
        .then(([saved]) => {
          setSaveStatus(saved ? '✓ Tages-Score gespeichert' : 'Kein neuer Tagesrekord')
          setLbRefresh((k) => k + 1)
        })
        .catch((err) => {
          console.error('Daily-Upload fehlgeschlagen:', err)
          setSaveStatus('Speichern fehlgeschlagen')
        })
    } else {
      submitScore(user, score, mode, runSeed)
        .then((saved) => {
          setSaveStatus(saved ? '✓ Score gespeichert' : 'Kein neuer persönlicher Rekord')
          setLbRefresh((k) => k + 1)
        })
        .catch((err) => {
          console.error('Score-Upload fehlgeschlagen:', err)
          setSaveStatus('Speichern fehlgeschlagen')
        })
    }
  }, [eng.uiState, eng.result, eng.lastGhost, user])

  // --- Multiplayer: eigene Position an die Lobby weiterleiten ---
  useEffect(() => {
    setProgressHandler(mpActive ? mp.pushProgress : null)
    return () => setProgressHandler(null)
  }, [mpActive, mp.pushProgress, setProgressHandler])

  // --- Multiplayer: Mitspieler-Cubes aktualisieren ---
  useEffect(() => {
    if (!mpActive || !mp.room) return
    const others = Object.values(mp.room.players ?? {})
      .filter((p) => p.uid !== user?.uid)
      .map((p) => ({ uid: p.uid, x: p.x ?? 0, y: p.y ?? 0.6, z: p.z ?? 0, alive: (p.alive ?? true) && !p.finished }))
    updateRemote(others)
  }, [mpActive, mp.room, user, updateRemote])

  // --- Multiplayer: Countdown -> synchron + nebeneinander starten ---
  useEffect(() => {
    if (!mpActive) return
    if (phase === 'lobby') {
      startedRef.current = false
      return
    }
    if (phase === 'countdown' && startAt && seed !== undefined && !startedRef.current) {
      startedRef.current = true
      // Startaufstellung nebeneinander: eigener Index in stabil sortierter Liste
      const ids = mp.room ? Object.keys(mp.room.players ?? {}).sort() : []
      const myIndex = user ? Math.max(0, ids.indexOf(user.uid)) : 0
      const n = ids.length || 1
      const spawnX = (myIndex - (n - 1) / 2) * 2.5
      const collision = mp.room?.meta.collision ?? false
      const delay = Math.max(0, startAt - mp.offset - Date.now())
      const t = setTimeout(() => {
        setCollisionMode(collision)
        void beginRun('multiplayer', seed, spawnX)
      }, delay)
      return () => clearTimeout(t)
    }
  }, [mpActive, phase, startAt, seed, mp.offset, mp.room, user, beginRun, setCollisionMode])

  // --- Multiplayer: eigenen Crash an die Lobby melden ---
  useEffect(() => {
    if (eng.uiState === 'playing') finishedRef.current = false
    if (eng.uiState === 'gameover' && eng.result?.mode === 'multiplayer' && !finishedRef.current) {
      finishedRef.current = true
      mp.finish(eng.result.score)
    }
  }, [eng.uiState, eng.result, mp.finish])

  // --- Multiplayer: Revanche -> alle Spieler zurück in die Lobby ---
  // Sobald der Host den Raum zurücksetzt (Phase = 'lobby'), während wir noch im
  // Ergebnis-Screen sind, holt das ALLE Mitspieler automatisch in die Lobby.
  useEffect(() => {
    if (mpActive && phase === 'lobby' && eng.uiState === 'gameover') {
      eng.toMenu()
    }
  }, [mpActive, phase, eng.uiState, eng.toMenu])

  // --- Multiplayer: Zuschauer-Modus nach eigenem Crash (solange andere fahren) ---
  useEffect(() => {
    setSpectating(mpActive && eng.uiState === 'gameover' && !allFinished)
  }, [mpActive, eng.uiState, allFinished, setSpectating])

  const leaveMultiplayer = () => {
    void mp.leave()
    setMpActive(false)
    eng.toMenu()
  }

  return (
    <div className="app">
      <div className="canvas-host" ref={eng.containerRef} />

      {eng.uiState === 'playing' && (
        <HUD score={eng.score} best={eng.best} speedPct={eng.speedPct} turboPct={eng.turboPct} invincibleSec={eng.invincibleSec} />
      )}

      {/* Live-Rangliste während des Multiplayer-Rennens */}
      {mpActive && eng.uiState === 'playing' && <MpRanking room={mp.room} uid={user?.uid ?? null} />}

      {eng.uiState !== 'menu' && (
        <button className="mute-btn" onClick={eng.toggleMute} aria-label="Ton an/aus">
          {eng.muted ? '🔇' : '🔊'}
        </button>
      )}

      {/* --- Solo-Oberflächen --- */}
      {!mpActive && eng.uiState === 'menu' && (
        <StartScreen onStart={(mode) => void eng.beginRun(mode)} onMultiplayer={() => setMpActive(true)} user={user} lbRefreshKey={lbRefresh} />
      )}
      {!mpActive && eng.uiState === 'gameover' && eng.result && (
        <GameOverScreen
          score={eng.result.score}
          best={eng.best}
          isNewBest={eng.isNewBest}
          mode={eng.result.mode}
          seed={eng.result.seed}
          user={user}
          saveStatus={saveStatus}
          lbRefreshKey={lbRefresh}
          onRetry={() => void eng.beginRun(eng.result!.mode)}
          onMenu={eng.toMenu}
        />
      )}

      {/* --- Multiplayer-Oberflächen --- */}
      {mpActive && eng.uiState === 'menu' && (
        <Lobby
          user={user}
          room={mp.room}
          code={mp.code}
          offset={mp.offset}
          busy={mp.busy}
          error={mp.error}
          onCreate={() => void mp.create()}
          onJoin={(c) => void mp.join(c)}
          onLeave={() => void leaveMultiplayer()}
          onToggleReady={() => void mp.toggleReady()}
          onStart={() => void mp.start()}
          onToggleCollision={() => void mp.toggleCollision()}
          onBack={() => setMpActive(false)}
        />
      )}
      {mpActive && eng.uiState === 'gameover' && (
        <MultiplayerResults room={mp.room} user={user} onRematch={() => void mp.rematch()} onLeave={leaveMultiplayer} />
      )}

      {/* Crash-Flash */}
      <div key={eng.flashKey} className={`flash${eng.flashKey > 0 ? ' active' : ''}`} />
    </div>
  )
}
