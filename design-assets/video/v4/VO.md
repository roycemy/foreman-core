# VO v4
Engine: Kokoro-82M (kokoro-onnx 1.0, Apache-2.0), running locally on CPU. Voice am_michael, with a speed set per line.
The script spells "Alter" as "Altar". Lines are rendered separately and placed in the mix with tuned silences (timeline.py).
Alternate voice: af_heart (Kokoro's top-graded voice), kept in tts/af_heart from an earlier draft of the script. Not chosen because whisper heard "Check the rule, then ask me" (it dropped the "-ed" endings).

Markup: [pause Ns] is the silence before the next line; *word* is emphasis (delivered through speed and placement); (speed).
| t | Line | Speed | Direction |
|---|---|---|---|
| 0.3 | Your AI bot just asked for *twelve hundred dollars.* [pause 0.4] | 1.00 | hook, level, close to the mic |
| 3.8 | Did you *approve* it? [pause 0.6, hard cut] | 0.88 | wry question |
| 5.5 | It started with one *small* favor. [pause 0.45] | 0.86 | slow, curious |
| 8.0 | Book the team offsite. Buy what's needed. [pause 0.4] | 0.90 | quoting the task |
| 11.0 | With Altar, four bots share *one* card. You hold the keys. [pause 0.15] | 0.92 | value up front |
| 15.0 | So they got to work. Splitting it up. Handing it off. [pause 0.25] | 1.12 | quicker |
| 17.9 | Then Scout found a venue. [HELD PAUSE 1.5, music drops] | 0.96 | |
| 20.9 | *Twelve hundred* dollars. Deposit due today. [pause 0.4] | 0.90 | weight |
| 24.3 | Scout has great taste. And a *five hundred* dollar limit. [pause 0.4] | 1.00 | the humor beat |
| 28.0 | Altar caught it. Checked the rule. Then asked me. [pause 0.55] | 1.00 | |
| 31.2 | *Deny.* [pause 1.2] | 0.85 | relief |
| 33.1 | Badges and snacks? Sure. [pause 1.4] | 1.00 | light |
| 36.1 | And the bots kept going. Inside their limits. [pause 0.5] | 0.97 | |
| 39.5 | Your bots work. You stay in control. [SILENCE 1.0] | 0.88 | callback, confident |
| 43.0 | Claim your founding spot. | 0.92 | short and quotable |

Whisper (small) on the final mix is in qa/whisper_final.txt. Every line is word-perfect except "Did you approve?", where the music masks "it"; the isolated line reads "Did you approve it?". The brand is heard as "Altar" twice (the AWL-ter pronunciation). Per-line transcripts are in tts/whisper_lines_michael.txt.
