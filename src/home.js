// Home page behaviour, the router (#demo contract and v1 redirects), menu, drawer and the data-driven pictures.
import katex from "katex";
import { R, W_STAR, W0, ETA_CRIT, LAM_MIN, LAM_MAX, COLORS as C, factor, fullRun, runFor, fmt, fmtInt,
  fitCanvas, makeView, drawContours, drawPath, drawGoal, drawStart } from "./lib/maths.js";
import { FIGURES, DERIVATION, TEAM, TOPICS, KEY_NUMBERS } from "./data/content.js";
import SIZES from "./data/figure-sizes.js";
import { protectGreek } from "./lib/greek.js";
import { showDemo, hideDemo } from "./demo.js";

const $ = (id) => document.getElementById(id);
const tex = (el, s, display = false) => katex.render(s, el, { throwOnError: false, displayMode: display });
let scrollToTarget = (el) => el.scrollIntoView();          // replaced by Lenis in motion.js

// ---------------------------------------------------------------- router
// v1 links (the old single page) land on the matching v2 section; unknown hashes go to the top.
const LEGACY = { story: "maths", part1: "maths", part2: "maths", part3: "maths", part4: "maths", part5: "maths", part6: "limit",
  choose: "learn-explode", gallery: "maths", numbers: "limit", runs: "hall", end: "footer", experiment: "demo" };
let view = null;

function route({ initial = false } = {}) {
  const raw = decodeURIComponent(location.hash.slice(1));
  const [name, query = ""] = raw.split("?");
  const target = LEGACY[name] || name;
  if (target === "demo") {
    switchView("demo");
    showDemo(new URLSearchParams(query));
    window.scrollTo(0, 0);
  } else {
    switchView("home");
    const el = target && document.getElementById(target);
    const goal = el && el.closest(".view-home, .site-footer") ? el : $("top");
    if (initial) requestAnimationFrame(() => goal.scrollIntoView({ block: "start" }));
    else scrollToTarget(goal);
  }
  markCurrentNav();
}
function switchView(next) {
  if (next === view) return;
  view = next;
  $("home-main").hidden = next !== "home";
  $("demo-view").hidden = next !== "demo";
  document.documentElement.classList.toggle("is-demo", next === "demo");
  if (next !== "demo") hideDemo();
  window.dispatchEvent(new CustomEvent("viewchange", { detail: next }));
}
export const currentView = () => view;

function initLinks() {
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    if ($("menu").open) $("menu").close();
    const hash = a.getAttribute("href");
    if (location.hash === hash) route(); else location.hash = hash;   // hashchange → route()
  });
  window.addEventListener("hashchange", () => route());
}

// ---------------------------------------------------------------- header colour & menu
const DARK = ".theme-dark, .theme-black";
function updateHeader() {
  const header = $("site-header");
  if (view === "demo") { header.classList.add("on-dark"); return; }
  const el = document.elementsFromPoint(window.innerWidth / 2, 38).find((x) => !header.contains(x) && x.closest("section, .footer-panel"));
  header.classList.toggle("on-dark", !!(el && el.closest(DARK)));
  markCurrentNav();
}
function markCurrentNav() {
  let current = "home";
  if (view === "demo") current = "demo";
  else {
    const y = window.innerHeight * 0.4;
    const inside = (id) => { const r = $(id).getBoundingClientRect(); return r.top <= y && r.bottom > y; };
    if (["maths", "learn-explode", "hall", "limit", "modules"].some(inside)) current = "maths";
    else if (inside("team")) current = "team";
  }
  document.querySelectorAll("[data-nav]").forEach((a) => (a.dataset.nav === current ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
}
function initMenu() {
  const menu = $("menu"), btn = $("menu-btn");
  btn.addEventListener("click", () => { markCurrentNav(); menu.showModal(); btn.setAttribute("aria-expanded", "true"); });
  $("menu-close").addEventListener("click", () => menu.close());
  menu.addEventListener("close", () => btn.setAttribute("aria-expanded", "false"));
}

// ---------------------------------------------------------------- gallery & drawer
let drawerIndex = 0;
const img = (id, cls = "") => {
  const [w, h] = SIZES[id];
  return `<img class="${cls}" src="figures/${id}-1x.webp" srcset="figures/${id}-1x.webp 1x, figures/${id}-2x.webp 2x" width="${w}" height="${h}" loading="lazy" decoding="async" alt="">`;
};
function initGallery() {
  const SPEEDS = [0.6, 1.4, 0.3, 1.0, 0.8, 1.6, 0.5];
  $("scatter").innerHTML = FIGURES.map((f, i) => `<button class="fig-card" data-index="${i}" data-speed="${SPEEDS[i % SPEEDS.length]}" aria-label="Open figure: ${f.title}">
    <span class="fig-frame">${img(f.id)}</span><span class="chip"><span class="chip-module">${f.module}</span>${f.chip}</span></button>`).join("");
  document.querySelectorAll(".fig-card").forEach((b, i) => {
    b.querySelector("img").alt = `${FIGURES[i].title}: notebook figure`;
    b.addEventListener("click", () => openDrawer(i));
  });
  $("drawer-close").addEventListener("click", () => $("drawer").close());
  $("drawer-prev").addEventListener("click", () => openDrawer((drawerIndex + FIGURES.length - 1) % FIGURES.length));
  $("drawer-next").addEventListener("click", () => openDrawer((drawerIndex + 1) % FIGURES.length));
  $("drawer").addEventListener("click", (e) => { if (e.target === $("drawer")) $("drawer").close(); });
}
function openDrawer(i) {
  drawerIndex = i;
  const f = FIGURES[i], [w, h] = SIZES[f.id], im = $("drawer-img");
  $("drawer-chip").textContent = f.chip.startsWith("MODULE") ? f.chip : `Module ${f.module} · ${f.chip}`;
  $("drawer-title").textContent = f.title;
  im.src = `figures/${f.id}-2x.webp`; im.width = w; im.height = h; im.alt = `${f.title}: notebook figure`;
  $("drawer-text").textContent = f.text;
  protectGreek($("drawer-chip"));
  tex($("drawer-eq"), f.eq, true);
  if (!$("drawer").open) $("drawer").showModal();
}

// ---------------------------------------------------------------- LEARN / EXPLODE renders
function drawBleed(canvas, eta, dark) {
  const { ctx, w, h } = fitCanvas(canvas);
  if (w < 2) return;
  const v = makeView(W_STAR[0] - 0.5, W_STAR[1], 4.2 * w / h, 4.2);
  drawContours(ctx, v, w, h, { fill: dark ? C.olive : C.cream, stroke: dark ? C.paper : C.ink, alpha: dark ? 0.25 : 0.22, spacing: 0.32 });
  const { path } = fullRun(eta, eta > ETA_CRIT ? 160 : 2000);
  drawPath(ctx, v, w, h, path, { color: dark ? C.explode : C.olive, width: 1.6, dots: 2.2, dotColor: dark ? C.explode : C.ink });
  drawStart(ctx, v, w, h); drawGoal(ctx, v, w, h, C.lime, dark ? C.paper : C.ink);
}
function initLearnExplode() {
  const a = runFor(1.12), b = runFor(1.13);
  $("le-learn-fact").textContent = `Factor ${fmt(a.factor, 4)} · converges in ${fmtInt(a.steps)} steps`;
  $("le-explode-fact").textContent = `Factor ${fmt(b.factor, 4)} · explodes at step ${fmtInt(b.steps)}`;
}

// ---------------------------------------------------------------- hall of fame
const HALL_VIEW = (w, h) => makeView(0.75, -0.25, 3.6 * Math.max(1, w / h), 3.6 * Math.max(1, h / w));
function drawHallCard(canvas, run, upTo) {
  const { ctx, w, h } = fitCanvas(canvas);
  if (w < 2) return;
  const v = HALL_VIEW(w, h);
  drawContours(ctx, v, w, h, { fill: "#101209", stroke: C.paper, alpha: 0.2, spacing: 0.32 });
  const bad = run.outcome === "exploded";
  drawPath(ctx, v, w, h, run.path.slice(0, upTo), { color: bad ? C.explode : C.lime, width: 1.4, dots: run.path.length > 300 ? 0 : 1.8 });
  drawStart(ctx, v, w, h); drawGoal(ctx, v, w, h, C.lime, C.paper);
}
function initHall() {
  const grid = $("hall-grid");
  R.gd_runs.forEach((r) => {
    const sim = fullRun(r.eta, 2000);
    const shown = { ...sim, path: sim.outcome === "exploded" ? sim.path.slice(0, 140) : sim.path, outcome: sim.outcome };
    const bad = r.outcome === "exploded";
    const card = document.createElement("button");
    card.className = `run-card${bad ? " is-bad" : ""}`;
    card.setAttribute("aria-label", `η = ${r.eta.toFixed(2)}: ${bad ? `exploded at step ${fmtInt(r.steps)}` : `converged in ${fmtInt(r.steps)} steps`}. Opens the experiment.`);
    card.innerHTML = `<canvas aria-hidden="true"></canvas><span class="run-eta">η = ${r.eta.toFixed(2)}</span>
      <span class="run-label tag">${bad ? `Exploded · step ${fmtInt(r.steps)}` : `η = ${r.eta.toFixed(2)} · ${fmtInt(r.steps)} steps`}</span>`;
    grid.appendChild(card);
    const canvas = card.querySelector("canvas");
    let anim = 0;
    const replay = () => {
      cancelAnimationFrame(anim);
      const start = performance.now(), total = shown.path.length, ms = 1400;
      const tick = (now) => { const t = Math.min(1, (now - start) / ms); drawHallCard(canvas, shown, Math.max(2, Math.round(t * total))); if (t < 1) anim = requestAnimationFrame(tick); };
      anim = requestAnimationFrame(tick);
    };
    card.addEventListener("mouseenter", replay); card.addEventListener("focus", replay);
    card.addEventListener("click", () => { location.hash = `demo?eta=${r.eta.toFixed(2)}`; });
    card._draw = () => drawHallCard(canvas, shown, shown.path.length);
  });
}

// ---------------------------------------------------------------- the limit
function stabilitySvg() {
  const W = 520, H = 320, pad = { l: 46, r: 16, t: 16, b: 40 };
  const X = (e) => pad.l + e / 1.4 * (W - pad.l - pad.r), Y = (f) => pad.t + (1 - f / 1.35) * (H - pad.t - pad.b);
  let d = "";
  for (let i = 0; i <= 280; i++) { const e = 1.4 * i / 280; d += `${i ? "L" : "M"}${X(e).toFixed(1)} ${Y(Math.min(factor(e), 1.35)).toFixed(1)}`; }
  const grid = [0, 0.5, 1].map((f) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(f)}" y2="${Y(f)}" stroke="#15170F" stroke-opacity=".12"/><text x="${pad.l - 8}" y="${Y(f) + 4}" text-anchor="end">${f.toFixed(1)}</text>`).join("");
  const xt = [0, 0.4, 0.8, 1.2].map((e) => `<text x="${X(e)}" y="${H - pad.b + 20}" text-anchor="middle">${e.toFixed(1)}</text>`).join("");
  const dots = R.gd_runs.map((r) => `<circle cx="${X(r.eta)}" cy="${Y(r.factor)}" r="4.5" fill="${r.outcome === "exploded" ? C.explode : C.olive}" stroke="#15170F"><title>η = ${r.eta}: factor ${fmt(r.factor, 4)}</title></circle>`).join("");
  return `<style>text{font:600 11px 'Mona Sans Variable',system-ui;fill:#15170F}</style>
    <rect x="${X(ETA_CRIT)}" y="${pad.t}" width="${X(1.4) - X(ETA_CRIT)}" height="${H - pad.t - pad.b}" fill="${C.explode}" fill-opacity=".14"/>
    ${grid}${xt}<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(1)}" y2="${Y(1)}" stroke="#15170F" stroke-dasharray="5 5"/>
    <path d="${d}" fill="none" stroke="#15170F" stroke-width="2.5"/>
    <line x1="${X(ETA_CRIT)}" x2="${X(ETA_CRIT)}" y1="${pad.t}" y2="${H - pad.b}" stroke="${C.explode}" stroke-width="2"/>
    <rect x="${X(ETA_CRIT) - 30}" y="${pad.t + 6}" width="60" height="22" rx="4" fill="${C.lime}"/><text x="${X(ETA_CRIT)}" y="${pad.t + 21}" text-anchor="middle">${fmt(ETA_CRIT, 3)}</text>
    ${dots}<text x="${(pad.l + W - pad.r) / 2}" y="${H - 6}" text-anchor="middle">learning rate η</text>`;
}
function initLimit() {
  $("derivation").innerHTML = DERIVATION.map(() => "<li><span></span></li>").join("");
  $("derivation").querySelectorAll("span").forEach((el, i) => tex(el, DERIVATION[i]));
  $("stab-svg").innerHTML = stabilitySvg();
}

// ---------------------------------------------------------------- team, marquees
const MODULE_COLOUR = { I: C.lime, II: "#9FD8B5", III: "#F2B33D", "I+II": C.paper };
function initTeam() {
  const mid = (TEAM.length - 1) / 2;
  $("fan").innerHTML = TEAM.map((m, i) => {
    const initials = m.name.split(" ").map((p) => p[0]).join("");
    return `<div class="member" tabindex="0" style="--r:${((i - mid) * 7).toFixed(1)}deg;--y:${Math.round(Math.abs(i - mid) ** 2 * 9)}px;--accent-m:${MODULE_COLOUR[m.module]}">
      <span class="mono" aria-hidden="true">${initials}</span><span><span class="m-name">${m.name}</span><span class="m-part tag" style="display:block">Module ${m.module}</span><span class="m-part" style="display:block">${m.part}</span></span></div>`;
  }).join("");
}
const marquee = (el, items) => { el.innerHTML = [...items, ...items].map((t) => `<span>${t}</span>`).join(""); };

// ---------------------------------------------------------------- redraw
function redrawCanvases() {
  drawBleed($("bleed-learn"), 1.12, false);
  drawBleed($("bleed-explode"), 1.13, true);
  document.querySelectorAll(".run-card").forEach((c) => c._draw && c._draw());
}

export function initHome() {
  $("n-homes").textContent = fmtInt(R.n_rows);
  initLinks(); initMenu(); initGallery(); initLearnExplode(); initHall(); initLimit(); initTeam();
  marquee($("topics"), TOPICS); marquee($("numbers"), KEY_NUMBERS);
  window.addEventListener("scroll", updateHeader, { passive: true });
  window.addEventListener("viewchange", () => requestAnimationFrame(() => { redrawCanvases(); updateHeader(); }));
  let t = 0; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(redrawCanvases, 150); });
  route({ initial: true });
  redrawCanvases(); updateHeader();
}
export function setScroller(fn) { scrollToTarget = fn; }
