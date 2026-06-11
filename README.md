# Geometry Ultra 🟦

3D-Neon-Runner (Geometry-Dash-artig) mit Three.js, React und TypeScript.
Springe, weiche seitlich aus, sammle Kristalle und überlebe so lange wie möglich.

Dieses Projekt entsteht in mehreren Phasen. **Aktueller Stand: Phase A abgeschlossen.**

---

## Schnellstart (lokal)

Voraussetzung: [Node.js](https://nodejs.org/) (Version 18 oder neuer).

```bash
npm install      # Abhängigkeiten installieren (nur beim ersten Mal)
npm run dev      # Entwicklungsserver starten -> http://localhost:5173
```

Weitere Befehle:

```bash
npm run build    # Production-Build (prüft auch die TypeScript-Typen)
npm run preview  # den Production-Build lokal ansehen
```

## Steuerung

| Taste | Aktion |
| --- | --- |
| `Leertaste` / `↑` / Klick | Springen (Doppelsprung möglich) |
| `A` `D` / `←` `→` | Seitlich ausweichen |
| `Shift` | Dash / Boost |
| `M` | Ton an/aus |
| `Enter` / `Leertaste` (im GameOver) | Neustart |

---

## Projektstruktur

```
src/
├─ game/            # Spiel-Engine (reines TypeScript, kein React)
│  ├─ Engine.ts     #   orchestriert alles + Render-/Update-Schleife
│  ├─ scene.ts      #   Renderer, Kamera, Licht, Boden, Sterne
│  ├─ world.ts      #   Hindernisse + deterministischer Level-Generator
│  ├─ player.ts     #   Cube, Bewegungsphysik, Spur
│  ├─ particles.ts  #   Partikel-Effekte
│  ├─ audio.ts      #   synthetischer Sound (WebAudio)
│  ├─ input.ts      #   Tastatur + Touch
│  ├─ rng.ts        #   deterministischer Zufall (Seed -> gleiches Level)
│  └─ types.ts      #   Konstanten, Farben, Typen
├─ ui/              # React-Komponenten (Start, HUD, GameOver)
├─ hooks/
│  └─ useEngine.ts  # verbindet die Engine mit React
├─ styles/          # CSS (Neon-Look)
├─ App.tsx          # Wurzel-Komponente
└─ main.tsx         # Einstiegspunkt
```

### Warum diese Aufteilung?

Die **Spiel-Engine** kennt React nicht – sie läuft komplett für sich und meldet
sich nur über Callbacks (Score, GameOver). React kümmert sich um die
**Oberfläche** (Menüs, HUD). So bleibt beides übersichtlich und unabhängig
testbar.

Der **deterministische Zufall** (`rng.ts`) ist die Basis für die nächsten
Phasen: Gleicher Seed = exakt gleiches Level. Das brauchen tägliche Challenge,
Geister und Multiplayer.

---

## Roadmap

- [x] **Phase A** – Projektgerüst + Spiel in saubere Module aufteilen
- [x] **Phase B** – Google-Login (Firebase) + globales Leaderboard
- [x] **Phase C** – Tägliche Challenge + Geister
- [x] **Phase D** – Echtzeit-Multiplayer (Seed-Rennen)
- [ ] **Phase E** – Deployment auf Vercel (eigene Subdomain)

## Multiplayer einrichten (Realtime Database)

1. Firebase-Console → **Realtime Database** → erstellen (Europa-Region).
2. Die angezeigte URL (z.B. `https://geometry-ultra-default-rtdb.europe-west1.firebasedatabase.app`)
   in `.env.local` als `VITE_FIREBASE_DATABASE_URL` eintragen.
3. Tab **Regeln** → Inhalt aus `database.rules.json` einfügen → veröffentlichen.

Hinweis: Die RTDB-Regeln erlauben jedem angemeldeten Nutzer, Räume zu lesen/schreiben
(Räume sind per zufälligem 4-Zeichen-Code „versteckt"). Für ein Casual-Game ist das
ausreichend; härterer Schutz bräuchte feinere Regeln oder Cloud Functions.

## Deployment (Vorschau)

Das Projekt ist eine statische Single-Page-App und lässt sich auf
[Vercel](https://vercel.com/) deployen:

- Build-Befehl: `npm run build`
- Ausgabeordner: `dist`

`vercel.json` ist bereits vorbereitet (SPA-Fallback). Firebase-Schlüssel und
die Subdomain folgen in den nächsten Phasen.
