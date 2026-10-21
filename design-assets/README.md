# Alter design assets

Pure design/video assets. Not wired into the app; nothing here is imported by app code.

| Folder | What it is |
|---|---|
| `video/` | Hero demo video work, v2 through v5: shot lists, VO scripts, music/mix/film/encode pipeline (`rec3.cjs`, `music3.py`, `mix3.py`, `film3.py`/`film4.py`, `enc.sh`), voice samples, QA grabs, and the final masters per version (`master-d.mp4` 16:9, `master-m.mp4` 9:16, `master-d-nocap.mp4` no captions). v3.8 is latest; v5 holds unused script concepts. |
| `invite/` | Founding-member invite visuals (lit-on-dark HQ floor, glowing reserved seat) and render scripts. |
| `site/` | White site redesign (home, pricing, security, sign-in) with the hero video embedded. |
| `animations/` | 23 bot animation mockups: pose sheets, strips, and the trigger list (design only, not built). |
| `pack-v2/`, `pack-v3/` | Alter design pack v2 and v3 (spec, tokens, components, fonts, shots, tools). |

Excluded to keep the repo small: raw screen recordings (`clips/`), frame dumps (`frames/`), end-card frame sequences, WAV stems, build logs, and the Kokoro TTS model (`.onnx`, >95MB). All are reproducible with the scripts here.
