// Hero: the real loss surface L(w) as a terraced island, rendered twice with Three.js.
// Scene A: η = 1.00 glides to w*. Scene B (seen through a cursor-following lens): η = 1.13 zig-zags outward.
// Both go to render targets; a mask shader mixes them inside a soft circle. Without WebGL, 2D canvases + a CSS mask.
import * as THREE from "three";
import { W_STAR, L_STAR, COLORS as C, loss, fullRun, dist, fitCanvas, makeView, drawContours, drawPath, drawGoal, drawStart } from "./lib/maths.js";
import { REDUCED } from "./motion.js";

const $ = (id) => document.getElementById(id);
const SPAN = 3.4, TERRACE = 0.3, HEIGHT = 0.42, SEA = -0.5;

// ---------------------------------------------------------------- terrain
const heightAt = (x, z) => {
  if (Math.hypot(x, z) > SPAN * 0.98) return SEA;
  const s = Math.sqrt(Math.max(0, loss([W_STAR[0] + x, W_STAR[1] - z]) - L_STAR));
  return Math.floor(s / TERRACE) * TERRACE * HEIGHT;
};
function terrain(palette) {
  const geo = new THREE.PlaneGeometry(SPAN * 2, SPAN * 2, 130, 130).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = geo.attributes.position, colors = [], col = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {                // one height level per triangle → flat terraces
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const ys = [0, 1, 2].map((k) => heightAt(pos.getX(i + k), pos.getZ(i + k)));
    ys.forEach((y, k) => pos.setY(i + k, y));
    const outside = ys.filter((y) => y <= SEA).length;
    const level = Math.round(heightAt(cx, cz) / (TERRACE * HEIGHT));
    if (outside > 0) col.set(palette.wall);                          // the island's cut edge: one solid colour
    else col.set(palette.levels[Math.max(0, Math.min(level, palette.levels.length - 1))]);
    for (let k = 0; k < 3; k++) colors.push(col.r, col.g, col.b);
    if (outside === 3) for (let k = 0; k < 3; k++) pos.setY(i + k, NaN);   // sea: removed below
  }
  // keep only the island's triangles (no square sea plate around it)
  const keep = [], keepCol = [], p = pos.array;
  for (let i = 0; i < p.length; i += 9) if (!Number.isNaN(p[i + 1])) for (let k = 0; k < 9; k++) { keep.push(p[i + k]); keepCol.push(colors[i + k]); }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(keep, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(keepCol, 3));
  geo.deleteAttribute("uv"); geo.deleteAttribute("normal");
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
}
const to3 = (w) => { const x = w[0] - W_STAR[0], z = -(w[1] - W_STAR[1]); return new THREE.Vector3(x, Math.max(heightAt(x, z), 0) + 0.05, z); };
// The path as two instanced meshes (one draw call for all segments, one for all dots).
function pathMesh(points, color) {
  const group = new THREE.Group(), v = points.map(to3), n = v.length - 1;
  const mat = new THREE.MeshBasicMaterial({ color, depthTest: false });
  const segs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 6), mat, Math.max(n, 1));
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 10, 8), mat, v.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  for (let i = 1; i < v.length; i++) {
    const a = v[i - 1], b = v[i], dir = b.clone().sub(a), len = dir.length();
    q.setFromUnitVectors(up, dir.normalize());
    segs.setMatrixAt(i - 1, m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, len, 1)));
  }
  v.forEach((p, i) => dots.setMatrixAt(i, m.compose(p, new THREE.Quaternion(), one)));
  segs.count = n; segs.renderOrder = 10; dots.renderOrder = 11;
  group.add(segs, dots);
  return group;
}
function scene(palette, eta, steps, pathColor) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(palette.bg);
  s.add(new THREE.HemisphereLight(0xffffff, palette.ground, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-3, 6, 4); s.add(sun);
  const island = new THREE.Group();
  island.add(terrain(palette));
  const { path } = fullRun(eta, steps);
  island.add(pathMesh(path.filter((w) => dist(w, W_STAR) < SPAN * 0.97), pathColor));
  const flag = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 12), new THREE.MeshBasicMaterial({ color: C.ink }));
  flag.position.copy(to3(W_STAR)).add(new THREE.Vector3(0, 0.16, 0)); island.add(flag);
  s.add(island);
  return { scene: s, island };
}
export const PALETTE_LEARN = { bg: C.paper, wall: "#33382A", ground: 0xcfcfbf,
  levels: ["#F7F6EE", "#E6E8C8", "#CDD49A", "#AEB86A", "#8E9A4C", "#6E793A", "#545D2E", "#3F4627", "#33382A", "#2B3023"] };
export const PALETTE_EXPLODE = { bg: C.olive, wall: "#15170F", ground: 0x2a2018,
  levels: ["#FBE3D6", "#F4BFA4", "#EA9A74", "#E0542A", "#B8441F", "#8E3818", "#6B2E16", "#4F2614", "#3B2013", "#2E1B12"] };

// ---------------------------------------------------------------- lens motion (shared by WebGL and fallback)
function lensController(stage, lockBtn) {
  const lens = { x: 0, y: 0, tx: 0, ty: 0, locked: false, drift: true, lastTap: 0 };
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const centre = () => { const r = stage.getBoundingClientRect(); return [r.width * 0.62, r.height * 0.52]; };
  [lens.x, lens.y] = centre(); [lens.tx, lens.ty] = [lens.x, lens.y];
  stage.closest("section").addEventListener("pointermove", (e) => {
    if (lens.locked || e.pointerType === "touch") return;
    const r = stage.getBoundingClientRect(); lens.tx = e.clientX - r.left; lens.ty = e.clientY - r.top; lens.drift = false;
  });
  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || lens.locked) return;
    const r = stage.getBoundingClientRect(); lens.tx = e.clientX - r.left; lens.ty = e.clientY - r.top; lens.lastTap = performance.now();
  });
  lockBtn.addEventListener("click", () => {
    lens.locked = !lens.locked; lockBtn.setAttribute("aria-pressed", String(lens.locked));
    lockBtn.querySelector(".lock-label").textContent = lens.locked ? "Locked · click to free" : "Click to lock";
  });
  lens.update = (t) => {
    if (!lens.locked && (coarse || lens.drift) && performance.now() - lens.lastTap > 4000) {   // drift on its own
      const [cx, cy] = centre(), r = stage.getBoundingClientRect();
      lens.tx = cx + Math.sin(t * 0.00045) * r.width * 0.16; lens.ty = cy + Math.sin(t * 0.0007) * r.height * 0.14;
    }
    lens.x += (lens.tx - lens.x) * 0.1; lens.y += (lens.ty - lens.y) * 0.1;
  };
  lens.radius = () => Math.min(stage.clientWidth, stage.clientHeight) * (coarse ? 0.26 : 0.22);
  return lens;
}

// ---------------------------------------------------------------- WebGL hero
export function initHero() {
  const stage = $("hero-stage"), canvas = $("hero-canvas"), lock = $("lock-btn");
  const lens = lensController(stage, lock);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" }); }
  catch { return fallbackHero(stage, lens); }
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  const A = scene(PALETTE_LEARN, 1.0, 60, C.ink), B = scene(PALETTE_EXPLODE, 1.13, 220, C.lime);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const rtA = new THREE.WebGLRenderTarget(1, 1, { samples: 4 }), rtB = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { tA: { value: rtA.texture }, tB: { value: rtB.texture }, uLens: { value: new THREE.Vector2() }, uR: { value: 150 },
      uRes: { value: new THREE.Vector2(1, 1) }, uRing: { value: new THREE.Color(C.lime) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: `uniform sampler2D tA, tB; uniform vec2 uLens, uRes; uniform float uR; uniform vec3 uRing; varying vec2 vUv;
      void main(){
        vec2 p = vUv * uRes; float d = distance(p, uLens);
        float m = 1.0 - smoothstep(uR - 14.0, uR, d);                      // soft feathered lens edge
        vec3 c = mix(texture2D(tA, vUv).rgb, texture2D(tB, vUv).rgb, m);
        float ring = 1.0 - smoothstep(0.0, 2.2, abs(d - uR + 7.0));
        gl_FragColor = vec4(mix(c, uRing, ring * 0.9), 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  const post = new THREE.Scene(); post.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    rtA.setSize(w * pixelRatio, h * pixelRatio); rtB.setSize(w * pixelRatio, h * pixelRatio);
    camera.aspect = w / h;
    const fit = w / h < 1 ? 19 : 14;                        // stand further back on portrait screens
    camera.position.set(0, fit * 0.7, fit * 0.62); camera.lookAt(0, 1.9, -1.2); camera.updateProjectionMatrix();
    quad.material.uniforms.uRes.value.set(w * pixelRatio, h * pixelRatio);
  }
  resize(); window.addEventListener("resize", resize);

  let visible = true, frames = 0, slow = 0, last = 0;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) requestAnimationFrame(loop); }).observe(stage);
  window.addEventListener("viewchange", () => requestAnimationFrame(loop));
  function loop(t) {
    if (!visible || document.hidden || $("home-main").hidden) return;
    const spin = REDUCED ? 0.5 : 0.5 + Math.sin(t * 0.00012) * 0.18;
    A.island.rotation.y = B.island.rotation.y = spin;
    lens.update(t);
    const u = quad.material.uniforms;
    u.uLens.value.set(lens.x * pixelRatio, (stage.clientHeight - lens.y) * pixelRatio); u.uR.value = lens.radius() * pixelRatio;
    renderer.setRenderTarget(rtA); renderer.render(A.scene, camera);
    renderer.setRenderTarget(rtB); renderer.render(B.scene, camera);
    renderer.setRenderTarget(null); renderer.render(post, postCam);
    // Simple quality tier: if frames are slow, lower the pixel ratio.
    if (last) { frames++; if (t - last > 24) slow++; }
    last = t;
    if (frames === 90) { if (slow > 30 && pixelRatio > 0.75) { pixelRatio = Math.max(0.75, pixelRatio - 0.5); renderer.setPixelRatio(pixelRatio); resize(); } frames = slow = 0; }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) requestAnimationFrame(loop); });
  initFooterIsland();
}

// ---------------------------------------------------------------- no WebGL: two 2D maps and a CSS mask
function fallbackHero(stage, lens) {
  $("hero-canvas").hidden = true; $("hero-fallback").hidden = false;
  const draw = () => {
    [["hero-fallback-a", false], ["hero-fallback-b", true]].forEach(([id, dark]) => {
      const { ctx, w, h } = fitCanvas($(id)), v = makeView(W_STAR[0], W_STAR[1], 4 * Math.max(1, w / h), 4 * Math.max(1, h / w));
      drawContours(ctx, v, w, h, { fill: dark ? C.olive : C.paper, stroke: dark ? C.paper : C.ink, alpha: 0.28 });
      drawPath(ctx, v, w, h, fullRun(dark ? 1.13 : 1.0, dark ? 160 : 60).path, { color: dark ? C.lime : C.ink, width: 2, dots: 2.5 });
      drawStart(ctx, v, w, h); drawGoal(ctx, v, w, h, C.lime, dark ? C.paper : C.ink);
    });
  };
  draw(); window.addEventListener("resize", draw);
  const loop = (t) => { lens.update(t); stage.style.setProperty("--lens-x", `${lens.x}px`); stage.style.setProperty("--lens-y", `${lens.y}px`); stage.style.setProperty("--lens-r", `${lens.radius()}px`); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- small rotating island in the footer
function initFooterIsland() {
  const canvas = $("footer-island");
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { canvas.hidden = true; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const { scene: s, island } = scene({ ...PALETTE_LEARN, bg: C.olive }, 1.0, 60, C.ink);
  s.background = null;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100); cam.position.set(0, 9, 9); cam.lookAt(0, -0.4, 0);
  const size = () => { const w = canvas.clientWidth; renderer.setSize(w, w, false); };
  size(); window.addEventListener("resize", size);
  let on = false;
  new IntersectionObserver(([e]) => { on = e.isIntersecting; if (on) requestAnimationFrame(spin); }).observe(canvas);
  function spin(t) { if (!on) return; island.rotation.y = REDUCED ? 0.5 : t * 0.00025; renderer.render(s, cam); if (!REDUCED) requestAnimationFrame(spin); }
}
