// The model's maths, computed live from the numbers in results.json, plus formatting and the
// 2D contour-map drawing shared by the experiment, the hall of fame and the LEARN / EXPLODE renders.
import R from "../data/results.js";

export { R };
export const A = R.A, B = R.b, W_STAR = R.w_star, W0 = R.w0;
export const [LAM_MIN, LAM_MAX] = R.eigenvalues;
export const [V_FLAT, V_STEEP] = R.eigenvectors;
export const ETA_CRIT = R.eta_crit, ETA_OPT = R.eta_opt, ETA_ZIGZAG = 1 / LAM_MAX;
export const L_STAR = R.loss_at_w_star;
export const TOL = 1e-6, BLOW_UP = 1e6, MAX_STEPS = 10000;

export const loss = (w) => 0.5 * (A[0][0] * w[0] * w[0] + 2 * A[0][1] * w[0] * w[1] + A[1][1] * w[1] * w[1]) - B[0] * w[0] - B[1] * w[1] + 0.5;
export const gradient = (w) => [A[0][0] * w[0] + A[0][1] * w[1] - B[0], A[1][0] * w[0] + A[1][1] * w[1] - B[1]];
export const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
export const factor = (eta) => Math.max(Math.abs(1 - eta * LAM_MIN), Math.abs(1 - eta * LAM_MAX));
export const runFor = (eta) => R.gd_runs.find((r) => Math.abs(r.eta - eta) < 1e-9);

/** One gradient-descent (Euler) step. */
export const step = (w, eta) => { const g = gradient(w); return [w[0] - eta * g[0], w[1] - eta * g[1]]; };

/** Outcome of a run after the latest point, or null while it is still going. */
export function outcomeOf(w, steps) {
  if (!Number.isFinite(w[0]) || !Number.isFinite(w[1]) || Math.hypot(w[0], w[1]) > BLOW_UP) return "exploded";
  if (dist(w, W_STAR) < TOL) return "converged";
  if (steps >= MAX_STEPS) return "unfinished";
  return null;
}

/** A whole run from w0 (used by the static pictures). */
export function fullRun(eta, maxSteps = MAX_STEPS) {
  const path = [W0.slice()];
  let outcome = null;
  while (!outcome && path.length <= maxSteps) {
    path.push(step(path[path.length - 1], eta));
    outcome = outcomeOf(path[path.length - 1], path.length - 1);
  }
  return { path, outcome, steps: path.length - 1 };
}

// ---------------------------------------------------------------- formatting
export const fmt = (x, d = 3) => {
  if (!Number.isFinite(x)) return "∞";
  const s = Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-3 && x !== 0) ? x.toExponential(2) : x.toFixed(d);
  return s.replace("-", "−");
};
export const fmtInt = (n) => Math.round(n).toLocaleString("en-US");

// ---------------------------------------------------------------- drawing
export const COLORS = { olive: "#282C20", olive2: "#33382A", paper: "#F2F1EA", cream: "#EDEBDD", ink: "#15170F",
  lime: "#D4F000", explode: "#E0542A", converge: "#3FA36B", muted: "#8A8F7E" };

/** Size a canvas to its CSS box at the device pixel ratio; returns the 2D context in CSS pixels. */
export function fitCanvas(canvas, maxDpr = 2) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const pw = Math.max(1, Math.round(rect.width * dpr)), ph = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height, dpr };
}

/** A view of the (w1, w2) plane: centre and half-widths. */
export const makeView = (cx, cy, hw, hh) => ({ cx, cy, hw, hh });
export const toPx = (v, w, W, H) => [(w[0] - v.cx + v.hw) / (2 * v.hw) * W, (v.cy + v.hh - w[1]) / (2 * v.hh) * H];
export const fromPx = (v, x, y, W, H) => [v.cx - v.hw + x / W * 2 * v.hw, v.cy + v.hh - y / H * 2 * v.hh];

/** Contour lines of sqrt(L − L*) (evenly spaced rings of the bowl) drawn into ctx over the view. */
export function drawContours(ctx, v, W, H, { stroke = COLORS.paper, alpha = 0.35, spacing = 0.35, fill = null, lineWidth = 1 } = {}) {
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, W, H); }
  const NX = Math.max(24, Math.round(W / 6)), NY = Math.max(24, Math.round(H / 6));
  const grid = [];
  for (let j = 0; j <= NY; j++) {
    const row = [];
    for (let i = 0; i <= NX; i++) row.push(Math.sqrt(Math.max(0, loss(fromPx(v, i * W / NX, j * H / NY, W, H)) - L_STAR)));
    grid.push(row);
  }
  let top = 0;
  grid.forEach((row) => row.forEach((x) => { top = Math.max(top, x); }));
  const step = Math.max(spacing, top / 60);                           // never more than ~60 rings
  ctx.save();
  ctx.strokeStyle = stroke; ctx.globalAlpha = alpha; ctx.lineWidth = lineWidth; ctx.beginPath();
  const cw = W / NX, ch = H / NY;
  for (let level = step; level < top; level += step) {
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const tl = grid[j][i], tr = grid[j][i + 1], bl = grid[j + 1][i], br = grid[j + 1][i + 1], p = [];
        if ((tl < level) !== (tr < level)) p.push((i + (level - tl) / (tr - tl)) * cw, j * ch);
        if ((tr < level) !== (br < level)) p.push((i + 1) * cw, (j + (level - tr) / (br - tr)) * ch);
        if ((bl < level) !== (br < level)) p.push((i + (level - bl) / (br - bl)) * cw, (j + 1) * ch);
        if ((tl < level) !== (bl < level)) p.push(i * cw, (j + (level - tl) / (bl - tl)) * ch);
        for (let k = 0; k + 3 < p.length; k += 4) { ctx.moveTo(p[k], p[k + 1]); ctx.lineTo(p[k + 2], p[k + 3]); }
      }
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** A gradient-descent path with dots on each step. */
export function drawPath(ctx, v, W, H, pts, { color = COLORS.lime, width = 2, dots = 3, dotColor = color } = {}) {
  if (pts.length < 2) return;
  const px = pts.map((p) => toPx(v, p, W, H));
  ctx.save();
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); px.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  if (dots) {
    ctx.fillStyle = dotColor;
    px.forEach(([x, y]) => { if (x > -10 && y > -10 && x < W + 10 && y < H + 10) { ctx.beginPath(); ctx.arc(x, y, dots, 0, 7); ctx.fill(); } });
  }
  ctx.restore();
}

/** The minimum w*: a small flag. */
export function drawGoal(ctx, v, W, H, color = COLORS.lime, ink = COLORS.ink) {
  const [x, y] = toPx(v, W_STAR, W, H);
  ctx.save();
  ctx.strokeStyle = ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 26); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y - 26); ctx.lineTo(x + 17, y - 21); ctx.lineTo(x, y - 15); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
  ctx.restore();
}

/** The start w0: a small square. */
export function drawStart(ctx, v, W, H, w0 = W0, fill = COLORS.paper, ink = COLORS.ink) {
  const [x, y] = toPx(v, w0, W, H);
  ctx.save(); ctx.fillStyle = fill; ctx.strokeStyle = ink; ctx.lineWidth = 2;
  ctx.fillRect(x - 7, y - 7, 14, 14); ctx.strokeRect(x - 7, y - 7, 14, 14); ctx.restore();
}
