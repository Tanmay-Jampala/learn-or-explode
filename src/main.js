// Entry point, bundled by esbuild into dist/app.js (one IIFE: works over file:// and offline).
import { initDemo } from "./demo.js";
import { initHome, setScroller } from "./home.js";
import { initMotion } from "./motion.js";
import { initHero } from "./hero.js";
import { protectGreek } from "./lib/greek.js";

initDemo();
initHome();
protectGreek(document.body);
setScroller(initMotion().scrollTo);
try {
  initHero();
} catch (err) {
  console.info("Hero 3D view unavailable:", err.message);   // the home page still works without it
}
