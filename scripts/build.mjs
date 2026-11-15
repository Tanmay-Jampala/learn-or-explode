// Bundles src/ into one IIFE script and one stylesheet (no ES modules, no fetch at runtime), so
// index.html works from GitHub Pages, a local server and file:// alike. Copies library licences to vendor/.
import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const common = { bundle: true, minify: true, logLevel: "warning", legalComments: "none" };
await build({ ...common, entryPoints: { app: "src/main.js" }, outdir: "dist", format: "iife", target: "es2020" });
await build({ ...common, entryPoints: { app: "src/styles/main.css" }, outdir: "dist",
  external: ["contours-*.svg"], loader: { ".woff2": "file", ".woff": "file", ".ttf": "file" }, assetNames: "assets/[name]-[hash]" });

mkdirSync("vendor/licenses", { recursive: true });
for (const [pkg, file] of [["three", "LICENSE"], ["gsap", "README.md"], ["lenis", "LICENSE"], ["katex", "LICENSE"],
  ["@fontsource-variable/mona-sans", "LICENSE"], ["@fontsource/instrument-serif", "LICENSE"]]) {
  try {
    cpSync(`node_modules/${pkg}/${file}`, `vendor/licenses/${pkg.replace(/[@/]/g, "_")}-${file}`);
  } catch {
    console.warn(`build: no ${file} in ${pkg}`);
  }
}
console.log("build: dist/app.js and dist/app.css written");
