// NicknameDialog — hübsches Modal zum Setzen/Ändern des Nicknames.
// Wird in zwei Varianten genutzt:
//   - firstTime: Willkommens-Aufforderung direkt nach dem ersten Login
//     (Überspringen erlaubt -> Google-Name wird wie bisher verwendet)
//   - sonst: normales Ändern über das ✏️ im User-Chip
// Speichern mit leerem Feld löscht den Nickname (zurück zum Google-Namen).

import type { User } from 'firebase/auth'
import { useState } from 'react'
import { getNickname, getPlayerName, setNickname } from '../firebase/displayName'

/** Anzeige-Limit im Eingabefeld (truncateName kürzt zusätzlich auf NAME_MAX). */
const NICK_MAX = 24

interface NicknameDialogProps {
  user: User
  firstTime: boolean
  onClose: () => void
  /** Wird aufgerufen, wenn sich der angezeigte Name tatsächlich geändert hat. */
  onSaved?: () => void
}

export function NicknameDialog({ user, firstTime, onClose, onSaved }: NicknameDialogProps) {
  const [draft, setDraft] = useState(getNickname() ?? '')
  const googleName = (user.displayName ?? '').trim() || 'Spieler'
  const trimmed = draft.trim()

  const save = () => {
    const before = getPlayerName(user)
    setNickname(draft)
    if (getPlayerName(user) !== before) onSaved?.()
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{firstTime ? 'Willkommen! 👋' : 'Nickname ändern'}</h2>
        <p className="modal-text">
          {firstTime
            ? 'Wähle einen Namen, unter dem du in den Bestenlisten und im Multiplayer auftauchst. Du kannst ihn jederzeit wieder ändern.'
            : 'So tauchst du in den Bestenlisten und im Multiplayer auf.'}
        </p>

        <input
          className="nick-input-lg"
          autoFocus
          maxLength={NICK_MAX}
          placeholder={googleName}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') onClose()
          }}
        />
        <div className="nick-counter">{trimmed ? `${trimmed.length}/${NICK_MAX}` : `Leer lassen → „${googleName}" wird genutzt`}</div>

        <div className="modal-actions">
          <button className="btn secondary" onClick={onClose}>
            {firstTime ? 'Überspringen' : 'Abbrechen'}
          </button>
          <button className="btn" onClick={save}>
            Speichern
          </button>
        </div>
      </div>
    </div>
  )
}
