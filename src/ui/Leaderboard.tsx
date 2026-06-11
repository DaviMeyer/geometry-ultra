// Leaderboard — Bestenliste (Top 10) aus Firestore.
// mode 'global' -> Gesamt-Bestenliste, mode 'daily' -> Tages-Challenge (per Seed).
// Lädt neu, wenn sich `refreshKey` ändert (z.B. nach einem hochgeladenen Score).

import { useEffect, useState } from 'react'
import { fetchDailyTop, fetchTopScores, type ScoreEntry } from '../firebase/scores'

interface LeaderboardProps {
  mode?: 'global' | 'daily'
  seed?: number
  refreshKey?: number
  highlightUid?: string | null
}

export function Leaderboard({ mode = 'global', seed, refreshKey = 0, highlightUid = null }: LeaderboardProps) {
  const [entries, setEntries] = useState<ScoreEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(false)

    const loader = mode === 'daily' && seed !== undefined ? fetchDailyTop(seed, 10) : fetchTopScores(10)

    loader
      .then((e) => {
        if (active) {
          setEntries(e)
          setLoading(false)
        }
      })
      .catch((err) => {
        console.error('Bestenliste konnte nicht geladen werden:', err)
        if (active) {
          setError(true)
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [mode, seed, refreshKey])

  return (
    <div className="leaderboard">
      <div className="lb-title">{mode === 'daily' ? '📅 Heutige Challenge' : '🏆 Bestenliste'}</div>
      {loading && <div className="lb-msg">Lädt…</div>}
      {error && <div className="lb-msg">Konnte nicht geladen werden</div>}
      {!loading && !error && entries.length === 0 && <div className="lb-msg">Noch keine Einträge — sei der Erste!</div>}
      {!loading && !error && entries.length > 0 && (
        <ol className="lb-list">
          {entries.map((e, i) => (
            <li key={e.uid} className={`lb-row${e.uid === highlightUid ? ' me' : ''}`}>
              <span className="lb-rank">{i + 1}</span>
              {e.photoURL ? <img className="lb-avatar" src={e.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="lb-avatar placeholder" />}
              <span className="lb-name">{e.displayName}</span>
              <span className="lb-score">{e.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
