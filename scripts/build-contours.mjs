// Contour-line texture made from our own loss function L(w): marching squares over sqrt(L − L*),
// whose level sets are the rings of the bowl, plus a little smooth noise so it reads like a topo map.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const R = JSON.parse(readFileSync("data/results.json", "utf8"));
const [[a, c], [, d]] = R.A, [b1, b2] = R.b;
const L = (x, y) => 0.5 * (a * x * x + 2 * c * x * y + d * y * y) - b1 * x - b2 * y + 0.5;
const W = 1600, H = 1000, NX = 200, NY = 125;

function field(i, j) {
  const x = R.w_star[0] - 9 + 18 * i / NX, y = R.w_star[1] + 5.6 - 11.2 * j / NY;
  const noise = 0.16 * Math.sin(x * 1.3 + 2 * Math.sin(y * 0.7)) + 0.11 * Math.cos(y * 1.7 - x * 0.4) + 0.06 * Math.sin(3.1 * x + 2.3 * y);
  return Math.sqrt(Math.max(0, L(x, y) - R.loss_at_w_star)) + noise;
}

const grid = Array.from({ length: NY + 1 }, (_, j) => Array.from({ length: NX + 1 }, (_, i) => field(i, j)));
const cw = W / NX, ch = H / NY, parts = [];
for (let level = 0.35; level < 7.5; level += 0.42) {
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const tl = grid[j][i], tr = grid[j][i + 1], bl = grid[j + 1][i], br = grid[j + 1][i + 1], p = [];
      if ((tl < level) !== (tr < level)) p.push([(i + (level - tl) / (tr - tl)) * cw, j * ch]);
      if ((tr < level) !== (br < level)) p.push([(i + 1) * cw, (j + (level - tr) / (br - tr)) * ch]);
      if ((bl < level) !== (br < level)) p.push([(i + (level - bl) / (br - bl)) * cw, (j + 1) * ch]);
      if ((tl < level) !== (bl < level)) p.push([i * cw, (j + (level - tl) / (bl - tl)) * ch]);
      for (let k = 0; k + 1 < p.length; k += 2) {
        parts.push(`M${p[k][0].toFixed(1)} ${p[k][1].toFixed(1)}L${p[k + 1][0].toFixed(1)} ${p[k + 1][1].toFixed(1)}`);
      }
    }
  }
}

const svg = (stroke, opacity) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
  `<path d="${parts.join("")}" fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="1.1" stroke-linecap="round"/></svg>`;
mkdirSync("dist", { recursive: true });
writeFileSync("dist/contours-pale.svg", svg("#15170F", 0.12));
writeFileSync("dist/contours-dark.svg", svg("#F2F1EA", 0.09));
console.log(`build-contours: ${parts.length} segments`);
