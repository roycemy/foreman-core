# Music and pacing

## The bed
- **Files:**
  - Source: `out/alter-hero-music.wav` (44.1kHz stereo, 45.0s).
  - Synthesized by `music.py` (numpy).
- **Rights:** fully original and royalty-free, with no samples.
- **Tempo and key:** 120bpm, C major. One bar is 2.0s and one beat is 0.5s.
- **Progression:** Cmaj9, Am7, Fmaj7, G6, one chord per bar, looping every 8s.
- **Layers:**
  - Soft detuned pad.
  - Eighth-note sine plucks on chord tones.
  - Eighth-note sine bass with offbeat accents.
  - 4-on-the-floor kick.
  - Clap on beats 2 and 4.
  - Offbeat hats.
- **Levels:** about −18.5 dB mean, −1.9 dB peak. AAC at 96k in the muxed files.
- **Quality, honestly:** it's a clean, simple, upbeat pulse. It reads as "tech-calm", but it's plainly synthesized (sine and noise voices, no mixing or mastering). It will do as a placeholder. For launch, swap in a licensed track at 120bpm and the cut points below still land. The `*-noaudio.mp4` files are the intended autoplay assets anyway, because browsers autoplay muted.

## Cut points (s), against bars at 2s and beats at 0.5s

| Cut | Time | On grid |
|---|---|---|
| Hook → Connect | 4.0 | bar 3 downbeat |
| Connect → Team | 11.0 | beat 3 of bar 6 (deliberate push) |
| Team → Ask | 20.0 | bar 11 downbeat |
| Ask → Split | 23.0 | beat 3 of bar 12 |
| Split → Approve | 28.0 | bar 15 downbeat |
| Approve tap | ≈29.5 | on a beat |
| Deny tap | ≈32.1 | close to beat |
| Approve → Card limits | 35.0 | beat 3 |
| Card → End card | 38.0 | bar 20 downbeat |
| Logo dot lights | 38.7 | about a 16th early of beat |
| Fade to off-white | 44.0–44.93 | |

To snap the taps exactly to the beat, nudge `pss` / `ss` in `build.py` by up to 0.2s.

## Loop
- **Picture:** frame 0 is solid #F4F4F1, fading up over 0.35s. The last frame is also solid #F4F4F1, after a 0.93s fade. The loop point is therefore an off-white to off-white seam with no flash.
- **Audio:** it fades in over 0.25s and out over the last 1.2s, so the wrap is silent to silent and doesn't click. If you want a seamless musical loop (no dip), crossfade the last bar into the first bar in an editor; the 8s progression fits exactly into 45s only as 5 full cycles plus 5s, so the dip is the cleaner choice.
- **Pacing:** about 11 shots in 45s, with no shot over 9s. Push-ins are 6–15% over a shot. There are no whip pans or flashes.
