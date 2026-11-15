# Learn or Explode

How eigenvalues decide whether an AI model learns or explodes.
25BSMA01 Matrix Algebra and Calculus · Experiential Learning · Jain University (FET) · Team AI/ML-G.

Live: https://tanmay-jampala.github.io/learn-or-explode/ · Experiment: `…/learn-or-explode/#demo`

## Use it

Open `index.html`. It works from GitHub Pages, from `python -m http.server`, and by double-clicking
`index.html` from a USB stick (file://), with no internet. Everything it needs is in this repo.

The experiment answers `#demo` and `#demo?preset=1..4` (η = 0.10 / 1.00 / 1.12 / 1.13).
Keys: `1`–`4` presets, `Space` play/pause, `R` restart, `S` skip to result, `F` full screen, `+` / `−` zoom.

## Build

Needs Node.js 20+. Libraries are pinned to exact versions in `package.json`.

```bash
npm install
npm run build
```

- `scripts/build-data.mjs`: reads `data/results.json` (written by the project notebook), checks 46 values
  against the reference numbers, and fails the build on any difference. It writes `src/data/results.js`.
- `scripts/build-contours.mjs`: draws the contour-line texture from our own loss function L(w).
- `scripts/build.mjs`: esbuild bundles `src/` into `dist/app.js` (one IIFE, no modules or fetch, so file://
  works) and `dist/app.css` with the fonts. Library licences are copied to `vendor/licenses/`.
- `scripts/make-webp.py`: converts the notebook figures to 1x/2x WebP (run after the notebook changes).

`dist/` is committed so the site needs no build step to run.

## Libraries and fonts (all bundled, none loaded from the internet)

three.js, GSAP with ScrollTrigger and SplitText, Lenis, KaTeX, Mona Sans and Instrument Serif
(both SIL Open Font License). Versions are in `package.json`; licences are in `vendor/licenses/`.

## Credit

Layout and interaction ideas inspired by landonorris.com (OFF+BRAND). All code, copy, drawings and data here
are our own; no assets, code or fonts from that site are used.

The page-by-page version presented before this redesign is tagged `v1-presented`.
