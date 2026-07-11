---
name: demo-video
description: >-
  Plan, script, produce, and showcase HoneyMoney's <3-minute competition demo/pitch video for the
  MAIC Nexus Challenge 2026 (Track T3) — a screen-recording of the live app + Telegram with voiceover
  that walks the end-to-end flow (capture → parse → bucket → Honey insight → dashboard) while hitting
  every judging criterion. Covers structure/beat sheet, VO scriptwriting to a time budget, screen-
  recording production, audio + captions, retention/pacing, credible technical showcase, and upload/
  end-card. Edits docs/deck/DEMO_SCRIPT.md and the graph gallery. Use whenever creating, tightening,
  or reviewing the demo video or its script. Triggers on: "demo video", "video script", "voiceover",
  "shot list", "storyboard", "screen recording", "showcase", "record the demo", "captions", "b-roll".
---

# HoneyMoney — Demo video skill

Make a **<3:00** video that proves the product is real and working, lands the "wow" fast, and touches
every rubric criterion — without boring non-technical judges. You already have a solid
`docs/deck/DEMO_SCRIPT.md`; this skill tightens it to professional standard and drives production.

## When to use
- Writing / revising the demo-video script, beat sheet, or shot list.
- Planning the recording, editing, captions, and upload.
- Reviewing a cut for pacing, retention, and rubric coverage.

## When NOT to use
- The static deck / live spoken pitch → **pitch-deck** skill.
- In-app UI polish shown in the recording → fix it with **web-design** first, then record.

## Ground rules (non-negotiable)
1. **Hard cap 3:00; target 2:15–2:50.** Judges watch many entries — over-length gets cut off.
2. **Only real screens, no mockups.** If a feature isn't built, cut it — faking is a disqualifier and
   obvious to technical judges. HoneyMoney is live at honeymoney.app; use it.
3. **Hook in the first 5–10 seconds.** Lead with the problem/wow, not a slow logo intro. Retention is
   won or lost here (`references/video-production.md`).
4. **Captions always on.** Many judges watch muted; captions also = accessibility. Every VO line has a
   caption (the script already has a caption column — keep it).
5. **Cover the rubric in the demo arc:** Technical (real graph + capture), Commercial (B2B2C line),
   Relevance (Malaysian context/e-wallets), Scalability (one engine, 3 personas), ESG (local-first
   PDPA, financial inclusion). Map each beat to a criterion.

## Workflow (script → storyboard → record → edit → ship)
1. **Lock the beat sheet** (`references/video-structure.md`): hook → problem → solution/3-buckets →
   live capture → Honey insight → dashboard/projection → scale+impact → CTA/end card, with a seconds
   budget per beat that sums under 2:50.
2. **Write VO to time.** ~150–160 words/min → a 2:40 video ≈ 400–430 words *max*. Write for the ear:
   one idea per sentence, show-don't-tell, VO matches on-screen action. Trim mercilessly.
3. **Stage the demo data** so the payoff lands — a shared goal that's *about to slip* makes the Honey
   insight meaningful; pre-stage the Telegram screenshot for a fast parse.
4. **Record** per `references/video-production.md`: 1080p, do a clean silent screen pass first, then VO
   over it; use zoom/highlight on small UI; no dead air; keep the PC awake + stable.
5. **Edit**: front-load the wow, cut every slow second, add captions, balance music ~-18 to -24 dB
   under VO. Keep the six-view gallery moment tight and legible.
6. **Ship**: end card (logo · honeymoney.app · "MAIC Nexus 2026 · Track T3"), export 1080p MP4, upload
   YouTube-unlisted / Drive / Vimeo, set title + description (one-line pitch + live URL + repo), and
   **replace the placeholder link in `docs/REGISTRATION.md` §7** with the final URL.
7. **Review** against `references/video-checklist.md` before calling it done.

## The showcase angle (proving it's real without boring judges)
- Show the **knowledge graph** briefly and visually (Sankey/organic view) — enough to prove "there's
  a real model under here," then move on. Don't lecture the architecture.
- Use the **graph gallery** (`docs/deck/graph_gallery/`) as B-roll/screenshots where a live click
  would be slow.
- Emphasize the *human-in-the-loop* (you confirm the bucket) and *zero-token on-device capture* — both
  are credibility + differentiation beats.

## Files
| Artifact | File |
|---|---|
| Script / shot list | `docs/deck/DEMO_SCRIPT.md` |
| Screenshots / B-roll | `docs/deck/graph_gallery/*.png` |
| Final video | `docs/deck/HoneyMoney_Demo_MAIC2026.mp4` |
| Video URL to update | `docs/REGISTRATION.md` §7 |
| Live app to record | https://honeymoney.app (`/`, `/dashboard`, `/graph`) |

## Reference files (load as needed)
- `references/video-structure.md` — the <3-min beat sheet template (timecode → beat → seconds → job →
  rubric target) + VO word-budget math (cited).
- `references/video-production.md` — screen-recording, VO, music/dB, captions, retention/pacing rules
  (cited).
- `references/video-checklist.md` — production + pre-ship checklist and the "mistakes that lose
  viewers" list.

## Related skills
`pitch-deck` (deck + live pitch) · `finance-content` (VO wording + tone) · `run` (drive the live app
for recording) · `web-design` (fix UI before you film it).
