# v2 music and mix

## Track
- **Title:** "Inspiration", by Kevin MacLeod.
- **License:** FreePD collection, public domain under CC0 1.0. Free for commercial use; no attribution required.
  - FreePD's own stance: https://codeberg.org/fineless71/FreePD (an archived mirror stating all FreePD music is CC0).
- **Source URL:**
  - Downloaded from the FreePD mirror at https://en.freepd.cn/music/upbeat (file `Upbeat/Inspiration.mp3`, via its `/api/music/…` link).
  - freepd.com itself has closed. Pixabay returned 403 to the box, so its tracks weren't usable here.
- **Local copy:** `v2/music/Inspiration.mp3`.
- **Recommendation:** keep a note of this provenance. For extra safety on a paid campaign, confirm the track against the original FreePD WAV pack or swap in a Pixabay track pulled from a desktop browser.
- **Tempo:** about 118–120bpm (autocorrelation estimate).
- **Edit point:** starts at its first downbeat (2.03s into the file) and runs 45s.
- **Alternates downloaded:** Motions, Advertime, From Page to Practice (same source) and Limit 70 (Wikimedia Commons, CC0).

## Mix
- **VO:** normalized to −17 LUFS.
- **Music:** normalized to −19 LUFS, then ducked by **−13 dB** under each VO line with a smooth gain envelope. It ramps in 0.25s before speech and releases over 0.5s after (sidechain-style, no jumps).
- **Measured:** music under the VO is −32.3 dB vs −19.6 dB in gaps, a 12.7 dB duck.
- **Final:** two-pass linear loudnorm to **−16.0 LUFS integrated, −1.5 dBTP**, LRA 3.3.
- **Loop:** music fades in 40ms and out over the last 1.6s. A 20ms/50ms edge fade guards against clicks. The VO ends at 44.06s, so the loop never cuts a word, and picture and audio both meet at off-white and silence at 45.0s.

## Cut points (s)
| Cut | Time |
|---|---|
| 1 → 2a | 4.5 |
| 2a → 2b | 8.0 |
| 2b → 3 | 11.0 |
| 3 → 4a | 18.0 |
| 4a → 4b | 21.6 |
| 4b → 5 | 25.5 |
| 5 → 6 | 31.0 |
| 6 → end | 37.6 |

Cuts follow the VO phrasing first and land within about a beat of the music grid (0.5s); none falls mid-word.
