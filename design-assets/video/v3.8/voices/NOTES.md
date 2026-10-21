# Narrator auditions (v3.6) — not in the film yet
Engine: Chatterbox TTS (Resemble AI, MIT license, weights MIT), CPU, gen_cb.py. Timbre prompts are synthetic Kokoro-82M clips (Apache-2.0) in ref/, so no real person's voice is cloned.
Lines: VO 1 + 2 from v3.5 ("Alter" written "Altar"). Loudness -16 LUFS. Whisper (small) transcripts in whisper.txt: all words correct; "Alter/Altar" both = AWL-ter.
- sample-warm-male.mp3 — US male, mid-low, relaxed (exaggeration 0.45). Closest to the current narrator, much less flat. 11.8s
- sample-warm-female.mp3 — US female, warm, conversational (0.5). 10.8s
- sample-british-male.mp3 — UK male, calm documentary feel (0.4); slowest, 12.8s, would need tightening for the slots.
- sample-bright-female.mp3 — US female, brighter and more energetic (0.6). 10.6s
Excluded: XTTS (CPML non-commercial), F5-TTS (pretrained weights CC-BY-NC). StyleTTS2 not tried.
