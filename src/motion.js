// Smooth scrolling and scroll-driven animation. With prefers-reduced-motion nothing here runs:
// no smooth scroll, no parallax, no draw-ins, and all content stays visible (the CSS default).
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

export const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initMotion() {
  if (REDUCED) return { scrollTo: (el) => el.scrollIntoView({ block: "start" }) };
  gsap.registerPlugin(ScrollTrigger, SplitText);

  const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  window.addEventListener("viewchange", (e) => {
    lenis.scrollTo(0, { immediate: true });
    if (e.detail === "demo") lenis.stop(); else lenis.start();
    requestAnimationFrame(() => ScrollTrigger.refresh());
  });

  // Statement: words light up one by one as it scrolls through.
  const split = SplitText.create("#statement-text", { type: "words", wordsClass: "word" });
  gsap.fromTo(split.words, { opacity: 0.12 }, { opacity: 1, stagger: 0.08, ease: "none",
    scrollTrigger: { trigger: "#statement", start: "top 65%", end: "bottom 75%", scrub: true } });

  // Hand-drawn lime strokes draw themselves in.
  gsap.utils.toArray(".scribble").forEach((svg) => {
    gsap.fromTo(svg.querySelectorAll("path"), { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: "none",
      scrollTrigger: { trigger: svg, start: "top 88%", end: "top 45%", scrub: 0.6 } });
  });
  gsap.fromTo(".script-word text", { strokeDashoffset: 2200, fillOpacity: 0 }, { strokeDashoffset: 0, fillOpacity: 1, ease: "none",
    scrollTrigger: { trigger: ".script-word", start: "top 85%", end: "center 45%", scrub: 0.6 } });

  // Scattered figures drift at their own speeds.
  gsap.utils.toArray(".fig-card").forEach((card) => {
    gsap.fromTo(card, { y: 60 * Number(card.dataset.speed) }, { y: -60 * Number(card.dataset.speed), ease: "none",
      scrollTrigger: { trigger: card, start: "top bottom", end: "bottom top", scrub: true } });
  });

  // Big headings and cards ease up into place once.
  gsap.utils.toArray(".display, .lede, .quote, .le-col, .derivation li, .stab-chart, .footer-title").forEach((el) => {
    gsap.from(el, { y: 50, opacity: 0, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 88%", once: true } });
  });
  gsap.from(".run-card", { y: 80, opacity: 0, duration: 1, stagger: 0.07, ease: "expo.out", scrollTrigger: { trigger: "#hall-grid", start: "top 80%", once: true } });
  gsap.from(".member", { y: 120, rotate: 0, opacity: 0, duration: 1.2, stagger: 0.06, ease: "expo.out", scrollTrigger: { trigger: "#fan", start: "top 85%", once: true } });
  gsap.fromTo(".bleed-left", { xPercent: -12 }, { xPercent: 6, ease: "none", scrollTrigger: { trigger: "#learn-explode", start: "top bottom", end: "bottom top", scrub: true } });
  gsap.fromTo(".bleed-right", { xPercent: 12 }, { xPercent: -6, ease: "none", scrollTrigger: { trigger: "#learn-explode", start: "top bottom", end: "bottom top", scrub: true } });

  window.addEventListener("load", () => ScrollTrigger.refresh());
  return { scrollTo: (el) => lenis.scrollTo(el, { duration: 1.4 }) };
}
