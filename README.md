# EarthVisualizer

A browser-based 3D globe tool for building an airport route and downloading a video of the animated flight path.

- Interactive 3D globe (rotate/zoom), rendered with [globe.gl](https://github.com/vasturiano/globe.gl) — no API key needed.
- Search airports by IATA/ICAO code, airport name, or city (e.g. "JFK", "Tokyo", "London Heathrow").
- Build an ordered route (add stops in sequence, reorder, remove).
- "Play Route" animates arcs between stops one after another, with the camera following along.
- "Record" captures the animation and downloads it as a `.webm` video, entirely client-side (no server, no ffmpeg).

## Running it

Just open `index.html` in **Chrome or Firefox** (double-click it, or `open index.html`). No server or build step needed — the airport dataset is loaded as a plain `<script>` (`data/airports.js`), not fetched, so it also works over `file://`.

(A static server such as `python3 -m http.server 8000` works too, if you prefer.)

To host it in a container:

```bash
docker build -t earthvisualizer .
docker run -p 8080:80 earthvisualizer
```

Then open `http://localhost:8080`.

Safari does not reliably support the `MediaRecorder`/`canvas.captureStream` APIs used for recording, so the Record button is disabled there.

## Regenerating the airport dataset

`data/airports.js` is generated from the public-domain [OurAirports](https://ourairports.com/data/) dataset, filtered to airports with scheduled service (large + medium airports), to keep the file small and autocomplete results relevant.

```bash
python3 scripts/build-airports.py
```

This re-downloads the latest CSV and rewrites `data/airports.js` (`window.AIRPORTS_DATA = [...]`). No third-party Python packages are required.

## Notes / known limitations

- The globe texture and library (globe.gl) are loaded from a CDN (unpkg) at runtime, so an internet connection is required to use the app (the airport dataset itself is local/offline once generated). Airport labels are drawn as a 2D canvas overlay, positioned each frame via globe.gl's own `getCoords()`/`getScreenCoords()` projection utilities; when recording, the globe canvas and the label overlay are composited into a hidden canvas so the labels are included in the exported video too.
- Recording relies on `HTMLCanvasElement.captureStream()` + `MediaRecorder`, supported in Chrome and Firefox, not in Safari.
- Output video is WebM only (no MP4 export).
