// The experiment: live gradient descent on the loss contours. Contract (do not change):
// #demo opens it; #demo?preset=1..4 picks η = 0.10 / 1.00 / 1.12 / 1.13; keys 1–4, Space, R, S, F, + / −.
import { R, W_STAR, W0, LAM_MIN, LAM_MAX, ETA_CRIT, ETA_OPT, ETA_ZIGZAG, TOL, MAX_STEPS, COLORS as C,
  loss, step, dist, factor, outcomeOf, fmt, fmtInt, fitCanvas, makeView, toPx, fromPx, drawContours, drawGoal, drawStart } from "./lib/maths.js";

const $ = (id) => document.getElementById(id);
export const PRESETS = { 1: 0.10, 2: 1.00, 3: 1.12, 4: 1.13 };
const TRAIL = 14;                                     // steps drawn bold; older steps are a faint line

// ---------------------------------------------------------------- zoomable view
// Zoom index k: the view is 2^(k/2) times wider than the base view w1 ∈ [−2.5, 4], w2 ∈ [−3, 2.5].
const BASE = { cx: 0.75, cy: -0.25, hw: 3.25, hh: 2.75 };
const MIN_K = -4, MAX_K = 44, MAX_DRAWN_K = 6;
const zoomOf = (k) => 2 ** (k / 2);
const viewFor = (k) => makeView(BASE.cx, BASE.cy, BASE.hw * zoomOf(k), BASE.hh * zoomOf(k));
const extentOf = (w) => Math.max(Math.abs(w[0] - BASE.cx) / BASE.hw, Math.abs(w[1] - BASE.cy) / BASE.hh);

const run = { eta: 0.1, w0: W0.slice(), path: [], dists: [], outcome: null, playing: false, carry: 0, speed: 1, extent: 0 };
let zoomK = 0, follow = true, active = false, lastTime = 0, rafId = 0;
const contourCache = new Map();

function reset(autoplay = true) {
  run.path = [run.w0.slice()];
  run.dists = [dist(run.w0, W_STAR)];
  run.extent = extentOf(run.w0);
  run.outcome = null; run.carry = 0; run.playing = autoplay;
  render();
}
function stepOnce() {
  if (run.outcome) return;
  const next = step(run.path[run.path.length - 1], run.eta);
  run.path.push(next);
  run.dists.push(dist(next, W_STAR));
  if (Number.isFinite(next[0]) && Number.isFinite(next[1])) run.extent = Math.max(run.extent, extentOf(next));
  run.outcome = outcomeOf(next, run.path.length - 1);
  if (run.outcome) run.playing = false;
}
export function setEta(eta, autoplay = true) {
  run.eta = Math.max(0, Math.min(20, Math.round(eta * 100) / 100));
  $("eta").value = Math.min(1.3, Math.max(0.05, run.eta)).toFixed(2);
  $("eta-out").textContent = `η = ${run.eta.toFixed(2)}`;
  document.querySelectorAll(".preset").forEach((b) => b.classList.toggle("is-on", Number(b.dataset.eta) === run.eta));
  reset(autoplay);
}
const skip = () => { while (!run.outcome) stepOnce(); render(); };
function togglePlay() { if (run.outcome) { reset(true); return; } run.playing = !run.playing; renderText(); }
function setZoom(k) { zoomK = Math.max(MIN_K, Math.min(MAX_K, k)); follow = false; $("follow").checked = false; drawMap(); }

// ---------------------------------------------------------------- map
function contours(k, w, h, dpr) {
  const key = `${k}|${w}x${h}@${dpr}`;
  if (!contourCache.has(key)) {
    if (contourCache.size > 12) contourCache.clear();
    const off = document.createElement("canvas");
    off.width = Math.round(w * dpr); off.height = Math.round(h * dpr);
    const ctx = off.getContext("2d"); ctx.scale(dpr, dpr);
    drawContours(ctx, viewFor(k), w, h, { fill: C.ink, stroke: C.paper, alpha: 0.32, spacing: 0.3 });
    contourCache.set(key, off);
  }
  return contourCache.get(key);
}
function drawMap() {
  const canvas = $("map");
  const { ctx, w, h, dpr } = fitCanvas(canvas);
  if (w < 2) return;
  if (follow) { const r = run.extent * 1.12; zoomK = r <= 1 ? 0 : Math.min(MAX_K, Math.ceil(2 * Math.log2(r))); }
  const v = viewFor(zoomK);
  if (zoomK <= MAX_DRAWN_K) ctx.drawImage(contours(zoomK, w, h, dpr), 0, 0, w, h);
  else {                                              // far out: the bowl shrinks to a speck in the dark
    const s = zoomOf(MAX_DRAWN_K) / zoomOf(zoomK);
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(contours(MAX_DRAWN_K, w, h, dpr), w * (1 - s) / 2, h * (1 - s) / 2, w * s, h * s);
  }
  $("zoom-label").textContent = zoomLabel();

  drawStart(ctx, v, w, h, run.w0, C.paper, C.ink);
  const pts = run.path.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const px = pts.map((p) => toPx(v, p, w, h));
  const exploding = factor(run.eta) >= 1;
  const tint = exploding ? C.explode : C.lime;
  if (px.length > 1) {
    ctx.lineJoin = "round";
    ctx.strokeStyle = tint; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.2;
    ctx.beginPath(); const stride = Math.max(1, Math.floor(px.length / 3000));
    for (let i = 0; i < px.length; i += stride) (i ? ctx.lineTo(...px[i]) : ctx.moveTo(...px[i]));
    ctx.lineTo(...px[px.length - 1]); ctx.stroke(); ctx.globalAlpha = 1;
    const recent = px.slice(-TRAIL);
    ctx.strokeStyle = tint; ctx.lineWidth = 2.6;
    ctx.beginPath(); recent.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.fillStyle = C.paper; recent.slice(0, -1).forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); });
  }
  drawGoal(ctx, v, w, h, C.lime, C.paper);
  const cur = px[px.length - 1];
  const onMap = cur && cur[0] >= 0 && cur[0] <= w && cur[1] >= 0 && cur[1] <= h;
  if (onMap) {
    ctx.fillStyle = tint; ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cur[0], cur[1], 9, 0, 7); ctx.fill(); ctx.stroke();
  }
  $("map-banner").hidden = !!onMap;
}
function zoomLabel() {
  const z = zoomOf(zoomK), big = (x) => Math.round(x).toLocaleString("en-US");
  const shown = z < 10 ? z.toFixed(z < 1 ? 2 : 1).replace(/\.0$/, "") : big(z);
  const half = BASE.hw * z;
  return `zoom ×${shown} · w₁ ±${half < 100 ? half.toFixed(1) : big(half)}`;
}

// ---------------------------------------------------------------- charts
function axes(ctx, w, h, pad) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = C.olive; ctx.fillRect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b);
  ctx.font = "600 11px 'Mona Sans Variable', system-ui"; ctx.fillStyle = "#C9CBBE"; ctx.strokeStyle = "rgba(242,241,234,.1)"; ctx.lineWidth = 1;
}
function drawStability() {
  const { ctx, w, h } = fitCanvas($("stab-chart"));
  if (w < 2) return;
  const pad = { l: 40, r: 10, t: 10, b: 28 }, X = (e) => pad.l + e / 1.4 * (w - pad.l - pad.r), Y = (f) => pad.t + (1 - f / 1.35) * (h - pad.t - pad.b);
  axes(ctx, w, h, pad);
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  [0, 0.5, 1].forEach((f) => { ctx.beginPath(); ctx.moveTo(pad.l, Y(f)); ctx.lineTo(w - pad.r, Y(f)); ctx.stroke(); ctx.fillText(f.toFixed(1), pad.l - 6, Y(f)); });
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  [0, 0.4, 0.8, 1.2].forEach((e) => ctx.fillText(e.toFixed(1), X(e), h - pad.b + 8));
  ctx.fillStyle = "rgba(224,84,42,.18)"; ctx.fillRect(X(ETA_CRIT), pad.t, X(1.4) - X(ETA_CRIT), h - pad.t - pad.b);
  ctx.setLineDash([4, 4]); ctx.strokeStyle = C.paper; ctx.globalAlpha = .5; ctx.beginPath(); ctx.moveTo(pad.l, Y(1)); ctx.lineTo(w - pad.r, Y(1)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  ctx.strokeStyle = C.lime; ctx.lineWidth = 2.5; ctx.beginPath();
  for (let i = 0; i <= 200; i++) { const e = 1.4 * i / 200; i ? ctx.lineTo(X(e), Y(Math.min(factor(e), 1.35))) : ctx.moveTo(X(e), Y(factor(e))); }
  ctx.stroke();
  const e = Math.min(run.eta, 1.4), f = factor(run.eta), y = Y(Math.min(f, 1.33));
  ctx.fillStyle = f >= 1 ? C.explode : C.lime; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(X(e), y, 7, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.paper; ctx.font = "700 12px 'Mona Sans Variable', system-ui"; ctx.textAlign = X(e) > w - 90 ? "right" : "left"; ctx.textBaseline = "bottom";
  ctx.fillText(fmt(f, 4), X(e) + (ctx.textAlign === "left" ? 10 : -10), y - 6);
}
function drawDistance() {
  const { ctx, w, h } = fitCanvas($("dist-chart"));
  if (w < 2) return;
  const pad = { l: 44, r: 10, t: 10, b: 28 }, n = run.dists.length - 1;
  const xMax = Math.max(60, Math.ceil(n * 1.15 / 10) * 10);
  const X = (k) => pad.l + k / xMax * (w - pad.l - pad.r);
  const Y = (d) => pad.t + (1 - (Math.log10(Math.max(Math.min(d, 1e9), 1e-9)) + 7) / 14) * (h - pad.t - pad.b);
  axes(ctx, w, h, pad);
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (let p = -6; p <= 6; p += 3) { ctx.beginPath(); ctx.moveTo(pad.l, Y(10 ** p)); ctx.lineTo(w - pad.r, Y(10 ** p)); ctx.stroke(); ctx.fillText(`1e${p}`, pad.l - 6, Y(10 ** p)); }
  ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(fmtInt(xMax), w - pad.r - 14, h - pad.b + 8); ctx.fillText("0", X(0), h - pad.b + 8);
  ctx.setLineDash([4, 4]); ctx.strokeStyle = C.converge; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(pad.l, Y(TOL)); ctx.lineTo(w - pad.r, Y(TOL)); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = factor(run.eta) >= 1 ? C.explode : C.lime; ctx.lineWidth = 2.5; ctx.beginPath();
  const stride = Math.max(1, Math.floor(n / 1200));
  for (let k = 0; k <= n; k += stride) (k ? ctx.lineTo(X(k), Y(run.dists[k])) : ctx.moveTo(X(k), Y(run.dists[k])));
  ctx.lineTo(X(n), Y(run.dists[n])); ctx.stroke();
}

// ---------------------------------------------------------------- text
const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };
function renderText() {
  const cur = run.path[run.path.length - 1], n = run.path.length - 1, f = factor(run.eta);
  const state = f >= 1 ? "explode" : run.outcome === "converged" ? "done" : "learn";
  $("badge").className = `badge${state === "explode" ? " is-explode" : state === "done" ? " is-done" : ""}`;
  setText($("badge-word"), { explode: "Exploding", done: "Converged", learn: "Converging" }[state]);
  setText($("badge-sub"), f >= 1 ? "each bounce is bigger than the last" : run.eta > ETA_ZIGZAG ? "zig-zagging: each bounce is smaller" : "moving straight downhill");
  setText($("r-factor"), fmt(f, 4));
  setText($("r-step"), fmtInt(n));
  setText($("r-dist"), fmt(run.dists[n], 4));
  setText($("r-loss"), fmt(loss(cur), 4));
  const out = { converged: `Converged in ${fmtInt(n)} steps (‖w − w*‖ < 10⁻⁶).`, exploded: `Exploded: ‖w‖ passed 10⁶ at step ${fmtInt(n)}.`,
    unfinished: `Still going after ${fmtInt(MAX_STEPS)} steps: too slow to finish.` }[run.outcome] || (run.playing ? "Training…" : "Paused.");
  setText($("outcome"), out);
  setText($("play-btn"), run.outcome ? "Replay" : run.playing ? "Pause" : "Play");
}
function render() { drawMap(); drawStability(); drawDistance(); renderText(); }

function placeTicks() {
  const s = $("eta"), min = Number(s.min), max = Number(s.max), thumb = 24, width = s.offsetWidth;
  const pct = (e) => (e - min) / (max - min);
  $("ticks").innerHTML = "";
  [[ETA_ZIGZAG, "tick-zig", `zig-zag<br>${fmt(ETA_ZIGZAG, 3)}`], [ETA_OPT, "tick-opt", `best<br>${fmt(ETA_OPT, 2)}`], [ETA_CRIT, "tick-crit", `η crit<br>${fmt(ETA_CRIT, 3)}`]].forEach(([e, cls, html]) => {
    const t = document.createElement("span"); t.className = `tick ${cls}`; t.innerHTML = html;
    t.style.left = `${thumb / 2 + pct(e) * (width - thumb)}px`; $("ticks").appendChild(t);
  });
  const z = pct(ETA_ZIGZAG) * 100, c = pct(ETA_CRIT) * 100;
  s.style.setProperty("--track", `linear-gradient(90deg, ${C.converge} 0 ${z}%, ${C.lime} ${z}% ${c}%, ${C.explode} ${c}% 100%)`);
}

// ---------------------------------------------------------------- loop
function frame(time) {
  rafId = 0;
  if (!active || document.hidden) { lastTime = 0; return; }
  const dt = Math.min(1000, time - (lastTime || time)); lastTime = time;
  if (run.playing && !run.outcome) {
    run.carry += dt / 1000 * (4 + 0.6 * (run.path.length - 1)) * run.speed;   // speeds up as the run goes on
    let n = Math.floor(run.carry); run.carry -= n;
    while (n-- > 0 && !run.outcome) stepOnce();
    drawMap(); drawDistance(); renderText();
  }
  rafId = requestAnimationFrame(frame);
}
const startLoop = () => { if (!rafId) rafId = requestAnimationFrame(frame); };

// ---------------------------------------------------------------- keys (event.code, so any layout / caps lock works)
const DIGITS = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4 };
function onKey(e) {
  if (!active || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
  const t = e.target;
  if (t.isContentEditable || (t.tagName === "INPUT" && !["range", "checkbox"].includes(t.type)) || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
  let handled = true;
  if (DIGITS[e.code]) setEta(PRESETS[DIGITS[e.code]]);
  else if (e.code === "Space") togglePlay();
  else if (e.code === "KeyR") reset(true);
  else if (e.code === "KeyS") skip();
  else if (e.code === "KeyF") toggleFullscreen();
  else if (e.code === "Equal" || e.code === "NumpadAdd") setZoom(zoomK - 1);
  else if (e.code === "Minus" || e.code === "NumpadSubtract") setZoom(zoomK + 1);
  else handled = false;
  if (handled) { e.preventDefault(); startLoop(); }
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else $("demo-view").requestFullscreen?.().catch(() => {});
}

// ---------------------------------------------------------------- public
export function initDemo() {
  $("eta").addEventListener("input", (e) => setEta(Number(e.target.value)));
  document.querySelectorAll(".preset").forEach((b) => b.addEventListener("click", () => setEta(Number(b.dataset.eta))));
  $("play-btn").addEventListener("click", togglePlay);
  $("step-btn").addEventListener("click", () => { run.playing = false; stepOnce(); render(); });
  $("reset-btn").addEventListener("click", () => reset(true));
  $("skip-btn").addEventListener("click", skip);
  $("full-btn").addEventListener("click", toggleFullscreen);
  $("zoom-in").addEventListener("click", () => setZoom(zoomK - 1));
  $("zoom-out").addEventListener("click", () => setZoom(zoomK + 1));
  $("follow").addEventListener("change", (e) => { follow = e.target.checked; drawMap(); });
  document.querySelectorAll("[data-speed]").forEach((b) => b.addEventListener("click", () => {
    run.speed = Number(b.dataset.speed);
    document.querySelectorAll("[data-speed]").forEach((o) => o.classList.toggle("is-on", o === b));
  }));
  $("map").addEventListener("wheel", (e) => { e.preventDefault(); setZoom(zoomK + (e.deltaY > 0 ? 1 : -1)); }, { passive: false });
  $("map").addEventListener("click", (e) => {
    const r = $("map").getBoundingClientRect();
    run.w0 = fromPx(viewFor(zoomK), e.clientX - r.left, e.clientY - r.top, r.width, r.height).map((x) => Math.round(x * 100) / 100);
    reset(true); startLoop();
  });
  document.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) startLoop(); });
  window.addEventListener("resize", () => { if (active) { contourCache.clear(); placeTicks(); render(); } });
  document.addEventListener("fullscreenchange", () => setTimeout(() => { contourCache.clear(); render(); }, 60));
}

/** Called by the router when the experiment opens (params from #demo?preset=…). */
export function showDemo(params) {
  active = true;
  const preset = PRESETS[params.get("preset")];
  const eta = preset ?? (params.has("eta") && Number.isFinite(Number(params.get("eta"))) ? Number(params.get("eta")) : 0.10);
  run.w0 = W0.slice();
  requestAnimationFrame(() => { placeTicks(); setEta(eta, true); startLoop(); });
}
export function hideDemo() { active = false; }

// Exposed for automated checks only.
window.__demo = { run, setEta, skip, isActive: () => active, zoomLabel, R, LAM_MIN, LAM_MAX };
