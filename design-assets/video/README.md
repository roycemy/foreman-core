# alter-video

## Deliverables (in `out/`)
- `alter-hero-16x9.mp4` and `alter-hero-9x16.mp4`, plus `*-noaudio.mp4` variants.
- Posters `*-poster.jpg` and `*-poster.png`, taken at 3.6s.
- `alter-hero-music.wav`.
- Contact sheets.

## Pipeline
1. `rec.cjs <scene> <d|m>` records the real app.
   - Serve `foreman-core/public` on :5055. The app is opened as `http://alter-demo.vercel.app` (requests are routed to localhost by Playwright), so the connect wizard's preview-origin guard passes.
   - `/api/*` is mocked in-process.
   - Capture method: CDP screencast for desktop, a screenshot loop for phone.
2. `caps.cjs` renders the caption plates and end cards in Geist.
3. `music.py` synthesizes the 120bpm bed.
4. `build.py` produces the segments (zoompan push-ins, phone frames, captions), then master-d and master-m.
5. Encode (2-pass x264 at 1.1Mbps, yuv420p, faststart, AAC 96k), as run in the shell. See the final report.
