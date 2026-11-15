# Decisions (v2 redesign)

Choices made where the brief left room, plus every deviation from it.

## Asked and agreed

- **Build:** Node.js 26 installed with winget; esbuild, Three.js, GSAP, Lenis and KaTeX as the brief asks.
- **Testing:** lean checks in Edge only (see QA_V2.md), not the full three-browser / Lighthouse checklist.
- **Team links:** Notebook (the notebook's HTML export, now public at `notebook/`) and GitHub. There is
  no report or slides link because those files are not in the repo.

## Deviations from the brief

1. **Experiment is a view, not a separate HTML page.** `#demo` swaps the home content for the experiment
   in the same `index.html`, which keeps one bundle and makes `#demo` work from a cold load, a QR scan and file://.
2. **Badge states:** CONVERGING / CONVERGED / EXPLODING as the brief says. The v1 "zig-zag" message is kept
   as the badge's second line when η > 1/λmax = 0.5625, since the slider marks that point.
3. **Keys while a control has focus:** keys are ignored in text inputs, but still work while the η slider or
   a checkbox has focus. Otherwise pressing `4` right after dragging the slider would silently do nothing.
4. **Hall-of-fame cards open the experiment** at their own η through `#demo?eta=…` (an extra parameter;
   `?preset=1..4` is unchanged). Any η is clamped to 0–20 and shown safely.
5. **Greek in capitals:** CSS upper-case would turn η into "H". A small script wraps Greek letters so labels
   keep the lower-case letter. Mona Sans and Instrument Serif have no Greek; Greek falls back to the bundled
   KaTeX_Main font, so it still renders offline.
6. **Figures:** the 14 notebook PNGs are converted to WebP at 800 px (1x) and 1600 px (2x). The animated GIF
   is not on v2 (fig12 shows the same result as a still).
7. **The footer island** reuses the hero's terrain in a second small WebGL view that only renders while visible.
8. **Fallback without WebGL:** the hero draws both states on 2D canvases and uses a CSS circle mask for the
   lens, instead of a static PNG.
9. **Old v1 links** (`#part1`–`#part6`, `#story`, `#runs`, …) land on the matching v2 section; unknown hashes
   show the top of the home page.

## Assumptions to check

- **Who presents which part.** The team section lists members in the order given in the brief against parts
  1–6 (Tanmay → Part 1 … Ayush → Part 6). If that's wrong, edit `TEAM` in `src/data/content.js` and rebuild.
- **"Faculty: Aishwarya Ma'am"** is shown under the team exactly as written in the brief.
- **"NEXT: VIVA · 16 NOV"** is hard-coded in the hero card and should be changed after the viva.

## Cut or simplified

- No page-transition animation between home and experiment beyond a fade (Phase 3).
- No intro loader (Phase 3).
- Performance is checked by frame times in headless Edge only (no DevTools profile, no Lighthouse run).
