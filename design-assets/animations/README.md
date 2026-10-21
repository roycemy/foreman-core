# Alter poses pack (mockups only, nothing pushed)
- shots/00-overview.png: floor at 1440 and 390 plus the six poses
- floor/floor-1440.png and floor-390.png: mixed state (ChatGPT asleep, Poke idle, Grok Bot working, Instinct and Manus meeting, Muse dozing, Devin idle). floor-390-tap-bed.png shows the re-paste card after tapping the bed
- sheets/poses-{1440,390}.png: close-ups of P1–P6 and the re-paste card
- sheets/actions-contact-{1440,390}.png: all 23 actions (key frames)
- strips/t1–t4-*.png: the four transitions. strips/actions-strips-*.png: frames for every action
- TRIGGERS.md: pose → signal → code source → reduced motion, plus gaps. SPEC.md: layout, timings, easing, labels
- poses.js, defs.js, strips.js, floorscene.js, render.js, tools/: the renderer (real floor.js figures, harness from alter-pack-v3). Run `node tools/shoot.js tools/j4.js`
