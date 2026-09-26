# Runaway Rivals 🏃💨

Chaotisches Jump-’n’-Run-Rennen fürs Handy – bis zu 4 Spieler, niedliche Comic-Tiere, ziemlich derbe Sprüche.
Leere Plätze füllen Bots. Kein Konto, kein App-Store: ein Link genügt.

## So holst du dir das Spiel aufs Handy
1. Öffne den Spiele-Link im Browser (iPhone: **Safari**, Android: **Chrome**).
2. Handy **quer** halten.
3. Als App speichern:
   - **iPhone:** Teilen-Knopf (□↑) → **„Zum Home-Bildschirm“**.
   - **Android:** Menü (⋮) → **„App installieren“** bzw. **„Zum Startbildschirm hinzufügen“**.
4. Ab jetzt startest du „Runaway Rivals“ wie eine normale App: im Vollbild und nach dem ersten Start auch ohne Internet (Einzelspieler).

## Steuerung
| Knopf | Was passiert |
|---|---|
| ⬆ links unten | **Springen** (länger halten = höher, in der Luft nochmal = **Doppelsprung**, an Wänden = **Wandsprung**) |
| ⬇ daneben | **Sliden** – in der Luft wird daraus **Stampfen** (fällt durch Planken) |
| großer Knopf rechts | **Power-Up** benutzen (nach links wischen = nach hinten werfen) |
| gelber Knopf | **Fähigkeit** deiner Figur (lädt sich mit Zeit und Münzen auf) |
| 😀 oben | **Emotes** |

Beim ersten Start gibt es eine kurze **Übungsrunde** (🎓 im Menü, jederzeit wiederholbar, +100 Münzen).

## So spielst du mit Freunden
1. Einer tippt **„Mit Freunden“ → „Raum erstellen“** und bekommt einen **Code aus 4 Zeichen**.
2. Die anderen tippen **„Mit Freunden“ → „Raum beitreten“** und geben den Code ein.
3. Der Gastgeber wählt Strecke oder Cup (oder lässt abstimmen), auf Wunsch **2 gegen 2** – dann **Start**.
4. Freie Plätze übernehmen Bots.

Tipps:
- Alle brauchen Internet. Die Handys verbinden sich direkt miteinander (kein eigener Server nötig).
- In manchen Firmen- oder Mobilfunknetzen klappt die Direktverbindung nicht – dann ins WLAN wechseln.
- Verlässt der Gastgeber das Spiel, bekommen alle anderen eine Meldung und landen wieder im Menü.

## Was es gibt
- 12 Strecken in 8 Welten mit 3 Stockwerken, Cups mit Siegerpodest, K.-o.-Cup, Geist deiner Bestzeit
- Streckeneditor: eigene Strecken bauen, testen und per Link teilen
- 9 Figuren mit eigener Stimme und Fähigkeit, 8 Power-Ups, brüllender Ansager, Musik für jede Welt
- Garderobe & Shop: gemalte Skins für jede Figur und Spuren, tägliche Schatzkiste und Tagesaufgaben
- **„Derb: an/aus“** oben im Menü schaltet die Schimpfwörter ab (dann zählt nur noch der Ansager)

## Für Entwickler
```bash
npm install
npm run dev       # Entwicklungsserver (auch im WLAN erreichbar)
npm test          # automatische Tests
npm run build     # fertige Dateien in dist/
```
Technik: Phaser 3 + TypeScript + Vite, PWA (vite-plugin-pwa), Mehrspieler per PeerJS (WebRTC).

### Veröffentlichen
- **GitHub Pages:** Der Workflow `.github/workflows/pages.yml` baut und veröffentlicht bei jedem Push.
  Einmalig nötig: *Settings → Pages → Source: „GitHub Actions“*. Kostenlos nur für **öffentliche** Repositories.
- **Netlify** (kostenlos, auch für private Repositories): Repository verbinden – Einstellungen kommen aus `netlify.toml`.
