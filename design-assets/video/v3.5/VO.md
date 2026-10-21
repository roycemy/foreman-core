# VO v3
Voice: en-US-BrianMultilingualNeural, pitch −4Hz, rate −3% (edge-tts). Text: vo_lines.txt ("Alter" spelled "Altar"; end line "Altar HQ dot app.").
Placement (s): 0.3, 4.8, 11.2, 15.0, 21.0, 28.0, 35.0 (VO ends 39.9).
Candidates (vo/<tag>, whisper small transcripts in whisper.txt):
- andrew (AndrewMultilingual −6Hz −6%): misheard "anybody", "spins", "box"; end line "Alt-A-H-Q-Dot-Up". Rejected.
- brian (−4Hz −6%): accurate, 40.5s total (too long for the slots).
- brian3 (−4Hz −3%): chosen. Accurate, fits the timings.
- davis / ryan: renders incomplete (edge-tts failures after retries). Not evaluated.
Pronunciation check: whisper on the final 16x9 mix (qa/whisper_final.txt) gives "Alter connects any bot…" and "AlterHQ.app". All 7 lines match the script word for word.
