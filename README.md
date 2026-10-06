# Kompass

HTL-Schulbegleiter fürs iPad: Stundenplan, Aufgaben, Noten, Prüfungen und Kalender. Läuft offline als PWA, alle Daten bleiben auf dem Gerät (IndexedDB), kein Login, kein Server.

## Phase 1 (dieser Stand)

- **Heute** – laufende Stunde mit Restzeit, Fälliges bis morgen, Countdown zur nächsten Prüfung
- **Stundenplan** – Doppel- und Blockstunden (bis 6 Std.), A/B-Wochen, eigenes Stundenraster
- **Aufgaben** – Fach, Datum, Priorität, Status, Filter/Sortierung, Wischen zum Erledigen/Löschen, Badge
- **Noten** – österreichische Skala 1–5, Gewichtung je Fach (Standard 60/30/10) mit 100-%-Warnung, gewichteter Schnitt, Tendenz, umgedrehtes Trenddiagramm (1 oben)
- **Notenrechner** – welche Note brauche ich bei der nächsten Schularbeit für mein Ziel?
- **Prüfungen**, **Kalender**, **Fach-Detailseite**
- **Sicherung** – Export/Import als JSON (Einstellungen)

## Entwickeln

```bash
npm install
npm run dev      # http://localhost:5173/kompass/
npm run build
```

## Veröffentlichen

Jeder Push auf `main` baut die App über GitHub Actions und stellt sie auf GitHub Pages bereit
(Repo → Settings → Pages → Source: **GitHub Actions**). Heißt das Repo nicht `kompass`, in `vite.config.ts` die Zeile `const base = '/kompass/'` anpassen.

Am iPad: Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm".
