// ===========================================================================
// Firebase-Initialisierung. Liest die Konfiguration aus den Umgebungsvariablen
// (.env.local bzw. Vercel-Dashboard). Exportiert die zentralen Dienste:
// Auth und Firestore.
//
// Fehlende Variablen werden VOR initializeApp geprüft: getAuth() würde sonst
// synchron während der Modul-Evaluierung werfen — Ergebnis wäre ein leerer
// weißer Screen ohne jeden Hinweis (React mountet nie).
// ===========================================================================

import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  // Für Multiplayer (Realtime Database) erforderlich.
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
}

const REQUIRED: Array<keyof typeof firebaseConfig> = ['apiKey', 'authDomain', 'projectId', 'appId']
const missing = REQUIRED.filter((k) => !firebaseConfig[k])
if (missing.length > 0) {
  const msg = `Firebase-Konfiguration unvollständig: ${missing.map((k) => 'VITE_FIREBASE_' + k.replace(/[A-Z]/g, (c) => '_' + c).toUpperCase()).join(', ')} fehlt. Umgebungsvariablen im Vercel-Dashboard (bzw. .env.local) prüfen.`
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = `<div style="color:#fff;font-family:system-ui;padding:40px;text-align:center"><h2>⚠️ Konfigurationsfehler</h2><p>${msg}</p></div>`
  }
  throw new Error(msg)
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
