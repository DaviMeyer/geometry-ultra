// App — Wurzel-Komponente. Verbindet Spiel-Engine (useEngine), Anmeldung
// (useAuth) und Multiplayer-Lobby (useMultiplayer) und schaltet zwischen den
// Oberflächen um. Kümmert sich außerdem um Score-Upload (Solo) bzw. den
// Multiplayer-Ablauf (Countdown -> Start, Positions-Sync, Crash -> finish).

import { useEffect, useRef, useState } from 'react'
import { retryPendingGhost, saveDailyGhost } from './firebase/ghosts'
import { currentServerOffset, isStale, serverNow } from './firebase/multiplayer'
import { submitDailyScore, submitScore } from './firebase/scores'
import { dailySeed } from './game/rng'
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

  const { beginRun, setProgressHandler, updateRemote, setSpectating, setCollisionMode, setServerOffset } = eng
  const phase = mp.room?.meta.state
  const startAt = mp.room?.meta.startAt
  const seed = mp.room?.meta.seed
  const startedRef = useRef(false)
  const finishedRef = useRef(false)

  // Aktuelle Werte für den Start-Timer — bewusst über Refs, damit der
  // Countdown-Effect NICHT von mp.room abhängen muss (jedes RTDB-Update erzeugt
  // ein neues Raum-Objekt; als Dependency würde das Cleanup den armierten
  // Start-Timer abräumen und der Client würde nie starten).
  const roomRef = useRef(mp.room)
  roomRef.current = mp.room
  const userRef = useRef(user)
  userRef.current = user

  // Spieler, die mitten im Lauf seit längerem nichts mehr senden (Tab zu,
  // Verbindung weg ohne onDisconnect), blockieren weder den Endstand noch
  // bleiben ihre Cubes als Geister stehen. serverNow() liest den LIVE-Offset.
  const nowServer = mp.room ? serverNow() : 0
  const mpPlayers = mp.room ? Object.values(mp.room.players ?? {}) : []
  const allFinished = mpPlayers.length > 0 && mpPlayers.every((p) => p.finished || isStale(p, nowServer, startAt))

  // Stale-Erkennung braucht eine tickende Uhr: Wenn der letzte aktive Spieler
  // einfach verschwindet (Tab zu), kommen keine Raum-Updates mehr — ohne Tick
  // würde der Zuschauer-Screen nie zum Endstand wechseln.
  const [, setStaleTick] = useState(0)
  useEffect(() => {
    if (!(mpActive && eng.uiState === 'gameover' && !allFinished)) return
    const id = setInterval(() => setStaleTick((k) => k + 1), 1000)
    return () => clearInterval(id)
  }, [mpActive, eng.uiState, allFinished])

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
      // Score-Status hängt NUR am Score-Upload; der Geist wird unabhängig
      // gespeichert (sein Scheitern ist kein Nutzerfehler, z.B. wenn fast
      // gleichzeitig jemand einen besseren Lauf hochlädt).
      submitDailyScore(user, score, runSeed)
        .then((saved) => {
          setSaveStatus(saved ? '✓ Tages-Score gespeichert' : 'Kein neuer Tagesrekord')
          setLbRefresh((k) => k + 1)
        })
        .catch((err) => {
          console.error('Daily-Upload fehlgeschlagen:', err)
          setSaveStatus('Speichern fehlgeschlagen')
        })
      if (ghost) {
        saveDailyGhost(user, ghost).catch((err) => console.warn('Geist konnte nicht gespeichert werden:', err))
      }
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

  // --- Daily: liegengebliebenen Geist-Upload nachholen (z.B. nach Netzabriss),
  // damit der Tages-Geist wirklich dem besten Lauf entspricht ---
  useEffect(() => {
    if (user) void retryPendingGhost(user, dailySeed())
  }, [user])

  // --- Multiplayer: Beitritt kann nach einem "Zurück" noch nachträglich
  // durchgehen (Promise löst spät auf) — dann den Raum sofort wieder verlassen,
  // statt als Karteileiche die Lobby der anderen zu blockieren.
  useEffect(() => {
    if (!mpActive && mp.code) void mp.leave()
  }, [mpActive, mp.code, mp.leave])

  // --- Multiplayer: Mitspieler-Cubes aktualisieren ---
  useEffect(() => {
    if (!mpActive || !mp.room) return
    // Live-Offset an die Engine durchreichen (Dead-Reckoning-Uhr)
    setServerOffset(currentServerOffset())
    const now = serverNow()
    const raceStartAt = mp.room.meta.startAt
    const others = Object.values(mp.room.players ?? {})
      .filter((p) => p.uid && p.uid !== user?.uid)
      .map((p) => ({
        uid: p.uid,
        name: p.name,
        x: p.x ?? 0,
        y: p.y ?? 0.6,
        z: p.z ?? 0,
        alive: (p.alive ?? true) && !p.finished && !isStale(p, now, raceStartAt),
        t: p.t,
        vz: p.vz,
      }))
    updateRemote(others)
  }, [mpActive, mp.room, user, updateRemote, setServerOffset])

  // --- Multiplayer: Countdown -> synchron + nebeneinander starten ---
  // Abhängig nur von Primitiven (phase/startAt/seed): Raum-Updates während des
  // Countdowns dürfen den Timer nicht abräumen. Raumdaten kommen aus Refs.
  useEffect(() => {
    if (!mpActive) return
    if (phase === 'lobby') {
      startedRef.current = false
      return
    }
    if (phase !== 'countdown' || !startAt || seed === undefined) return
    if (startedRef.current) return

    const fire = () => {
      if (startedRef.current) return
      // Nicht ungefragt mitstarten: Wer beim Countdown-Start nicht "bereit" war
      // (z.B. ein nach Hintergrund-Pause zurückkehrender Spieler, der aus der
      // Bereit-Prüfung herausgefiltert wurde), wird nicht ins Rennen gezogen.
      const room = roomRef.current
      const me = userRef.current
      if (me && room && !room.players[me.uid]?.ready) return
      startedRef.current = true
      // Startaufstellung nebeneinander: eigener Index in stabil sortierter Liste
      const ids = room ? Object.keys(room.players ?? {}).sort() : []
      const myIndex = me ? Math.max(0, ids.indexOf(me.uid)) : 0
      const n = ids.length || 1
      const spawnX = (myIndex - (n - 1) / 2) * 2.5
      setCollisionMode(room?.meta.collision ?? false)
      void beginRun('multiplayer', seed, spawnX)
    }

    const delay = startAt - serverNow()
    if (delay < -3000) return // Start liegt weit zurück (verwaister Raum) -> nicht blind reinspringen
    const t = setTimeout(fire, Math.max(0, delay))
    // Hintergrund-Tabs drosseln setTimeout: beim Sichtbarwerden sofort nachholen
    const onVisible = () => {
      if (document.visibilityState === 'visible' && startAt - serverNow() <= 0) fire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [mpActive, phase, startAt, seed, beginRun, setCollisionMode])

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
        <HUD
          score={eng.score}
          best={eng.best}
          speedPct={eng.speedPct}
          turboPct={eng.turboPct}
          invincibleSec={eng.invincibleSec}
          proximity={eng.proximity}
          onBoost={eng.setTouchBoost}
        />
      )}

      {/* Live-Rangliste während des Multiplayer-Rennens */}
      {mpActive && eng.uiState === 'playing' && <MpRanking room={mp.room} uid={user?.uid ?? null} offset={currentServerOffset()} />}

      {eng.uiState !== 'menu' && (
        <button className="mute-btn" onClick={eng.toggleMute} aria-label="Ton an/aus">
          {eng.muted ? '🔇' : '🔊'}
        </button>
      )}

      {/* --- Solo-Oberflächen --- */}
      {!mpActive && eng.uiState === 'menu' && (
        <StartScreen
          onStart={(mode) => void eng.beginRun(mode)}
          onMultiplayer={() => setMpActive(true)}
          user={user}
          lbRefreshKey={lbRefresh}
          onNameChange={() => setLbRefresh((k) => k + 1)}
        />
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
          onKick={(uid) => void mp.kick(uid)}
          onBack={() => setMpActive(false)}
        />
      )}
      {mpActive && eng.uiState === 'gameover' && (
        <MultiplayerResults room={mp.room} user={user} offset={currentServerOffset()} onRematch={() => void mp.rematch()} onLeave={leaveMultiplayer} />
      )}

      {/* Crash-Flash */}
      <div key={eng.flashKey} className={`flash${eng.flashKey > 0 ? ' active' : ''}`} />
    </div>
  )
}
