/* Learn or Explode - interactive demo.
   All constants come from window.RESULTS (web/data.js, generated from results/results.json). */
(function () {
  "use strict";

  const R = window.RESULTS;
  if (!R) {
    document.body.insertAdjacentHTML("afterbegin",
      '<p class="load-error">data.js is missing. Run: python tools/build_web_data.py</p>');
    return;
  }

  // ---------------------------------------------------------------- constants
  const A = R.A, B = R.b, W_STAR = R.w_star;
  const [LAM_MIN, LAM_MAX] = R.eigenvalues;
  const [V_MIN, V_MAX] = R.eigenvectors;          // each entry is one eigenvector (same order as eigenvalues)
  const ETA_CRIT = R.eta_crit, ETA_OPT = R.eta_opt, ETA_ONE = 1 / LAM_MAX;
  const L_STAR = R.loss_at_w_star;
  const W0_DEFAULT = R.w0.slice();
  const RHO = R.rho;
  const TOL = 1e-6, BLOW_UP = 1e6, MAX_STEPS = 10000;
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const C = {
    sky: "#63c2bc", skyLight: "#8fded2", skyDeep: "#3f9a94", ink: "#22333a", paper: "#f3f2e7",
    shade: "#4d6266", stone: "#a9b6b1", grass: "#4f9a62", grassDark: "#2f6e47", sun: "#f2c94c",
    red: "#b8412f", orange: "#e5793b", navy: "#22384a", greenSign: "#2e7d4f", blue: "#2f6fa6",
  };

  // ---------------------------------------------------------------- maths
  const loss = (w) => 0.5 * (A[0][0] * w[0] * w[0] + 2 * A[0][1] * w[0] * w[1] + A[1][1] * w[1] * w[1])
    - B[0] * w[0] - B[1] * w[1] + 0.5;               // 0.5 = ½·mean(t²) for standardised prices
  const gradient = (w) => [A[0][0] * w[0] + A[0][1] * w[1] - B[0], A[1][0] * w[0] + A[1][1] * w[1] - B[1]];
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const factor = (eta) => Math.max(Math.abs(1 - eta * LAM_MIN), Math.abs(1 - eta * LAM_MAX));
  const regime = (eta) => (factor(eta) >= 1 ? "explode" : eta > ETA_ONE ? "zigzag" : "smooth");
  const eigenCoords = (w0) => {                       // z = Pᵀ (w0 − w*)
    const u = [w0[0] - W_STAR[0], w0[1] - W_STAR[1]];
    return [V_MIN[0] * u[0] + V_MIN[1] * u[1], V_MAX[0] * u[0] + V_MAX[1] * u[1]];
  };
  const exactFlow = (z0, t) => {                       // w(t) = w* + P diag(e^{−λt}) z0
    const a = z0[0] * Math.exp(-LAM_MIN * t), c = z0[1] * Math.exp(-LAM_MAX * t);
    return [W_STAR[0] + V_MIN[0] * a + V_MAX[0] * c, W_STAR[1] + V_MIN[1] * a + V_MAX[1] * c];
  };

  // ---------------------------------------------------------------- formatting
  const fmt = (x, d = 3) => {
    if (!isFinite(x)) return "∞";
    const s = Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-3 && x !== 0) ? x.toExponential(2) : x.toFixed(d);
    return s.replace("-", "−");
  };
  const fmtInt = (n) => n.toLocaleString("en-IN");
  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------- canvas helpers
  function fitCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(1, Math.round(rect.width * dpr)), ph = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: rect.width, h: rect.height, dpr };
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // ---------------------------------------------------------------- the island (cel-shaded contour map)
  // Loss bands from the minimum outwards: town → meadow → forest → beach → shallows → sea
  const BAND_COLORS = ["#f5f1e0", "#e2e4d3", "#c3dcae", "#94c98a", "#66ad70", "#478f5c", "#dccfa2",
    "#a6e6da", "#80d6ca", C.sky].map(hexToRgb);
  const BAND_LEVELS = [0.015, 0.06, 0.15, 0.35, 0.7, 1.3, 1.75, 2.6, 4.0];   // L − L* thresholds (one per colour change)
  const WATER_FROM = 7;
  const INK_RGB = hexToRgb(C.ink), WATER_INK = hexToRgb("#4aa9a1");

  function renderIsland(width, height, dpr, view, levelScale, decorate) {
    const pw = Math.round(width * dpr), ph = Math.round(height * dpr);
    const off = document.createElement("canvas");
    off.width = pw; off.height = ph;
    const octx = off.getContext("2d");
    const img = octx.createImageData(pw, ph);
    const bands = new Uint8Array(pw * ph);
    const levels = BAND_LEVELS.map((l) => L_STAR + l * levelScale);
    for (let y = 0; y < ph; y++) {
      const w2 = view.w2max - ((y + 0.5) / ph) * (view.w2max - view.w2min);
      for (let x = 0; x < pw; x++) {
        const w1 = view.w1min + ((x + 0.5) / pw) * (view.w1max - view.w1min);
        const L = loss([w1, w2]);
        let k = 0;
        while (k < levels.length && L > levels[k]) k++;
        bands[y * pw + x] = k;
      }
    }
    const r = Math.max(1, Math.round(1.25 * dpr));
    const data = img.data;
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const p = y * pw + x, k = bands[p];
        let edge = -1;
        for (let s = 1; s <= r && edge < 0; s++) {
          if (x + s < pw && bands[p + s] !== k) edge = Math.min(k, bands[p + s]);
          else if (y + s < ph && bands[p + s * pw] !== k) edge = Math.min(k, bands[p + s * pw]);
        }
        const rgb = edge < 0 ? BAND_COLORS[k] : edge < WATER_FROM ? INK_RGB : WATER_INK;
        const q = p * 4;
        data[q] = rgb[0]; data[q + 1] = rgb[1]; data[q + 2] = rgb[2]; data[q + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    if (decorate) decorateIsland(octx, pw, ph, dpr, view, levels, decorate);
    return off;
  }

  // Trees on the forest bands, rocks on the beach, little houses in the town (hand-drawn look)
  function decorateIsland(ctx, pw, ph, dpr, view, levels, opts) {
    const rand = mulberry32(opts.seed || 7);
    const toPx = (w1, w2) => [(w1 - view.w1min) / (view.w1max - view.w1min) * pw,
      (view.w2max - w2) / (view.w2max - view.w2min) * ph];
    const bandAt = (w1, w2) => { const L = loss([w1, w2]); let k = 0; while (k < levels.length && L > levels[k]) k++; return k; };
    ctx.lineWidth = 1.6 * dpr; ctx.strokeStyle = C.ink; ctx.lineJoin = "round";
    for (let i = 0; i < (opts.trees || 0) * 6 && i < 4000; i++) {
      const w1 = view.w1min + rand() * (view.w1max - view.w1min);
      const w2 = view.w2min + rand() * (view.w2max - view.w2min);
      const k = bandAt(w1, w2);
      const [x, y] = toPx(w1, w2);
      const size = (opts.size || 9) * dpr * (0.75 + rand() * 0.5);
      if (k >= 3 && k <= 5 && rand() < opts.trees / 160) {
        ctx.fillStyle = k === 5 ? "#2f6e47" : "#3f8452";
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.arc(x + size * 0.8, y + size * 0.3, size * 0.75, 0, Math.PI * 2);
        ctx.arc(x - size * 0.7, y + size * 0.35, size * 0.7, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#6fb27a";
        ctx.beginPath(); ctx.arc(x - size * 0.25, y - size * 0.3, size * 0.38, 0, Math.PI * 2); ctx.fill();
      } else if (k === 6 && rand() < 0.05) {
        ctx.fillStyle = "#b8bfb8";
        ctx.beginPath();
        ctx.moveTo(x - size, y + size * 0.4); ctx.lineTo(x - size * 0.4, y - size * 0.6);
        ctx.lineTo(x + size * 0.7, y - size * 0.4); ctx.lineTo(x + size, y + size * 0.5); ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else if (opts.houses && k <= 1 && rand() < 0.35) {
        const s = size * 1.1;
        ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 4 + (rand() - 0.5) * 0.3);
        ctx.fillStyle = ["#f6f3e6", "#d9d3c7", "#e9c8b8", "#cfd6cf"][Math.floor(rand() * 4)];
        ctx.fillRect(-s, -s * 0.7, s * 2, s * 1.4); ctx.strokeRect(-s, -s * 0.7, s * 2, s * 1.4);
        ctx.fillStyle = C.ink; ctx.fillRect(-s * 0.55, -s * 0.2, s * 0.35, s * 0.35); ctx.fillRect(s * 0.2, -s * 0.2, s * 0.35, s * 0.35);
        ctx.restore();
      }
    }
  }

  // ---------------------------------------------------------------- block-letter title
  const GLYPHS = {
    L: ["X....", "X....", "X....", "X....", "XXXXX"],
    E: ["XXXXX", "X....", "XXXX.", "X....", "XXXXX"],
    A: ["XXXXX", "X...X", "XXXXX", "X...X", "X...X"],
    R: ["XXXXX", "X...X", "XXXXX", "X..X.", "X...X"],
    N: ["XX..X", "X.X.X", "X.X.X", "X.X.X", "X..XX"],
    O: ["XXXXX", "X...X", "X...X", "X...X", "XXXXX"],
    X: ["X...X", "XX.XX", ".XXX.", "XX.XX", "X...X"],
    P: ["XXXXX", "X...X", "XXXXX", "X....", "X...."],
    D: ["XXXX.", "X...X", "X...X", "X...X", "XXXX."],
  };
  function drawBlockTitle(svg, lines) {
    const NS = "http://www.w3.org/2000/svg";
    const cell = 10, gapX = 3, lineGap = 14, depth = 6;
    const widthOf = (word) => word.length * 5 * cell + (word.length - 1) * gapX;
    const totalW = Math.max(...lines.map(widthOf)) + depth + 4;
    const totalH = lines.length * 5 * cell + (lines.length - 1) * lineGap + depth + 4;
    svg.setAttribute("viewBox", `-2 -2 ${totalW} ${totalH}`);
    svg.innerHTML = "";
    const rand = mulberry32(11);
    lines.forEach((word, row) => {
      const x0 = (totalW - depth - widthOf(word)) / 2;
      const y0 = row * (5 * cell + lineGap);
      [...word].forEach((ch, i) => {
        const glyph = GLYPHS[ch]; if (!glyph) return;
        const gx = x0 + i * (5 * cell + gapX), cx = gx + 2.5 * cell, cy = y0 + 2.5 * cell;
        const g = document.createElementNS(NS, "g");
        g.setAttribute("transform", `rotate(${((rand() - 0.5) * 4).toFixed(2)} ${cx} ${cy})`);
        const cells = [];
        glyph.forEach((rowStr, r) => [...rowStr].forEach((v, c) => { if (v === "X") cells.push([c, r]); }));
        const filled = new Set(cells.map(([c, r]) => c + "," + r));
        const rect = (x, y, fill, stroke) => {
          const el = document.createElementNS(NS, "rect");
          const grow = stroke ? 0 : 0.6;      // overlap neighbouring squares so no seams show between them
          el.setAttribute("x", x - grow / 2); el.setAttribute("y", y - grow / 2);
          el.setAttribute("width", cell + grow); el.setAttribute("height", cell + grow);
          el.setAttribute("fill", fill);
          if (stroke) { el.setAttribute("stroke", C.ink); el.setAttribute("stroke-width", "3"); el.setAttribute("stroke-linejoin", "round"); }
          g.appendChild(el);
        };
        // 1) ink outline of the extruded block, 2) extrusion, 3) face outline, 4) face, 5) bevel
        for (let k = depth; k >= 0; k--) cells.forEach(([c, r]) => rect(gx + c * cell + k, y0 + r * cell + k, C.ink, true));
        for (let k = depth; k >= 1; k--) cells.forEach(([c, r]) => rect(gx + c * cell + k, y0 + r * cell + k, k > 3 ? "#7f918e" : "#97a7a3", false));
        cells.forEach(([c, r]) => rect(gx + c * cell, y0 + r * cell, C.ink, true));
        cells.forEach(([c, r]) => rect(gx + c * cell, y0 + r * cell, C.paper, false));
        cells.forEach(([c, r]) => {
          if (!filled.has(c + "," + (r + 1))) {
            const bevel = document.createElementNS(NS, "rect");
            bevel.setAttribute("x", gx + c * cell); bevel.setAttribute("y", y0 + r * cell + cell - 2.2);
            bevel.setAttribute("width", cell); bevel.setAttribute("height", 2.2); bevel.setAttribute("fill", "#cfd3c6");
            g.appendChild(bevel);
          }
        });
        svg.appendChild(g);
      });
    });
  }

  // ---------------------------------------------------------------- hero
  function drawHero() {
    const canvas = $("hero-island");
    const { ctx, w, h, dpr } = fitCanvas(canvas);
    if (w < 2 || h < 2) return;                      // page not visible yet
    // The real loss contours, shown on a round "planet" (the disc keeps the slow spin seamless)
    const span = 3.4;
    const view = { w1min: W_STAR[0] - span, w1max: W_STAR[0] + span, w2min: W_STAR[1] - span, w2max: W_STAR[1] + span };
    const island = renderIsland(w, h, dpr, view, 0.5, { seed: 3, trees: 80, size: 8, houses: true });
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, radius = w / 2 - 8;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(island, 0, 0, w, h);
    ctx.restore();
    ctx.lineWidth = 8; ctx.strokeStyle = "rgba(166,230,218,.9)";
    ctx.beginPath(); ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.strokeStyle = "#4aa9a1";
    ctx.beginPath(); ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2); ctx.stroke();
  }

  // ================================================================ LIVE DEMO
  // --- zoomable map view. Zoom level k means the view is 2^(k/2) times wider than the base view.
  const BASE = { cx: 0.75, cy: -0.25, hw: 3.25, hh: 2.75 };        // base view: w1 ∈ [−2.5, 4], w2 ∈ [−3, 2.5]
  const MIN_ZOOM_INDEX = -4, MAX_ZOOM_INDEX = 44, MAX_REAL_ZOOM_INDEX = 6;
  const zoomOf = (k) => 2 ** (k / 2);
  const viewFor = (k) => {
    const z = zoomOf(k);
    return { w1min: BASE.cx - BASE.hw * z, w1max: BASE.cx + BASE.hw * z, w2min: BASE.cy - BASE.hh * z, w2max: BASE.cy + BASE.hh * z };
  };
  const extentOf = (w) => Math.max(Math.abs(w[0] - BASE.cx) / BASE.hw, Math.abs(w[1] - BASE.cy) / BASE.hh);
  let zoomIndex = 0, follow = true, VIEW = viewFor(0);
  const mapCanvas = $("map"), stabCanvas = $("stability"), distCanvas = $("distance");
  const islandCache = new Map();

  const run = { eta: 0.1, w0: W0_DEFAULT.slice(), path: [], dists: [], outcome: null, playing: true, carry: 0, speed: 1, extent: 0 };

  function resetRun(autoplay = true) {
    run.path = [run.w0.slice()];
    run.dists = [dist(run.w0, W_STAR)];
    run.extent = extentOf(run.w0);
    run.outcome = null;
    run.carry = 0;
    run.playing = autoplay;
    updatePlayButton();
    renderAll();
  }
  function stepOnce() {
    if (run.outcome) return;
    const w = run.path[run.path.length - 1];
    const g = gradient(w);
    const next = [w[0] - run.eta * g[0], w[1] - run.eta * g[1]];   // Euler step = gradient descent
    run.path.push(next);
    run.extent = Math.max(run.extent, extentOf(next));
    const d = dist(next, W_STAR);
    run.dists.push(d);
    const step = run.path.length - 1;
    if (d < TOL) run.outcome = "converged";
    else if (Math.hypot(next[0], next[1]) > BLOW_UP) run.outcome = "exploded";
    else if (step >= MAX_STEPS) run.outcome = "unfinished";
    if (run.outcome) { run.playing = false; updatePlayButton(); }
  }
  const currentStep = () => run.path.length - 1;

  function setEta(eta, autoplay = true) {
    run.eta = Math.round(eta * 100) / 100;
    $("eta").value = run.eta.toFixed(2);
    $("eta-out").textContent = run.eta.toFixed(2);
    document.querySelectorAll(".preset").forEach((b) => b.classList.toggle("is-on", Number(b.dataset.eta) === run.eta));
    updateTrack();
    resetRun(autoplay);
  }

  // --- map
  const toMap = (w, W, H) => [(w[0] - VIEW.w1min) / (VIEW.w1max - VIEW.w1min) * W, (VIEW.w2max - w[1]) / (VIEW.w2max - VIEW.w2min) * H];
  const fromMap = (x, y, W, H) => [VIEW.w1min + x / W * (VIEW.w1max - VIEW.w1min), VIEW.w2max - y / H * (VIEW.w2max - VIEW.w2min)];

  function drawFlag(ctx, x, y) {
    ctx.lineWidth = 3; ctx.strokeStyle = C.ink;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 34); ctx.stroke();
    ctx.fillStyle = C.red;
    ctx.beginPath(); ctx.moveTo(x, y - 34); ctx.lineTo(x + 24, y - 27); ctx.lineTo(x, y - 19); ctx.closePath();
    ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = C.paper; ctx.beginPath(); ctx.ellipse(x, y, 7, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  function drawWalker(ctx, x, y) {
    ctx.lineWidth = 3; ctx.strokeStyle = C.ink;
    ctx.fillStyle = "rgba(34,51,58,.25)"; ctx.beginPath(); ctx.ellipse(x + 3, y + 12, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.orange; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.red; ctx.fillRect(x - 6, y - 6, 12, 11); ctx.strokeRect(x - 6, y - 6, 12, 11);
    ctx.fillStyle = C.paper; ctx.fillRect(x - 3, y - 3, 6, 2); ctx.fillRect(x - 1, y - 3, 2, 6);
  }
  function arrow(ctx, x0, y0, x1, y1, color, width) {
    const a = Math.atan2(y1 - y0, x1 - x0), head = 14;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - head * 0.6 * Math.cos(a), y1 - head * 0.6 * Math.sin(a)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - head * Math.cos(a - 0.45), y1 - head * Math.sin(a - 0.45));
    ctx.lineTo(x1 - head * Math.cos(a + 0.45), y1 - head * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
  }
  function labelBox(ctx, text, x, y, color) {
    ctx.font = "700 18px " + getComputedStyle(document.body).fontFamily;
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = "rgba(243,242,231,.95)"; ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.fillRect(x - w / 2, y - 14, w, 28); ctx.strokeRect(x - w / 2, y - 14, w, 28);
    ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, x, y + 1);
  }

  function islandImage(k, w, h, dpr) {
    const key = `${k}|${w}x${h}@${dpr}`;
    if (!islandCache.has(key)) {
      if (islandCache.size > 14) islandCache.clear();
      islandCache.set(key, renderIsland(w, h, dpr, viewFor(k), 1, k <= 2 ? { seed: 5, trees: 26, size: 8 } : null));
    }
    return islandCache.get(key);
  }
  function drawIsland(ctx, w, h, dpr) {
    if (zoomIndex <= MAX_REAL_ZOOM_INDEX) { ctx.drawImage(islandImage(zoomIndex, w, h, dpr), 0, 0, w, h); return; }
    // Far out the island is a speck in open sea: shrink the zoom-×8 picture into the middle.
    const s = zoomOf(MAX_REAL_ZOOM_INDEX) / zoomOf(zoomIndex);
    ctx.fillStyle = C.sky; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(islandImage(MAX_REAL_ZOOM_INDEX, w, h, dpr), w * (1 - s) / 2, h * (1 - s) / 2, w * s, h * s);
  }
  // With "follow" on, zoom out just far enough to keep every point of the run on the map
  function followZoomIndex() {
    const r = run.extent * 1.12;
    return r <= 1 ? 0 : Math.min(MAX_ZOOM_INDEX, Math.ceil(2 * Math.log2(r)));
  }
  function setZoom(k, keepFollow = false) {
    zoomIndex = Math.max(MIN_ZOOM_INDEX, Math.min(MAX_ZOOM_INDEX, k));
    if (!keepFollow) { follow = false; $("follow").checked = false; }
    drawMap();
  }
  function zoomText() {
    const z = zoomOf(zoomIndex);
    const big = (x) => Math.round(x).toLocaleString("en-US");      // zoom factors read better as 370,728
    const shown = z < 10 ? z.toFixed(z < 1 ? 2 : 1).replace(/\.0$/, "") : big(z);
    const half = BASE.hw * z;
    return `zoom ×${shown} · w₁ ±${half < 100 ? half.toFixed(1) : big(half)}`;
  }

  function drawMap() {
    const { ctx, w, h, dpr } = fitCanvas(mapCanvas);
    if (w < 2 || h < 2) return;                      // page not visible yet
    if (follow) zoomIndex = followZoomIndex();
    VIEW = viewFor(zoomIndex);
    drawIsland(ctx, w, h, dpr);
    setText($("zoom-label"), zoomText());

    if ($("eigen-toggle").checked) {
      const [sx, sy] = toMap(W_STAR, w, h);
      const c = 0.9;
      [[V_MAX, LAM_MAX, "steep  λ = " + fmt(LAM_MAX, 4), C.red], [V_MIN, LAM_MIN, "flat  λ = " + fmt(LAM_MIN, 4), C.blue]].forEach(([v, lam, text, color]) => {
        const len = c / Math.sqrt(lam);
        const tip = toMap([W_STAR[0] + v[0] * len, W_STAR[1] + v[1] * len], w, h);
        arrow(ctx, sx, sy, tip[0], tip[1], color, 5);
        const lab = toMap([W_STAR[0] + v[0] * (len + 0.55), W_STAR[1] + v[1] * (len + 0.55)], w, h);
        labelBox(ctx, text, lab[0], lab[1], color);
      });
    }

    // start marker
    const [x0, y0] = toMap(run.w0, w, h);
    ctx.fillStyle = C.paper; ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
    ctx.fillRect(x0 - 9, y0 - 9, 18, 18); ctx.strokeRect(x0 - 9, y0 - 9, 18, 18);

    // path: faint full trail, bold recent steps
    const pts = run.path.map((p) => toMap(p, w, h));
    if (pts.length > 1) {
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(34,51,58,.35)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      const recent = pts.slice(Math.max(0, pts.length - 14));
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3.2;
      ctx.beginPath(); recent.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      ctx.fillStyle = C.paper; ctx.lineWidth = 2;
      recent.slice(0, -1).forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    }

    const [gx, gy] = toMap(W_STAR, w, h);
    drawFlag(ctx, gx, gy);

    const cur = run.path[run.path.length - 1];
    const [cx, cy] = toMap(cur, w, h);
    const onMap = cx >= 0 && cx <= w && cy >= 0 && cy <= h;
    if (onMap) drawWalker(ctx, cx, cy);
    $("map-banner").hidden = onMap;
  }

  // --- stability-factor chart
  function drawStability() {
    const { ctx, w, h } = fitCanvas(stabCanvas);
    const pad = { l: 58, r: 16, t: 14, b: 44 };
    const X = (eta) => pad.l + eta / 1.4 * (w - pad.l - pad.r);
    const Y = (f) => pad.t + (1 - f / 1.35) * (h - pad.t - pad.b);
    const font = getComputedStyle(document.body).fontFamily;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fff"; ctx.fillRect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b);
    ctx.fillStyle = "rgba(184,65,47,.13)"; ctx.fillRect(X(ETA_CRIT), pad.t, X(1.4) - X(ETA_CRIT), h - pad.t - pad.b);
    // grid + axes labels
    ctx.font = "16px " + font; ctx.fillStyle = C.ink; ctx.strokeStyle = "#dfe3da"; ctx.lineWidth = 1;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    [0, 0.25, 0.5, 0.75, 1, 1.25].forEach((f) => { ctx.beginPath(); ctx.moveTo(pad.l, Y(f)); ctx.lineTo(w - pad.r, Y(f)); ctx.stroke(); ctx.fillText(f.toFixed(2), pad.l - 8, Y(f)); });
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4].forEach((e) => ctx.fillText(e.toFixed(1), X(e), h - pad.b + 8));
    ctx.fillText("learning rate η", (pad.l + w - pad.r) / 2, h - 20);
    // line at 1
    ctx.setLineDash([7, 6]); ctx.strokeStyle = C.shade; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pad.l, Y(1)); ctx.lineTo(w - pad.r, Y(1)); ctx.stroke(); ctx.setLineDash([]);
    // the two modes (dotted) and the max (bold)
    const curve = (fn, color, width, dash) => {
      ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      for (let i = 0; i <= 280; i++) { const e = 1.4 * i / 280; const y = Y(Math.min(fn(e), 1.36)); i ? ctx.lineTo(X(e), y) : ctx.moveTo(X(e), y); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    ctx.save(); ctx.beginPath(); ctx.rect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b); ctx.clip();
    curve((e) => Math.abs(1 - e * LAM_MIN), C.blue, 2, [3, 5]);
    curve((e) => Math.abs(1 - e * LAM_MAX), C.red, 2, [3, 5]);
    curve(factor, C.ink, 4, []);
    ctx.restore();
    // markers
    ctx.lineWidth = 2.5;
    [[ETA_OPT, C.greenSign, "η_opt = " + fmt(ETA_OPT, 2)], [ETA_CRIT, C.red, "η_crit = " + fmt(ETA_CRIT, 3)]].forEach(([e, color, text]) => {
      ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(X(e), pad.t); ctx.lineTo(X(e), h - pad.b); ctx.stroke();
      ctx.fillStyle = color; ctx.font = "700 16px " + font; ctx.textBaseline = "top";
      if (e === ETA_CRIT) {
        // right of the line if it fits, otherwise in the empty band below the curve inside the red zone
        const fits = X(e) + 6 + ctx.measureText(text).width <= w - pad.r;
        ctx.textAlign = fits ? "left" : "right";
        ctx.fillText(text, fits ? X(e) + 6 : w - pad.r - 4, fits ? pad.t + 4 : Y(0.95));
      } else {
        ctx.textAlign = "right";
        ctx.fillText(text, X(e) - 6, pad.t + 4);
      }
    });
    // the moving dot
    const f = factor(run.eta), color = f >= 1 ? C.red : run.eta > ETA_ONE ? "#b07800" : C.greenSign;
    const dx = X(run.eta), dy = Y(Math.min(f, 1.33));
    ctx.strokeStyle = color; ctx.setLineDash([4, 4]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx, h - pad.b); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.orange; ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(dx, dy, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = "800 17px " + font; ctx.fillStyle = C.ink; ctx.textBaseline = "bottom";
    ctx.textAlign = dx > w - 140 ? "right" : "left";
    ctx.fillText(fmt(f, 4), dx + (ctx.textAlign === "left" ? 14 : -14), dy - 6);
  }

  // --- distance chart (log scale)
  function drawDistance() {
    const { ctx, w, h } = fitCanvas(distCanvas);
    const pad = { l: 62, r: 16, t: 14, b: 44 };
    const steps = currentStep();
    const xMax = Math.max(60, Math.ceil(steps * 1.15 / 10) * 10);
    const yMin = -7, yMax = 7;
    const X = (k) => pad.l + k / xMax * (w - pad.l - pad.r);
    const Y = (d) => pad.t + (1 - (Math.log10(Math.max(d, 1e-9)) - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);
    const font = getComputedStyle(document.body).fontFamily;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fff"; ctx.fillRect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b);
    ctx.font = "16px " + font; ctx.fillStyle = C.ink; ctx.strokeStyle = "#dfe3da"; ctx.lineWidth = 1;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let p = yMin; p <= yMax; p += 2) { ctx.beginPath(); ctx.moveTo(pad.l, Y(10 ** p)); ctx.lineTo(w - pad.r, Y(10 ** p)); ctx.stroke(); ctx.fillText("10" + supNum(p), pad.l - 8, Y(10 ** p)); }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    const tickStep = niceStep(xMax / 6);
    for (let k = 0; k <= xMax; k += tickStep) ctx.fillText(fmtInt(k), X(k), h - pad.b + 8);
    ctx.fillText("step k", (pad.l + w - pad.r) / 2, h - 20);
    // tolerance and start lines
    ctx.setLineDash([7, 6]); ctx.lineWidth = 2;
    ctx.strokeStyle = C.greenSign; ctx.beginPath(); ctx.moveTo(pad.l, Y(TOL)); ctx.lineTo(w - pad.r, Y(TOL)); ctx.stroke();
    ctx.strokeStyle = C.shade; ctx.beginPath(); ctx.moveTo(pad.l, Y(run.dists[0])); ctx.lineTo(w - pad.r, Y(run.dists[0])); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.greenSign; ctx.textAlign = "left"; ctx.textBaseline = "bottom"; ctx.font = "700 15px " + font;
    ctx.fillText("goal: 10⁻⁶", pad.l + 6, Y(TOL) - 3);
    // the run
    const color = run.outcome === "exploded" || factor(run.eta) >= 1 ? C.red : C.greenSign;
    ctx.save(); ctx.beginPath(); ctx.rect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b); ctx.clip();
    ctx.strokeStyle = color; ctx.lineWidth = 3.5; ctx.lineJoin = "round"; ctx.beginPath();
    const stride = Math.max(1, Math.floor(run.dists.length / 1500));
    for (let k = 0; k < run.dists.length; k += stride) { const x = X(k), y = Y(run.dists[k]); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    const last = run.dists.length - 1; ctx.lineTo(X(last), Y(run.dists[last]));
    ctx.stroke(); ctx.restore();
  }
  function supNum(p) { const map = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" }; return String(p).split("").map((c) => map[c]).join(""); }
  function niceStep(x) { const p = 10 ** Math.floor(Math.log10(x)); const m = x / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }

  // --- badge, readouts, slider track
  const SIGNS = {
    smooth: `<circle cx="50" cy="50" r="42" fill="${C.greenSign}" stroke="${C.ink}" stroke-width="6"/><path d="M30 52l13 13 28-30" fill="none" stroke="${C.paper}" stroke-width="11" stroke-linecap="square"/>`,
    zigzag: `<rect x="17" y="17" width="66" height="66" transform="rotate(45 50 50)" fill="${C.sun}" stroke="${C.ink}" stroke-width="6"/><path d="M26 58l12-16 12 16 12-16 12 16" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linejoin="miter"/>`,
    explode: `<path d="M50 8L94 88H6z" fill="${C.red}" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/><path d="M50 30v30" stroke="${C.paper}" stroke-width="10"/><rect x="45" y="67" width="10" height="10" fill="${C.paper}"/>`,
  };
  let lastRegime = "";
  function updateBadge() {
    const reg = regime(run.eta);
    const badge = $("badge");
    if (reg !== lastRegime) {
      badge.className = "badge is-" + reg;
      $("badge-sign").innerHTML = SIGNS[reg];
      $("badge-word").textContent = { smooth: "Converging", zigzag: "Zig-zagging", explode: "Exploding" }[reg];
      lastRegime = reg;
    }
    setText($("badge-sub"), {
      smooth: "every step moves straight downhill",
      zigzag: "overshoots the valley, but each bounce is smaller",
      explode: "each bounce is bigger than the last",
    }[reg]);
  }
  // Only touch the DOM when the text really changes: screen readers announce every change to a live region.
  function setText(el, text) { if (el.textContent !== text) el.textContent = text; }
  function updateReadouts() {
    const cur = run.path[run.path.length - 1], step = currentStep();
    $("r-factor").textContent = fmt(factor(run.eta), 4);
    $("r-step").textContent = fmtInt(step);
    $("r-dist").textContent = fmt(run.dists[run.dists.length - 1], 4);
    $("r-loss").textContent = fmt(loss(cur), 4);
    $("r-w").textContent = `(${fmt(cur[0], 3)}, ${fmt(cur[1], 3)})`;
    const fs = 1 - run.eta * LAM_MIN, ff = 1 - run.eta * LAM_MAX;
    $("r-modes").innerHTML = `Each step multiplies the <b>flat</b> mode by <b>${fmt(fs, 3)}</b> and the <b>steep</b> mode by <b>${fmt(ff, 3)}</b>` +
      (ff < 0 ? " (negative, so it flips sides: zig-zag)." : ".");
    $("r-factor").parentElement.title = $("r-modes").textContent;     // same explanation on hover in the compact layout
    const out = $("r-outcome");
    if (run.outcome === "converged") setText(out, `Converged in ${fmtInt(step)} steps (‖w − w*‖ < 10⁻⁶).`);
    else if (run.outcome === "exploded") setText(out, `Exploded: ‖w‖ passed 10⁶ at step ${fmtInt(step)}.`);
    else if (run.outcome === "unfinished") setText(out, `Still going after ${fmtInt(MAX_STEPS)} steps: very slow, right at the edge.`);
    else setText(out, run.playing ? "Training…" : "Paused.");
  }
  function updatePlayButton() {
    const btn = $("play-btn");
    const label = run.outcome ? "Replay" : run.playing ? "Pause" : "Play";
    btn.textContent = label; btn.setAttribute("aria-label", label);
  }
  function pctOf(eta) { const el = $("eta"); return (eta - Number(el.min)) / (Number(el.max) - Number(el.min)); }
  function updateTrack() {
    const p = pctOf(ETA_CRIT) * 100;
    $("eta").style.setProperty("--track", `linear-gradient(90deg, #dff1e4 0 ${pctOf(ETA_ONE) * 100}%, #fbf0c9 ${pctOf(ETA_ONE) * 100}% ${p}%, #f3c9c0 ${p}% 100%)`);
  }
  function placeTicks() {
    const wrap = $("ticks"), width = $("eta").offsetWidth, thumb = 34;   // layout width (unaffected by fit scaling)
    wrap.innerHTML = "";
    [[ETA_ONE, "tick-one tick-center", "zig-zag<br>" + fmt(ETA_ONE, 3)], [ETA_OPT, "tick-opt tick-left", "best<br>" + fmt(ETA_OPT, 2)],
      [ETA_CRIT, "tick-crit tick-right", "η<sub>crit</sub><br>" + fmt(ETA_CRIT, 3)]].forEach(([eta, cls, html]) => {
      const t = document.createElement("span");
      t.className = "tick " + cls; t.innerHTML = html;
      t.style.left = (thumb / 2 + pctOf(eta) * (width - thumb)) + "px";
      wrap.appendChild(t);
    });
  }

  function renderAll() {
    drawMap(); drawStability(); drawDistance(); updateBadge(); updateReadouts(); drawEuler();
  }

  // --- animation loop: speeds up as the run goes on so long runs finish in seconds
  let lastTime = 0;
  function frame(time) {
    const dt = Math.min(1000, time - (lastTime || time));   // keeps real-time pace even on a slow PC
    lastTime = time;
    if (run.playing && !run.outcome && PAGES[pageIndex].id === "demo") {
      const rate = (4 + 0.6 * currentStep()) * run.speed;   // steps per second
      run.carry += dt / 1000 * rate;
      let n = Math.floor(run.carry); run.carry -= n;
      while (n-- > 0 && !run.outcome) stepOnce();
      drawMap(); drawDistance(); updateReadouts();
    }
    requestAnimationFrame(frame);
  }

  function initDemo() {
    $("eta").addEventListener("input", (e) => setEta(Number(e.target.value)));
    document.querySelectorAll(".preset").forEach((b) => b.addEventListener("click", () => setEta(Number(b.dataset.eta))));
    $("play-btn").addEventListener("click", togglePlay);
    $("step-btn").addEventListener("click", () => { run.playing = false; stepOnce(); updatePlayButton(); renderAll(); });
    $("reset-btn").addEventListener("click", () => resetRun(true));
    $("skip-btn").addEventListener("click", skipToEnd);
    document.querySelectorAll("[data-speed]").forEach((b) => b.addEventListener("click", () => {
      run.speed = Number(b.dataset.speed);
      document.querySelectorAll("[data-speed]").forEach((o) => o.classList.toggle("is-on", o === b));
    }));
    $("eigen-toggle").addEventListener("change", drawMap);
    $("zoom-in").addEventListener("click", () => setZoom(zoomIndex - 1));
    $("zoom-out").addEventListener("click", () => setZoom(zoomIndex + 1));
    $("follow").addEventListener("change", (e) => { follow = e.target.checked; drawMap(); });
    mapCanvas.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(zoomIndex + (e.deltaY > 0 ? 1 : -1)); }, { passive: false });
    mapCanvas.addEventListener("click", (e) => {
      const r = mapCanvas.getBoundingClientRect();
      run.w0 = fromMap(e.clientX - r.left, e.clientY - r.top, r.width, r.height).map((v) => Math.round(v * 100) / 100);
      resetRun(true);
    });
    $("full-btn").addEventListener("click", toggleFullscreen);
    $("rail-full-btn").addEventListener("click", toggleFullscreen);
    document.addEventListener("fullscreenchange", () => {
      $("full-btn").textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
      setTimeout(onResize, 60);
    });
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || $("lightbox").open) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" && e.target.type !== "range") return;
      // page turning (a focused slider keeps its own arrow keys)
      if (tag !== "input" && (e.key === "ArrowRight" || e.key === "PageDown")) { e.preventDefault(); goTo(pageIndex + 1); return; }
      if (tag !== "input" && (e.key === "ArrowLeft" || e.key === "PageUp")) { e.preventDefault(); goTo(pageIndex - 1); return; }
      if (PAGES[pageIndex].id !== "demo") return;          // the rest are demo shortcuts
      const presets = { 1: 0.10, 2: 1.00, 3: 1.12, 4: 1.13 };
      if (e.key === "+" || e.key === "=") { setZoom(zoomIndex - 1); return; }
      if (e.key === "-" || e.key === "_") { setZoom(zoomIndex + 1); return; }
      if (presets[e.key] !== undefined) { setEta(presets[e.key]); }
      else if (e.key === " " && tag !== "button" && tag !== "a") { e.preventDefault(); togglePlay(); }
      else if (e.key === "r" || e.key === "R") resetRun(true);
      else if (e.key === "s" || e.key === "S") skipToEnd();
      else if (e.key === "f" || e.key === "F") toggleFullscreen();
    });
  }
  function togglePlay() {
    if (run.outcome) { resetRun(true); return; }
    run.playing = !run.playing; updatePlayButton(); updateReadouts();
  }
  function skipToEnd() { while (!run.outcome) stepOnce(); renderAll(); }
  function toggleFullscreen() {
    const demo = $("demo");
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (PAGES[pageIndex].id !== "demo") {
      // switch page synchronously (full screen must start inside the click), and keep the address in step
      history.pushState(null, "", "#demo");
      showPage(PAGES.indexOf(demo));
    }
    if (demo.requestFullscreen) demo.requestFullscreen().catch(() => {});
  }

  // ================================================================ PART 1: the linear system
  function initPart1() {
    $("p1-chips").innerHTML = [
      `n = <b>${fmtInt(R.n_rows)}</b> houses`, `ρ = corr(sqft, bhk) = <b>${fmt(RHO, 4)}</b>`,
      `rank A = rank [A|b] = <b>${R.rank_A}</b>`,
    ].map((t) => `<li>${t}</li>`).join("");
    const mat = (rows, dupRow) => `<span class="matrix" style="grid-template-columns:repeat(${rows[0].length},auto)">` +
      rows.map((r, i) => r.map((v) => `<span class="${i === dupRow ? "dup" : ""}">${fmt(v, 4)}</span>`).join("")).join("") + "</span>";
    const show = (three) => {
      $("p1-two").classList.toggle("is-on", !three); $("p1-three").classList.toggle("is-on", three);
      if (!three) {
        $("p1-system").innerHTML = `${mat(A)} <span>w =</span> ${mat(B.map((v) => [v]))}
          <p class="verdict">rank A = ${R.rank_A}, rank [A|b] = ${R.rank_augmented}, unknowns = 2 → <strong>exactly one solution</strong>
          w* = (${fmt(W_STAR[0], 4)}, ${fmt(W_STAR[1], 4)})</p>`;
      } else {
        const A3 = [[1, RHO, 1], [RHO, 1, RHO], [1, RHO, 1]], b3 = [[B[0]], [B[1]], [B[0]]];
        $("p1-system").innerHTML = `${mat(A3, 2)} <span>w =</span> ${mat(b3, 2)}
          <p class="verdict is-bad">Row 3 copies row 1. rank A₃ = ${R.rank_A3}, rank [A₃|b₃] = ${R.rank_augmented3} &lt; 3 unknowns →
          <strong>infinitely many solutions</strong>. Eigenvalues ${R.eigs_A3.map((e) => fmt(e, 4)).join(", ")}: one is zero.</p>`;
      }
    };
    $("p1-two").addEventListener("click", () => show(false));
    $("p1-three").addEventListener("click", () => show(true));
    show(false);
  }

  // ================================================================ PART 2: Gauss-Seidel vs Jacobi race
  function iterate(useNewest) {
    const x = [0, 0], errors = [Math.max(Math.abs(W_STAR[0]), Math.abs(W_STAR[1]))];
    for (let k = 0; k < 1000; k++) {
      const old = x.slice();
      x[0] = (B[0] - A[0][1] * (useNewest ? x[1] : old[1])) / A[0][0];
      x[1] = (B[1] - A[1][0] * (useNewest ? x[0] : old[0])) / A[1][1];
      errors.push(Math.max(Math.abs(x[0] - W_STAR[0]), Math.abs(x[1] - W_STAR[1])));
      if (Math.max(Math.abs(x[0] - old[0]), Math.abs(x[1] - old[1])) < TOL) break;
    }
    return errors;
  }
  function initPart2() {
    const gs = iterate(true), jac = iterate(false);
    const ech = R.echelon_form;
    $("p2-chips").innerHTML = [
      `echelon row 2: [0, <b>${fmt(ech[1][1], 4)}</b> | <b>${fmt(ech[1][2], 4)}</b>]`,
      `Gauss-Seidel: <b>${gs.length - 1}</b> iterations`, `Jacobi: <b>${jac.length - 1}</b> iterations`,
      `first GS step: (<b>${fmt(R.gauss_seidel.first_3[0][0], 4)}</b>, <b>${fmt(R.gauss_seidel.first_3[0][1], 4)}</b>)`,
    ].map((t) => `<li>${t}</li>`).join("");
    const progress = (err) => Math.min(1, Math.max(0, Math.log10(gs[0] / Math.max(err, 1e-12)) / Math.log10(gs[0] / TOL)));
    let timer = null;
    const place = (k) => {
      [[gs, "gs"], [jac, "j"]].forEach(([errs, id]) => {
        const i = Math.min(k, errs.length - 1);
        const track = $("runner-" + id).parentElement.offsetWidth - 32;
        $("runner-" + id).style.left = (progress(errs[i]) * track) + "px";
        $("count-" + id).textContent = i;
      });
    };
    $("race-btn").addEventListener("click", () => {
      clearInterval(timer);
      let k = 0; place(0);
      $("race-btn").textContent = "Race again";
      const total = Math.max(gs.length, jac.length) - 1;
      if (REDUCED_MOTION) { place(total); return; }
      timer = setInterval(() => { k++; place(k); if (k >= total) clearInterval(timer); }, 110);
    });
    place(0);
    window.addEventListener("resize", () => place(Number($("count-j").textContent)));
  }

  // ================================================================ PART 3: price calculator
  function initPart3() {
    const u = R.w_original_units, h = R.hessian_test;
    $("p3-chips").innerHTML = [
      `rt − s² = <b>${fmt(h.rt_minus_s2, 4)}</b> &gt; 0, r = 1 &gt; 0 → minimum`,
      `λ = <b>${fmt(LAM_MIN, 4)}</b>, <b>${fmt(LAM_MAX, 4)}</b>`, `κ = <b>${fmt(R.condition_number, 3)}</b> ≈ 8`,
      `R² = <b>${fmt(R.r_squared, 3)}</b>`,
    ].map((t) => `<li>${t}</li>`).join("");
    const bhkGroup = $("calc-bhk");
    let bhk = 2;
    for (let k = 1; k <= 5; k++) {
      const b = document.createElement("button");
      b.className = "seg-btn" + (k === bhk ? " is-on" : ""); b.textContent = k + " BHK";
      b.addEventListener("click", () => { bhk = k; bhkGroup.querySelectorAll("button").forEach((o) => o.classList.toggle("is-on", o === b)); update(); });
      bhkGroup.appendChild(b);
    }
    const update = () => {
      const sqft = Number($("calc-sqft").value);
      $("calc-sqft-out").textContent = fmtInt(sqft);
      const price = u.intercept_lakhs + u.lakhs_per_sqft * sqft + u.lakhs_per_bhk * bhk;
      $("calc-price").textContent = price > 0 ? `≈ ₹${price.toFixed(1)} lakh` : "below the model's range";
      $("calc-note").innerHTML = `price = ${fmt(u.intercept_lakhs, 2)} + <b>${fmt(u.lakhs_per_sqft, 5)}</b> × sqft ` +
        `${u.lakhs_per_bhk < 0 ? "−" : "+"} <b>${fmt(Math.abs(u.lakhs_per_bhk), 2)}</b> × bhk (lakhs). ` +
        `That is about ₹${fmtInt(Math.round(u.lakhs_per_sqft * 1e5))} per sqft. At the same area, an extra bedroom means smaller rooms, so the BHK weight is negative.`;
    };
    $("calc-sqft").addEventListener("input", update);
    update();
  }

  // ================================================================ PART 4: Lagrange multipliers
  const LVIEW = { w1min: -1.25, w1max: 1.75, w2min: -1.125, w2max: 1.125 };
  let lagrangeCache = null, lagrangeKey = "";
  function wOfMu(mu) {
    const a = A[0][0] + mu, d = A[1][1] + mu, c = A[0][1], det = a * d - c * c;
    return [(d * B[0] - c * B[1]) / det, (a * B[1] - c * B[0]) / det];
  }
  function solveLagrange(s) {
    if (Math.hypot(W_STAR[0], W_STAR[1]) <= s) return { mu: 0, w: W_STAR.slice(), active: false };
    let lo = 0, hi = 1;
    while (Math.hypot(...wOfMu(hi)) > s) hi *= 2;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (Math.hypot(...wOfMu(mid)) > s) lo = mid; else hi = mid; }
    return { mu: (lo + hi) / 2, w: wOfMu((lo + hi) / 2), active: true };
  }
  function drawLagrange() {
    const canvas = $("lagrange");
    const s = Number($("budget").value);
    $("budget-out").textContent = s.toFixed(2);
    const sol = solveLagrange(s);
    const { ctx, w, h, dpr } = fitCanvas(canvas);
    if (w < 2 || h < 2) return;                      // page not visible yet
    const key = `${w}x${h}@${dpr}`;
    if (key !== lagrangeKey) { lagrangeCache = renderIsland(w, h, dpr, LVIEW, 0.25, null); lagrangeKey = key; }
    ctx.drawImage(lagrangeCache, 0, 0, w, h);
    const P = (p) => [(p[0] - LVIEW.w1min) / (LVIEW.w1max - LVIEW.w1min) * w, (LVIEW.w2max - p[1]) / (LVIEW.w2max - LVIEW.w2min) * h];
    const [ox, oy] = P([0, 0]);
    const rpx = s / (LVIEW.w1max - LVIEW.w1min) * w;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 4; ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(ox, oy, rpx, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = C.paper; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ox, oy, rpx, 0, Math.PI * 2); ctx.stroke();
    const [gx, gy] = P(W_STAR); drawFlag(ctx, gx, gy);
    const [cx, cy] = P(sol.w);
    if (sol.active) {
      const g = gradient(sol.w), n = Math.hypot(g[0], g[1]);
      const tip = P([sol.w[0] + g[0] / n * 0.42, sol.w[1] + g[1] / n * 0.42]);
      arrow(ctx, cx, cy, tip[0], tip[1], "#8e3b74", 4);
      labelBox(ctx, "∇L", tip[0] - 14, tip[1] + 22, "#8e3b74");
    }
    ctx.fillStyle = C.sun; ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    labelBox(ctx, "w_c", cx + 34, cy - 20, C.ink);
    const g = gradient(sol.w);
    $("p4-chips").innerHTML = (sol.active ? [
      `μ = <b>${fmt(sol.mu, 4)}</b>`, `w<sub>c</sub> = (<b>${fmt(sol.w[0], 4)}</b>, <b>${fmt(sol.w[1], 4)}</b>)`,
      `L(w<sub>c</sub>) = <b>${fmt(loss(sol.w), 4)}</b>`, `∇L / w<sub>c</sub> = (<b>${fmt(g[0] / sol.w[0], 4)}</b>, <b>${fmt(g[1] / sol.w[1], 4)}</b>) = −μ`,
    ] : [`Budget ≥ ‖w*‖ = <b>${fmt(Math.hypot(...W_STAR), 4)}</b>: the constraint does not bite, μ = <b>0</b>, w<sub>c</sub> = w*`])
      .map((t) => `<li>${t}</li>`).join("");
  }
  function initPart4() { $("budget").addEventListener("input", drawLagrange); }

  // ================================================================ PART 5: exact ODE vs Euler
  function drawEuler() {
    const canvas = $("euler");
    if (!canvas) return;
    const { ctx, w, h } = fitCanvas(canvas);
    const pad = { l: 50, r: 14, t: 14, b: 40 }, tMax = 10, yMin = -2, yMax = 2;
    const X = (t) => pad.l + t / tMax * (w - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);
    const font = getComputedStyle(document.body).fontFamily;
    ctx.clearRect(0, 0, w, h);
    ctx.font = "15px " + font; ctx.fillStyle = C.ink; ctx.strokeStyle = "#e3e7de"; ctx.lineWidth = 1;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    [-2, -1, 0, 1, 2].forEach((v) => { ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(w - pad.r, Y(v)); ctx.stroke(); ctx.fillText(String(v).replace("-", "−"), pad.l - 8, Y(v)); });
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    [0, 2, 4, 6, 8, 10].forEach((t) => ctx.fillText(t, X(t), h - pad.b + 6));
    ctx.fillText("time t", (pad.l + w - pad.r) / 2, h - 18);
    const z0 = eigenCoords(run.w0);
    ctx.save(); ctx.beginPath(); ctx.rect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b); ctx.clip();
    [[0, C.ink, []], [1, C.blue, [9, 6]]].forEach(([i, color, dash]) => {
      ctx.strokeStyle = color; ctx.lineWidth = 3.5; ctx.setLineDash(dash); ctx.beginPath();
      for (let j = 0; j <= 200; j++) { const t = tMax * j / 200, v = exactFlow(z0, t)[i]; j ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v)); }
      ctx.stroke(); ctx.setLineDash([]);
    });
    // Euler points from the same start, step h = η
    let wk = run.w0.slice();
    const marks = [C.orange, "#7fb4dc"];
    const half = 2 + 2 * Math.min(1, run.eta / 0.5);     // small steps → many points → smaller markers
    for (let k = 0; k * run.eta <= tMax + 1e-9 && k < 400; k++) {
      const t = k * run.eta;
      [0, 1].forEach((i) => {
        ctx.fillStyle = marks[i]; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
        const y = Y(Math.max(yMin - 0.5, Math.min(yMax + 0.5, wk[i])));
        ctx.beginPath(); ctx.rect(X(t) - half, y - half, 2 * half, 2 * half); ctx.fill(); ctx.stroke();
      });
      const g = gradient(wk); wk = [wk[0] - run.eta * g[0], wk[1] - run.eta * g[1]];
    }
    ctx.restore();
    $("euler-eta").textContent = run.eta.toFixed(2);
  }
  function initPart5() {
    $("p5-chips").innerHTML = [
      `eigenvalues of −A: <b>${fmt(-LAM_MIN, 4)}</b>, <b>${fmt(-LAM_MAX, 4)}</b> → stable node`,
      `time constants 1/λ: <b>${fmt(R.time_constants[0], 4)}</b> (slow), <b>${fmt(R.time_constants[1], 4)}</b> (fast)`,
      `z(0) = (<b>${fmt(R.eigen_coords_w0[0], 4)}</b>, <b>${fmt(R.eigen_coords_w0[1], 4)}</b>)`,
      `momentum: critical γ = 2√λ = <b>${fmt(R.momentum_critical_gamma[0], 4)}</b>, <b>${fmt(R.momentum_critical_gamma[1], 4)}</b>`,
    ].map((t) => `<li>${t}</li>`).join("");
  }

  // ================================================================ PART 6: the seven runs
  function initPart6() {
    $("p6-chips").innerHTML = [
      `λ<sub>max</sub> = <b>${fmt(LAM_MAX, 4)}</b>`, `η<sub>crit</sub> = 2/λ<sub>max</sub> = <b>${fmt(ETA_CRIT, 4)}</b>`,
      `η<sub>opt</sub> = 2/(λ<sub>max</sub> + λ<sub>min</sub>) = <b>${fmt(ETA_OPT, 4)}</b>`, `factor at η<sub>opt</sub> = ρ = <b>${fmt(RHO, 4)}</b>`,
    ].map((t) => `<li>${t}</li>`).join("");
    $("runs-table").querySelector("tbody").innerHTML = R.gd_runs.map((r) => {
      const predicted = r.factor < 1 ? "converge" : "explode";
      const ok = r.outcome === "converged";
      return `<tr><td>${r.eta.toFixed(2)}</td><td>${fmt(r.factor, 4)}</td><td>${predicted}</td>
        <td><span class="pill ${ok ? "pill-ok" : "pill-bad"}">${r.outcome}</span></td><td>${fmtInt(r.steps)}</td></tr>`;
    }).join("");
    document.querySelectorAll("[data-set-eta]").forEach((b) => b.addEventListener("click", () => {
      setEta(Number(b.dataset.setEta));
      if (b.dataset.scroll) goTo(PAGES.indexOf($(b.dataset.scroll)));
    }));
  }

  // ================================================================ figures & lightbox
  const FIGURES = {
    fig01: ["fig01_data_scatter.png", `House price vs area, coloured by bedrooms (n = ${fmtInt(R.n_rows)})`],
    fig14: ["fig14_cleaning_funnel.png", `Data cleaning: 13,320 raw listings → ${fmtInt(R.n_rows)}`],
    fig09: ["fig09_gauss_seidel_vs_jacobi.png", `Gauss-Seidel (${R.gauss_seidel.iterations}) vs Jacobi (${R.jacobi_iterations}) iterations`],
    fig02: ["fig02_loss_surface_3d.png", "The loss surface: a bowl with one lowest point"],
    fig03: ["fig03_contours_eigenvectors.png", "Eigenvectors of the Hessian: steep and flat directions (κ ≈ 8)"],
    fig13: ["fig13_pred_vs_actual.png", `Predicted vs actual price (R² = ${fmt(R.r_squared, 3)})`],
    fig10: ["fig10_lagrange_constraint.png", `Lagrange: ∇L = −μ·w_c on the circle s = ${R.lagrange.s} (μ = ${fmt(R.lagrange.mu, 4)})`],
    fig07: ["fig07_gradient_flow_vs_euler.png", "Gradient descent = Euler's method on the gradient-flow ODE"],
    fig08: ["fig08_eigen_mode_decay.png", "The two eigen-modes decay at different speeds"],
    fig11: ["fig11_momentum_damping.png", "Momentum: under-, critically and over-damped"],
    fig04: ["fig04_gd_paths.png", "Gradient-descent paths for η = 0.1, 1.0, 1.10, 1.15"],
    fig05: ["fig05_loss_vs_iteration.png", "Loss gap vs step for all seven learning rates"],
    fig06: ["fig06_stability_factor.png", `Stability factor and the limit η_crit = ${fmt(ETA_CRIT, 3)}`],
    fig12: ["fig12_headline_112_vs_113.png", "Headline: η = 1.12 converges, η = 1.13 explodes"],
    anim: ["anim_converge_vs_explode.gif", "Animation: η = 1.12 vs η = 1.13 side by side"],
  };
  const FIG_ORDER = [];
  let lbIndex = 0;
  function initFigures() {
    document.querySelectorAll(".figs").forEach((strip) => {
      strip.dataset.figs.split(",").forEach((id) => {
        const [file, caption] = FIGURES[id];
        const index = FIG_ORDER.push(id) - 1;
        const btn = document.createElement("button");
        btn.className = "btn fig-thumb";
        btn.innerHTML = `<img src="figures/${file}" alt="" loading="lazy"><span>${caption}</span>`;
        btn.setAttribute("aria-label", "Open figure: " + caption);
        btn.addEventListener("click", () => openFigure(index));
        strip.appendChild(btn);
      });
    });
    $("lb-close").addEventListener("click", () => $("lightbox").close());
    $("lb-prev").addEventListener("click", () => openFigure((lbIndex - 1 + FIG_ORDER.length) % FIG_ORDER.length));
    $("lb-next").addEventListener("click", () => openFigure((lbIndex + 1) % FIG_ORDER.length));
    $("lightbox").addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") $("lb-prev").click();
      if (e.key === "ArrowRight") $("lb-next").click();
    });
    $("lightbox").addEventListener("click", (e) => { if (e.target === $("lightbox")) $("lightbox").close(); });
  }
  function openFigure(index) {
    lbIndex = index;
    const [file, caption] = FIGURES[FIG_ORDER[index]];
    $("lightbox-img").src = "figures/" + file;
    $("lightbox-img").alt = caption;
    $("lightbox-caption").textContent = `${caption}  (${index + 1} / ${FIG_ORDER.length})`;
    if (!$("lightbox").open) $("lightbox").showModal();
  }

  // ================================================================ menu & resize
  function initMenu() {
    const btn = $("menu-btn"), panel = $("menu-panel");
    const set = (open) => { panel.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
    btn.addEventListener("click", () => set(panel.hidden));
    panel.addEventListener("click", (e) => { if (e.target.tagName === "A") set(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
    document.addEventListener("click", (e) => { if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) set(false); });
  }
  let resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { fitPage(); drawHero(); placeTicks(); renderAll(); drawLagrange(); }, 120);
  }

  // ================================================================ title-screen text
  $("hero-n").textContent = fmtInt(R.n_rows);
  $("hero-crit").textContent = fmt(ETA_CRIT, 3);
  drawBlockTitle($("hero-title"), ["LEARN", "OR", "EXPLODE"]);
  // ================================================================ pages (one at a time, Back / Next)
  const PAGES = [...document.querySelectorAll(".page")];
  let pageIndex = 0;
  const pageFromHash = () => Math.max(0, PAGES.findIndex((p) => "#" + p.id === location.hash));
  function goTo(i) {
    if (i < 0 || i >= PAGES.length || i === pageIndex) return;
    location.hash = PAGES[i].id;                          // hashchange → showPage (keeps browser Back working)
  }
  function showPage(i, { focus = true } = {}) {
    const forward = i >= pageIndex;
    pageIndex = i;
    PAGES.forEach((p, k) => {
      p.classList.toggle("is-active", k === i);
      p.classList.toggle("from-left", k === i && !forward);
    });
    const page = PAGES[i];
    document.querySelector(".parts").classList.toggle("has-active", page.classList.contains("part"));
    $("site-foot").hidden = i !== PAGES.length - 1;
    window.scrollTo(0, 0);
    updatePager();
    fitPage();
    // canvases on a page that was hidden had no size; draw them now that it is visible
    if (page.id === "top") drawHero();
    if (page.id === "demo") { placeTicks(); resetRun(true); }
    if (page.id === "part4") drawLagrange();
    if (page.id === "part5") drawEuler();
    if (page.id === "part2") window.dispatchEvent(new Event("resize"));
    if (focus) {
      const heading = page.querySelector("h1, h2, h3");
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }
  // On wide screens shrink the active page (if needed) so it fits above the pager without scrolling.
  // Phones and tablets keep normal size and scroll instead, so text never gets too small to read.
  const FIT_MIN_WIDTH = 1101, PAGER_SPACE = 106, MIN_SCALE = 0.6;   // 104 px body padding for the pager + 2 px slack
  let lastScale = 1;
  function fitPage() {
    const page = PAGES[pageIndex];
    const target = page.classList.contains("part") ? document.querySelector(".parts") : page;
    document.querySelectorAll(".fit-scaled").forEach((el) => { el.style.transform = ""; el.style.marginBottom = ""; el.classList.remove("fit-scaled"); });
    let scale = 1;
    if (window.innerWidth >= FIT_MIN_WIDTH && !document.fullscreenElement) {
      const height = target.getBoundingClientRect().height;
      scale = Math.max(MIN_SCALE, Math.min(1, (window.innerHeight - PAGER_SPACE) / height));
      if (scale < 0.995) {
        target.classList.add("fit-scaled");
        target.style.transform = `scale(${scale})`;
        target.style.marginBottom = `${-(1 - scale) * height}px`;   // give back the space the scale-down frees
      } else scale = 1;
    }
    const changed = Math.abs(scale - lastScale) > 0.005;
    lastScale = scale;
    return changed;
  }
  // Re-fit when a page's content changes height (e.g. a longer result message wraps onto two lines).
  // Transforms and margins do not change an element's own layout size, so this cannot loop.
  let refitQueued = false;
  const refit = new ResizeObserver(() => {
    if (refitQueued) return;
    refitQueued = true;
    requestAnimationFrame(() => { refitQueued = false; if (fitPage()) onResize(); });   // redraw canvases at the new scale
  });
  PAGES.forEach((p) => refit.observe(p));
  refit.observe(document.querySelector(".parts"));
  function updatePager() {
    const prev = PAGES[pageIndex - 1], next = PAGES[pageIndex + 1];
    $("prev-btn").disabled = !prev;
    $("prev-label").textContent = prev ? prev.dataset.title : "Back";
    $("next-label").textContent = next ? "Next: " + next.dataset.title : "Back to the start";
    $("prev-btn").setAttribute("aria-label", prev ? "Previous page: " + prev.dataset.title : "No previous page");
    $("next-btn").setAttribute("aria-label", next ? "Next page: " + next.dataset.title : "Back to the title screen");
    document.querySelectorAll(".dot").forEach((d, k) => {
      if (k === pageIndex) d.setAttribute("aria-current", "page"); else d.removeAttribute("aria-current");
    });
  }
  function initPager() {
    const dots = $("dots");
    PAGES.forEach((p, k) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.className = "dot"; b.title = p.dataset.title; b.setAttribute("aria-label", "Go to page: " + p.dataset.title);
      b.addEventListener("click", () => goTo(k));
      li.appendChild(b); dots.appendChild(li);
    });
    $("prev-btn").addEventListener("click", () => goTo(pageIndex - 1));
    $("next-btn").addEventListener("click", () => (pageIndex === PAGES.length - 1 ? goTo(0) : goTo(pageIndex + 1)));
    window.addEventListener("hashchange", () => showPage(pageFromHash()));
  }

  // ================================================================ start
  initMenu(); initDemo(); initPart1(); initPart2(); initPart3(); initPart4(); initPart5(); initPart6(); initFigures();
  initPager();
  setEta(0.10, false);
  showPage(pageFromHash(), { focus: false });
  // a direct link like #part3 makes the browser jump to that anchor after loading; start at the top instead
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.addEventListener("load", () => window.scrollTo(0, 0));
  window.addEventListener("resize", onResize);
  requestAnimationFrame(frame);

  // exposed for automated checks only
  window.__demo = { run, setEta, skipToEnd, solveLagrange, iterate, loss, onResize };
})();
