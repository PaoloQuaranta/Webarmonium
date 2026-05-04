# Capture Brief — Webarmonium Visual Assets

Step-by-step instructions for producing every asset listed in [`README.md`](README.md). Designed so you can do the entire shoot in one session, ~90 minutes.

---

## Pre-flight (10 min)

1. **Use a clean browser profile** with no extensions visible, no bookmarks bar, no other tabs.
2. **Set browser zoom to 100%.**
3. **Window dimensions:** 1920×1080 for landscape captures (full HD). Use OS screenshot tool's "selection" mode and round to even pixel boundaries.
4. **Disable system notifications and screen-saver.**
5. **Check the time of day** — for "live" feed shots, mid-afternoon EU/US gives the highest event rate from all three sources (more interesting feed entries).
6. **Have a second device or phone ready** to act as a second collaborative-room user for room shots.
7. Open https://webarmonium.net in a fresh tab. Do **not** open the About panel.

---

## Asset 1 — `hero-1920.png` (PRIMARY)

**This is the single most important shot. It is what curators will look at first.**

1. Land on https://webarmonium.net. Do not press Start yet.
2. Wait ~8 seconds for the visible-causality feed to populate with at least 3 entries.
3. Press **Start**.
4. Let the work run for ~30 seconds so the canvas has accumulated some visual content (cursors, particles, attractors).
5. **Just before capture**: confirm the feed has at least one Wikipedia entry, one HN, one GitHub — ideally with recognisable titles (avoid spam/test page titles like "User:..." or "Sandbox").
6. Capture the full viewport at 1920×1080.
7. **Reject and reshoot if:**
   - Feed is empty
   - Any entry shows a Wikipedia user page or test sandbox
   - The metrics dashboard cards are visually misaligned
   - Any error overlay or notification banner is visible

**Crop variants** to derive from this same shot or close-cousin captures:
- `hero-square-2000.png` — recompose for a 2000×2000 frame, ensure feed and at least one cursor are inside the square
- `hero-portrait-1080.png` — vertical orientation for IG stories; the feed should be the dominant element

---

## Asset 2 — `landing-feed-detail.png`

Tight crop showing the visible-causality feed alone, populated, with the audio-running state (teal pulsing dot, no "press Start to hear" pill).

1. Land, press Start, wait ~15 seconds for 4–5 entries to accumulate.
2. Crop to the feed bounding box + ~40px margin on all sides.
3. Output dimensions: ~600px wide minimum (so it stays sharp when reproduced at 320px article-body width).

---

## Asset 3 — `room-1920.png`

1. From the landing page, click **Join → Jam**, choose any room (or create one).
2. From your phone or second computer, open the same room in a different colour.
3. Both users move and tap so multiple cursors are visible.
4. Optional: have one user start the audition mode so phrases are firing.
5. Capture full viewport at 1920×1080.
6. **Reject if:**
   - Only one cursor visible (defeats the "collaborative" point)
   - Settings panel partially open
   - The room ID overlay obstructs the canvas

---

## Asset 4 — `room-detail-synth.png`

1. In a room, open the synth panel (the sound-design controls).
2. Compose the shot so all 8 preset selectors and the per-voice knobs are legible.
3. Capture the panel + a small slice of canvas behind it for context (~1400×900).

## Asset 5 — `room-detail-sequencer.png`

1. Open the sequencer submenu and program a recognisable pattern (4–6 steps active).
2. Let it play one cycle so the active step indicator is visible.
3. Capture (~1400×900).

## Asset 6 — `room-detail-drums.png`

1. Open the drum machine submenu, select one kit (e.g. 808).
2. Capture (~1400×900).

---

## Asset 7 — `documentation-video-3min.mp4`

This is the festival-submission video. Required by Ars Electronica Prix, STARTS, Lumen, Sonar+D, MUTEK.

**Structure (3:00 total):**

| Time | Content | Notes |
|---|---|---|
| 0:00 – 0:10 | Title card: "Webarmonium / Paolo Quaranta / 2026" on dark background, no audio yet | Generated separately, edited in post |
| 0:10 – 0:40 | Landing page in pre-roll state. Feed populating silently. | Voice-over or text overlay: "The work listens to the public web in real time…" |
| 0:40 – 1:20 | Press Start. Audio fades in. Hold on the landing page with feed clearly legible. | Let the audio breathe. Don't talk over the music. |
| 1:20 – 1:50 | Cut to the visible-causality feed close-up, then to the canvas. Text overlay points at one entry: "Napoleon edited · C#4 · just now" with a visible note hit at that moment. | Synchronise the cut so a real entry → real audible note coincides |
| 1:50 – 2:30 | Cut to a collaborative room with 2–3 active users. Show gestures producing notes. Briefly show sequencer + drum kit + synth panel being shaped. | Use the in-page recorder (composition monitor → record) for synced A/V |
| 2:30 – 2:55 | Wide shot back on the landing page. Audio continues. | Let the work speak |
| 2:55 – 3:00 | End card: "webarmonium.net" | Same typeface as title card |

**Capture method:** Use the in-page A/V recorder added in v0.8.13 (composition monitor → record). For the multi-user room shots, run two recorders simultaneously and pick the cleaner take.

**Audio levels:** Normalize to -16 LUFS integrated for streaming compatibility.

**Format:** MP4, H.264 video, AAC audio, 1080p, 30fps.

---

## Asset 8 — `social-loop-30s.mp4` and `.gif`

A focused 30-second loop suitable for embedded media in CAN articles, Twitter posts, IG reels.

1. Capture 60 seconds of the landing page mid-flow (after Start, after the feed has stabilised).
2. In post, trim to the cleanest 30-second segment with the feed actively populating.
3. Export MP4 at 1080×1080 (square) and a GIF version at 720×720 (smaller filesize).

---

## Asset 9 — `feed-detail-loop-15s.gif`

A close-up loop of the visible-causality feed populating, no other UI visible.

1. Capture 30 seconds focused on just the feed area.
2. Trim to a clean 15-second loop where 3–4 entries enter and fade.
3. Export GIF at 600×400 (compact, optimised for article body).

---

## Post-production notes

- **No filters, no colour grading, no music overlay.** The work's own sound is the only audio.
- **Captions/subtitles** should be added separately in editing software, not burnt into the source capture.
- **All assets shipped without watermarks** — the credit line is in the press kit text, not on the image.

---

## Reject / reshoot checklist (apply to every asset before finalising)

- [ ] No system UI visible (taskbar, notifications, browser chrome)
- [ ] No personal info visible (email in browser tab, profile picture, timezone in dashboard)
- [ ] No spam / test page titles in the feed (e.g. Wikipedia user pages, test sandbox edits)
- [ ] All text in the shot is legible at the target reproduction size
- [ ] Colours are accurate (no colour-profile shift from screen-cap tool)
