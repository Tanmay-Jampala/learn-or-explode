# QA for v2 (15 Nov 2026)

Scope agreed with the team: **lean checks in Microsoft Edge**, not the brief's full three-browser / Lighthouse
checklist. Tests live in the project repo at `tests/test_site_v2.py` (pytest + Playwright).

## Results

| Check | How | Result |
|---|---|---|
| `npm run build`, including the §2 number check (46 values) | build script | **Pass** |
| Tag `v1-presented` exists and is pushed | git | **Pass** |
| Home page loads with zero console errors or warnings, no sideways scroll, all 14 figures and 7 run cards | Edge at 1920×1080, 1366×768, 390×844 | **Pass** |
| Zero requests to other origins (fully offline) | request log, file:// | **Pass** |
| Works from file:// (double-click) | full suite, 22 tests | **Pass** |
| Works from `python -m http.server` | 7 core tests | **Pass** |
| Works from GitHub Pages | core tests against the live URL after deploy | see below |
| `#demo` cold load opens the experiment; `#demo?preset=3` selects η = 1.12 | test | **Pass** |
| Keys `1`–`4` (also Numpad), `Space`, `R`, `S`, `F`, `+`/`−` via `event.code`; Shift doesn't matter; the page never scrolls | test | **Pass** |
| η = 1.00 → converged in 59 steps, factor 0.7777 | test | **Pass** |
| η = 1.12 → converged in 1,637 steps, factor 0.9911 | test | **Pass** |
| η = 1.13 → "Exploded: ‖w‖ passed 10⁶ at step 1,471.", factor 1.0089, zoom ×370,728 | test + screenshot | **Pass** |
| Any η (1.125, 0, 8.997, 1000, −3, text) never shows NaN or Infinity and never errors | test | **Pass** |
| Hall-of-fame labels match §2 (621 · 119 · 59 · 323 · 1,637 · exploded 1,471 · exploded 299) | test | **Pass** |
| Old v1 links (`#part3`, `#runs`, `#story`, unknown) show the home page, never blank | test | **Pass** |
| Figure drawer opens with KaTeX; menu navigates to the experiment | test | **Pass** |
| Reduced motion: statement fully visible, scribbles fully drawn | test | **Pass** |

## Performance (measured, 1920×1080, Edge)

| | First paint | Load | Hero frame (median / p95) | Scroll frame (median / p95) |
|---|---|---|---|---|
| Real window, hardware GPU | 264 ms | 1.28 s | 17 / 33 ms | 17 / 33 ms |
| Headless, software GPU | 692 ms | 3.42 s | 250 / 350 ms | 50 / 250 ms |

On a real GPU the page runs at 60 fps with occasional 30 fps frames. Without a GPU the hero is slow; its
quality tier lowers the pixel ratio after 90 slow frames. Transfer size is about 4.5 MB on disk
(index, dist, figures), under the 6 MB budget.

## Not checked (outside the agreed lean scope)

- Firefox and WebKit/Safari.
- Lighthouse accessibility score and a keyboard-only walkthrough by a person. Automated checks cover the
  menu, drawer, keys and focus outlines only.
- A DevTools performance profile and layout-shift measurement.
- A real phone, and scanning the QR code.

## Media for the deck

`media/web_demo.mp4` (1920×1080, H.264, yuv420p, 35.6 s, no audio: `#demo` → presets 1, 2, 3, 4 → `S`),
`media/web_demo_screenshot.png` (η = 1.13 exploded) and `media/home_hero.png` (lens over the valley).
They are in the project folder, made by `tools/record_v2.py`.
