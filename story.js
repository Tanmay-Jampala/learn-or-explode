/* Learn or Explode - the scroll story.
   Everything that reacts to scrolling lives here: loading screen, contour-line backgrounds, the statement
   that lights up word by word, the sideways tour of the six stops, fit-to-screen scaling, reveals,
   the full-screen menu, the counting numbers and the fan of run cards.
   The experiment itself is in app.js (window.__demo). */
(function () {
  "use strict";

  const R = window.RESULTS, demo = window.__demo;
  if (!R || !demo) return;

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isWide = () => window.innerWidth > 1100;          // matches the CSS breakpoint for the sideways story
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const fmtInt = (n) => n.toLocaleString("en-IN");

  // ---------------------------------------------------------------- contour-line backgrounds
  // Faint topographic lines behind the dark and light sections, drawn once with marching squares over a
  // smooth periodic field (periodic so the tile repeats without seams). No image files needed.
  function contourTile(color) {
    const W = 1500, H = 940, nx = 150, ny = 94;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    let seed = 21;
    const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const waves = Array.from({ length: 7 }, () => [1 + Math.floor(rand() * 3), 1 + Math.floor(rand() * 3), rand() * 6.283, rand() * 6.283, 0.4 + rand()]);
    const field = (x, y) => waves.reduce((sum, [a, b, p, q, m]) => sum + m * Math.sin(6.283 * a * x / W + p) * Math.cos(6.283 * b * y / H + q), 0);
    const values = [];
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j <= ny; j++) {
      const row = [];
      for (let i = 0; i <= nx; i++) { const v = field(i * W / nx, j * H / ny); row.push(v); lo = Math.min(lo, v); hi = Math.max(hi, v); }
      values.push(row);
    }
    ctx.strokeStyle = color; ctx.lineWidth = 1.3;
    const cw = W / nx, ch = H / ny;
    for (let level = 1; level < 13; level++) {
      const L = lo + (hi - lo) * level / 13;
      ctx.beginPath();
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const tl = values[j][i], tr = values[j][i + 1], bl = values[j + 1][i], br = values[j + 1][i + 1];
          const pts = [];
          if ((tl < L) !== (tr < L)) pts.push([(i + (L - tl) / (tr - tl)) * cw, j * ch]);
          if ((tr < L) !== (br < L)) pts.push([(i + 1) * cw, (j + (L - tr) / (br - tr)) * ch]);
          if ((bl < L) !== (br < L)) pts.push([(i + (L - bl) / (br - bl)) * cw, (j + 1) * ch]);
          if ((tl < L) !== (bl < L)) pts.push([i * cw, (j + (L - tl) / (bl - tl)) * ch]);
          for (let k = 0; k + 1 < pts.length; k += 2) { ctx.moveTo(pts[k][0], pts[k][1]); ctx.lineTo(pts[k + 1][0], pts[k + 1][1]); }
        }
      }
      ctx.stroke();
    }
    return `url(${canvas.toDataURL("image/png")})`;
  }
  root.style.setProperty("--contours-light", contourTile("rgba(243, 242, 231, 0.10)"));
  root.style.setProperty("--contours-dark", contourTile("rgba(34, 51, 58, 0.10)"));

  // ---------------------------------------------------------------- loading screen
  const preloader = $("preloader");
  let introDone = false;
  function finishIntro() {
    if (introDone) return;
    introDone = true;
    root.classList.add("is-loaded");
    setTimeout(() => preloader.classList.add("is-gone"), REDUCED ? 0 : 800);
  }
  function skipIntro() { finishIntro(); preloader.classList.add("is-gone"); }
  if (REDUCED) skipIntro(); else setTimeout(finishIntro, 1450);

  // ---------------------------------------------------------------- statement: words light up with scroll
  const mega = $("mega");
  const words = [];
  (function splitWords(node) {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((piece) => {
          if (!piece.trim()) { frag.appendChild(document.createTextNode(piece)); return; }
          const span = document.createElement("span");
          span.className = "word"; span.textContent = piece;
          words.push(span); frag.appendChild(span);
        });
        child.replaceWith(frag);
      } else splitWords(child);
    });
  })(mega);
  function updateWords() {
    const rect = mega.getBoundingClientRect();
    const progress = REDUCED ? 1 : clamp((window.innerHeight * 0.82 - rect.top) / (rect.height + window.innerHeight * 0.25), 0, 1);
    const lit = Math.round(progress * words.length);
    words.forEach((w, i) => w.classList.toggle("is-on", i < lit));
  }

  // ---------------------------------------------------------------- the sideways story
  const story = $("story"), track = $("htrack"), pin = story.querySelector(".story-pin");
  const panels = [...track.children];
  let travel = 0;                                           // how far the track slides (px); 0 on phones
  const COLOR_STOPS = [[0, [40, 44, 32]], [0.38, [58, 65, 48]], [0.68, [169, 173, 154]], [1, [244, 244, 237]]];   // ink → deep teal → sea → paper
  function colorAt(p) {
    for (let i = 1; i < COLOR_STOPS.length; i++) {
      const [p0, c0] = COLOR_STOPS[i - 1], [p1, c1] = COLOR_STOPS[i];
      if (p <= p1) { const t = (p - p0) / (p1 - p0); return c0.map((v, k) => Math.round(v + (c1[k] - v) * t)); }
    }
    return COLOR_STOPS[COLOR_STOPS.length - 1][1];
  }
  function layoutStory() {
    if (!isWide()) {
      travel = 0;
      story.style.height = ""; track.style.transform = "";
      story.style.removeProperty("--story-bg"); story.style.removeProperty("--story-fg");
      return;
    }
    travel = track.scrollWidth - window.innerWidth;
    story.style.height = (window.innerHeight + travel) + "px";   // scrolling this far down slides the track fully sideways
  }
  function updateStory() {
    if (!travel) return;
    const p = clamp(-story.getBoundingClientRect().top / travel, 0, 1);
    track.style.transform = `translate3d(${(-p * travel).toFixed(1)}px, 0, 0)`;
    const [r, g, b] = colorAt(p);
    story.style.setProperty("--story-bg", `rgb(${r}, ${g}, ${b})`);
    story.style.setProperty("--story-fg", p > 0.6 ? "#1b1e14" : "#f4f4ed");
    const stop = clamp(Math.round(p * (panels.length - 1)), 0, panels.length - 1);
    $("hud-num").textContent = "0" + stop;
    $("hud-fill").style.width = (p * 100).toFixed(1) + "%";
  }
  // Keyboard focus moving into an off-screen stop must scroll the page there (not shove the pinned strip sideways)
  pin.addEventListener("scroll", () => { pin.scrollLeft = 0; pin.scrollTop = 0; });
  track.addEventListener("focusin", (e) => {
    if (!travel) return;
    const panel = e.target.closest(".panel");
    if (!panel) return;
    const target = story.offsetTop + panel.offsetLeft;
    if (Math.abs(window.scrollY - target) > window.innerWidth * 0.5) window.scrollTo({ top: target, behavior: "instant" });
  });

  // ---------------------------------------------------------------- fit to screen
  // On wide screens each stop and the experiment shrink (if needed) to fit one screen, so nothing is cut off.
  const fitted = [...document.querySelectorAll(".fit")];
  function fitAll() {
    let changed = false;
    fitted.forEach((el) => {
      let value = "";
      if (isWide()) {
        const parent = el.parentElement, cs = getComputedStyle(parent);
        const availH = (document.fullscreenElement ? window.innerHeight : parent.clientHeight) - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        const availW = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const scale = clamp(Math.min(availH / el.offsetHeight, availW / el.offsetWidth), 0.5, 1.3);   // shrink on laptops, grow on big screens
        const shift = Math.max(0, (availH - el.offsetHeight * scale) / 2);      // centre vertically in the space left over
        value = `translateY(${shift.toFixed(1)}px) scale(${scale.toFixed(4)})`;
      }
      if (el.style.transform !== value) { el.style.transform = value; changed = true; }
    });
    return changed;
  }
  let fitQueued = false;
  const refit = new ResizeObserver(() => {                  // content height changed (e.g. a longer result message)
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(() => { fitQueued = false; if (fitAll()) demo.redraw(); });
  });
  fitted.forEach((el) => refit.observe(el));

  // ---------------------------------------------------------------- navigation
  function topOf(id) {
    const el = $(id);
    if (!el) return null;
    if (travel && el.classList.contains("panel")) return story.offsetTop + el.offsetLeft;   // a stop inside the sideways story
    return el.getBoundingClientRect().top + window.scrollY;
  }
  function goTo(id, instant) {
    const top = topOf(id);
    if (top === null) return;
    window.scrollTo({ top, behavior: instant || REDUCED ? "instant" : "smooth" });   // "instant" ignores the CSS smooth-scroll setting
  }
  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute("href").slice(1);
    if (!$(id)) return;
    e.preventDefault();
    if (menu.open) menu.close();
    goTo(id);
    history.replaceState(null, "", "#" + id);
  });

  // ---------------------------------------------------------------- full-screen menu
  const menu = $("menu"), menuBtn = $("menu-btn");
  const PREVIEWS = { fig02: "fig02_loss_surface_3d.png", fig12: "fig12_headline_112_vs_113.png", fig03: "fig03_contours_eigenvectors.png",
    fig04: "fig04_gd_paths.png", fig06: "fig06_stability_factor.png", fig05: "fig05_loss_vs_iteration.png" };
  menuBtn.setAttribute("aria-expanded", "false");
  menuBtn.addEventListener("click", () => { menu.showModal(); menuBtn.setAttribute("aria-expanded", "true"); });
  $("menu-close").addEventListener("click", () => menu.close());
  menu.addEventListener("close", () => menuBtn.setAttribute("aria-expanded", "false"));
  menu.querySelectorAll("[data-preview]").forEach((a) => {
    const show = () => { $("menu-preview-img").src = "figures/" + PREVIEWS[a.dataset.preview]; };
    a.addEventListener("mouseenter", show); a.addEventListener("focus", show);
  });

  // ---------------------------------------------------------------- reveal on scroll
  const revealTargets = document.querySelectorAll(".statement .eyebrow, .statement-foot, .gallery-head, .gallery-grid .fig-thumb, " +
    ".stats h2, .stat, .runs-fan h2, .fan, .fan-note, .footer-card > .mega, .footer-cols, .split-half > *");
  if (!REDUCED && "IntersectionObserver" in window) {
    const reveal = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      reveal.unobserve(el);
      el.classList.add("is-in");
      setTimeout(() => { el.classList.remove("reveal", "is-in"); el.style.transitionDelay = ""; }, 1300);   // hand transitions back to the element
    }), { threshold: 0.12 });
    revealTargets.forEach((el, i) => {
      el.classList.add("reveal");
      if (el.matches(".fig-thumb, .stat")) el.style.transitionDelay = (i % 4) * 80 + "ms";
      reveal.observe(el);
    });
  }

  // ---------------------------------------------------------------- the experiment wakes up when it is on screen
  new IntersectionObserver((entries) => demo.setActive(entries[0].isIntersecting),
    { rootMargin: "-45% 0px -45% 0px" }).observe($("demo"));   // "on screen" = covers the middle of the window

  // ---------------------------------------------------------------- the numbers count up
  const run = (eta) => R.gd_runs.find((r) => Math.abs(r.eta - eta) < 1e-9);
  const COUNTS = { eta_crit: R.eta_crit, steps_112: run(1.12).steps, steps_113: run(1.13).steps, kappa: R.condition_number };
  const counters = [...document.querySelectorAll("[data-count]")];
  const showCount = (el, value) => {
    const d = Number(el.dataset.decimals);
    el.textContent = d ? value.toFixed(d) : fmtInt(Math.round(value));
  };
  counters.forEach((el) => showCount(el, COUNTS[el.dataset.count]));
  if (!REDUCED) {
    new IntersectionObserver((entries, observer) => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      const start = performance.now(), duration = 1300;
      (function tick(now) {
        const t = clamp((now - start) / duration, 0, 1), eased = 1 - Math.pow(1 - t, 3);
        counters.forEach((el) => showCount(el, COUNTS[el.dataset.count] * (t < 1 ? eased : 1)));
        if (t < 1) requestAnimationFrame(tick);
      })(start);
    }, { threshold: 0.4 }).observe(document.querySelector(".stat-row"));
  }

  // ---------------------------------------------------------------- seven runs as a fan of cards
  const fan = $("fan"), mid = (R.gd_runs.length - 1) / 2;
  R.gd_runs.forEach((r, i) => {
    const ok = r.outcome === "converged";
    const card = document.createElement("button");
    card.className = "run-card " + (ok ? "run-ok" : "run-bad");
    card.style.setProperty("--r", ((i - mid) * 6).toFixed(1) + "deg");
    card.style.setProperty("--y", (Math.pow(i - mid, 2) * 5).toFixed(0) + "px");
    card.setAttribute("aria-label", `Watch η = ${r.eta.toFixed(2)}: ${r.outcome} at step ${fmtInt(r.steps)}`);
    card.innerHTML = `<span class="run-top">${ok ? "Converged" : "Exploded"}</span>` +
      `<span class="run-eta"><small>learning rate</small>η = ${r.eta.toFixed(2)}</span>` +
      `<span class="run-steps">${fmtInt(r.steps)}</span><span class="run-foot">steps<br>factor ${r.factor.toFixed(4)}</span>`;
    card.addEventListener("click", () => { demo.setEta(r.eta); goTo("demo"); });
    fan.appendChild(card);
  });

  // ---------------------------------------------------------------- scroll loop & layout
  const bar = $("scroll-bar");
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      updateStory(); updateWords();
      const max = root.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleY(${max > 0 ? clamp(window.scrollY / max, 0, 1) : 0})`;
    });
  }
  function layout() {
    fitAll(); layoutStory(); updateStory(); updateWords();
    demo.redraw();
  }
  let resizeTimer = null;
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 140); });
  document.addEventListener("fullscreenchange", () => setTimeout(layout, 80));

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  layout();
  window.addEventListener("load", () => {
    layout();
    const id = location.hash.slice(1);
    if (id && $(id)) goTo(id, true); else window.scrollTo({ top: 0, behavior: "instant" });
    onScroll();
  });

  window.__story = { goTo, skipIntro, layout, isWide };   // goTo is also used by app.js; the rest is for automated checks
})();
