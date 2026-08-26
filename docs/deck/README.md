# HoneyMoney Pitch Deck Files

This folder contains the registration-ready pitch deck for MAIC Nexus 2026 (Track T3).

This folder holds all **three mandatory MAIC upload PDFs** and their HTML sources, plus the
technical architecture companion document.

Build every PDF with `node scripts/build-doc-pdfs.mjs` — it checks the page ceiling and, more
usefully, diffs every run of prose in the HTML against the text in the exported PDF, so copy the
fixed layout silently ate fails the build instead of shipping.

## Files (upload the three PDFs)

| Upload PDF | HTML source | What it is |
| --- | --- | --- |
| `HoneyMoney_Pitch_Deck_MAIC2026.pdf` | `PITCH_DECK.html` | 13-slide 16:9 deck, every slide mapped to a judging criterion (see the `/pitch-deck` skill). Artwork lives in `deck_assets/`, extracted from the previous flattened export so the words are editable again. |
| `HoneyMoney_Project_Summary_MAIC2026.pdf` | `PROJECT_SUMMARY.html` | 1-page project summary |
| `HoneyMoney_AI_Disclosure_MAIC2026.pdf` | `AI_DISCLOSURE.html` | AI disclosure statement: what the AI does at runtime, what a cloud model receives, the tools used to build it, and what we cannot see. One page, 500-word cap. |
| `HoneyMoney_Technical_Architecture_MAIC2026.pdf` | `TECHNICAL_ARCHITECTURE.html` | **Companion document, added 27 Aug 2026.** Two pages: layers, the knowledge graph and its invariants, the derived views, the Ask Honey pipeline, the security architecture, and the command that verifies each claim. Not one of the 500-word notices; ceiling of three pages, enforced by the same build script. |

## Update and re-export

1. Edit the relevant `.html` file.
2. Re-export in Windows PowerShell (Chrome; swap the exe path for Edge if needed —
   `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`):

```powershell
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
& $chrome --headless --disable-gpu --no-pdf-header-footer --print-to-pdf='C:\2026_honeymoney\docs\deck\HoneyMoney_Pitch_Deck_MAIC2026.pdf'      'file:///C:/2026_honeymoney/docs/deck/PITCH_DECK.html'
& $chrome --headless --disable-gpu --no-pdf-header-footer --print-to-pdf='C:\2026_honeymoney\docs\deck\HoneyMoney_Project_Summary_MAIC2026.pdf' 'file:///C:/2026_honeymoney/docs/deck/PROJECT_SUMMARY.html'
& $chrome --headless --disable-gpu --no-pdf-header-footer --print-to-pdf='C:\2026_honeymoney\docs\deck\HoneyMoney_AI_Disclosure_MAIC2026.pdf'   'file:///C:/2026_honeymoney/docs/deck/AI_DISCLOSURE.html'
```

## Demo video placeholder

Current placeholder used in registration file:

- `https://example.com/honeymoney-demo-coming-soon`

Replace this with the final uploaded video URL (YouTube unlisted, Google Drive share link, or Vimeo).
