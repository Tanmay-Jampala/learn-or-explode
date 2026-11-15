// Words for the site. Every number is read from results.json (via maths.js), never typed by hand.
import { R, fmt, fmtInt, runFor, LAM_MAX, LAM_MIN, ETA_CRIT } from "../lib/maths.js";

const f4 = (x) => fmt(x, 4);
const units = R.w_original_units;

/** The 14 notebook figures: gallery chip, drawer title, explanation and equation (KaTeX). */
export const FIGURES = [
  { id: "fig01", module: "I", chip: `DATA · ${fmtInt(R.n_rows)} HOMES`, title: "Price against area",
    text: `${fmtInt(R.n_rows)} Bengaluru listings, coloured by bedrooms. Area, BHK and price are standardised (mean 0, standard deviation 1), so the model needs only two weights and no intercept.`,
    eq: String.raw`z = \frac{x - \bar x}{\sigma}, \qquad \hat t = w_1 z_{\text{sqft}} + w_2 z_{\text{bhk}}` },
  { id: "fig14", module: "I", chip: `CLEANING · 13,320 → ${fmtInt(R.n_rows)}`, title: "Cleaning the data",
    text: "Missing values, non-numeric areas, plot listings, unusual bedroom counts, price and area outliers, and duplicates are removed step by step. Every row count is reproduced in the notebook appendix.",
    eq: String.raw`13{,}320 \;\to\; ${R.n_rows}\ \text{rows}` },
  { id: "fig09", module: "I", chip: `MODULE I · GAUSS-SEIDEL · ${R.gauss_seidel.iterations} ITERATIONS`, title: "Gauss-Seidel against Jacobi",
    text: `Setting the slope to zero gives the normal equations Aw = b. Gauss elimination solves them directly; Gauss-Seidel uses each new value at once and needs ${R.gauss_seidel.iterations} iterations to reach 10⁻⁶, against ${R.jacobi_iterations} for Jacobi. A is diagonally dominant, so both converge.`,
    eq: String.raw`w_1^{(k+1)} = b_1 - \rho\, w_2^{(k)}, \quad w_2^{(k+1)} = b_2 - \rho\, w_1^{(k+1)}` },
  { id: "fig02", module: "III", chip: "MODULE III · THE LOSS BOWL", title: "The loss surface",
    text: `The loss is a bowl with one lowest point, w* = (${f4(R.w_star[0])}, ${f4(R.w_star[1])}). The second-derivative test confirms it: rt − s² = ${f4(R.hessian_test.rt_minus_s2)} > 0 and r > 0.`,
    eq: String.raw`L(w) = \frac{1}{2n}\sum_i (z_i\cdot w - t_i)^2, \qquad rt - s^2 = 1 - \rho^2 > 0` },
  { id: "fig03", module: "III", chip: `MODULE III · κ = ${fmt(R.condition_number, 3)}`, title: "Eigenvectors of the Hessian",
    text: `The Hessian is A. Its eigenvalues are 1 ± ρ: ${f4(LAM_MAX)} along the steep direction (1, 1)/√2 and ${f4(LAM_MIN)} along the flat direction (−1, 1)/√2. The valley is ${fmt(R.condition_number, 1)} times steeper one way than the other.`,
    eq: String.raw`\det(A - \lambda I) = (1-\lambda)^2 - \rho^2 = 0 \;\Rightarrow\; \lambda = 1 \pm \rho` },
  { id: "fig13", module: "III", chip: `FIT · R² = ${fmt(R.r_squared, 3)}`, title: "Predicted against actual price",
    text: `Back in rupees, each extra square foot adds about ₹${fmtInt(units.lakhs_per_sqft * 1e5)}. At the same area an extra bedroom costs ${fmt(Math.abs(units.lakhs_per_bhk), 1)} lakh less, because the rooms get smaller. The fit explains ${Math.round(R.r_squared * 100)}% of the variation in price.`,
    eq: String.raw`R^2 = 1 - \frac{\sum (t_i - \hat t_i)^2}{\sum (t_i - \bar t)^2} = ${fmt(R.r_squared, 3)}` },
  { id: "fig10", module: "III", chip: `MODULE III · LAGRANGE · μ = ${f4(R.lagrange.mu)}`, title: "Training with a weight budget",
    text: `Force the weights onto a circle of radius s = ${R.lagrange.s}. The best point is where a loss contour touches the circle, w_c = (${f4(R.lagrange.w_c[0])}, ${f4(R.lagrange.w_c[1])}), and there ∇L = −μ·w_c. This is ridge regression.`,
    eq: String.raw`\nabla L + \mu w = 0 \;\Rightarrow\; (A + \mu I)\,w = b, \quad \|w\| = s` },
  { id: "fig07", module: "II", chip: "MODULE II · GRADIENT DESCENT = EULER", title: "Training is an ODE",
    text: "With tiny steps, training follows the linear system w′ = −A(w − w*). Gradient descent is Euler's method on it, with step h = η: small steps track the exact curve, large ones overshoot it.",
    eq: String.raw`w' = -A(w - w^*), \qquad w_{k+1} = w_k - \eta\,\nabla L(w_k)` },
  { id: "fig08", module: "II", chip: `MODULE II · τ = ${f4(R.time_constants[0])} / ${f4(R.time_constants[1])}`, title: "Two modes, two speeds",
    text: `Diagonalising A splits the flow into two independent decays. The flat mode is slow (time constant ${f4(R.time_constants[0])}); the steep mode is fast (${f4(R.time_constants[1])}). Both eigenvalues of −A are negative, so the flow is stable.`,
    eq: String.raw`z_i(t) = z_i(0)\, e^{-\lambda_i t}, \qquad \tau_i = 1/\lambda_i` },
  { id: "fig11", module: "II", chip: `MODULE II · γ = ${f4(R.momentum_critical_gamma[0])}`, title: "Momentum as a damped oscillator",
    text: `Adding momentum turns each mode into a second-order ODE. Below γ = 2√λ it oscillates, above it creeps; for the slow mode the critical value is ${f4(R.momentum_critical_gamma[0])}.`,
    eq: String.raw`z'' + \gamma z' + \lambda z = 0, \qquad \gamma_{\text{crit}} = 2\sqrt{\lambda}` },
  { id: "fig04", module: "II", chip: "PATHS · η = 0.10 TO 1.15", title: "Four learning rates",
    text: "From the same start, a small rate walks straight down the valley, the optimal rate zig-zags but lands fast, a large one bounces for hundreds of steps, and one past the limit flies off.",
    eq: String.raw`w_{k+1} = w_k - \eta\,(A w_k - b)` },
  { id: "fig05", module: "II", chip: "LOSS GAP · 7 RUNS", title: "Loss against step",
    text: "On a log scale every converging run is a straight line down and every exploding run a straight line up. The slope is the log of the stability factor.",
    eq: String.raw`L(w_k) - L^* \propto \max_i |1 - \eta\lambda_i|^{2k}` },
  { id: "fig06", module: "I+II", chip: `THE LIMIT · η = ${fmt(ETA_CRIT, 3)}`, title: "The stability factor",
    text: `Each step multiplies every eigen-coordinate by 1 − ηλ. Training converges only while the largest |1 − ηλ| stays below 1, so η must stay below 2/λmax = ${fmt(ETA_CRIT, 3)}. The best rate, 2/(λmax + λmin) = ${fmt(R.eta_opt, 2)}, shrinks the error by ${f4(R.rho)} a step.`,
    eq: String.raw`|1 - \eta\lambda_i| < 1 \;\Longleftrightarrow\; \eta < \frac{2}{\lambda_{\max}} = ${fmt(ETA_CRIT, 3)}` },
  { id: "fig12", module: "I+II", chip: `1.12 · ${fmtInt(runFor(1.12).steps)} STEPS · 1.13 · BOOM`, title: "Either side of the limit",
    text: `η = 1.12 has factor ${f4(runFor(1.12).factor)} and converges in ${fmtInt(runFor(1.12).steps)} steps. η = 1.13 has factor ${f4(runFor(1.13).factor)} and passes ‖w‖ = 10⁶ at step ${fmtInt(runFor(1.13).steps)}. The eigenvalues predicted this before either run.`,
    eq: String.raw`|1 - 1.12\,\lambda_{\max}| = ${f4(runFor(1.12).factor)} < 1 < ${f4(runFor(1.13).factor)} = |1 - 1.13\,\lambda_{\max}|` },
];

/** The four-step derivation in THE LIMIT section. */
export const DERIVATION = [
  String.raw`w_{k+1} - w^* = (I - \eta A)(w_k - w^*)`,
  String.raw`z^{(k+1)}_i = (1 - \eta\lambda_i)\, z^{(k)}_i \;\Rightarrow\; z^{(k)}_i = (1 - \eta\lambda_i)^k z^{(0)}_i`,
  String.raw`z^{(k)} \to 0 \iff |1 - \eta\lambda_i| < 1 \ \forall i \iff 0 < \eta < 2/\lambda_i`,
  String.raw`\eta < \frac{2}{\lambda_{\max}} = \frac{2}{${f4(LAM_MAX)}} = ${fmt(ETA_CRIT, 3)}`,
];

/** Team. ASSUMPTION (see DECISIONS.md): each member presents the notebook part in this order. */
export const TEAM = [
  { name: "Tanmay", part: "Part 1 · Data & the system of equations", module: "I" },
  { name: "Aaditya", part: "Part 2 · Gauss elimination & Gauss-Seidel", module: "I" },
  { name: "Yasho Keerthi", part: "Part 3 · The loss surface", module: "III" },
  { name: "Vignasree", part: "Part 4 · Lagrange multipliers", module: "III" },
  { name: "Ganesh", part: "Part 5 · Training as an ODE", module: "II" },
  { name: "Ayush", part: "Part 6 · The learning-rate limit", module: "I+II" },
];

export const TOPICS = ["Rank", "Gauss elimination", "Gauss-Seidel", "Partial derivatives", "Eigenvalues", "Lagrange multipliers",
  "Systems of ODEs", "Euler's method", "Stability", "Python", "NumPy", "Matplotlib"];

export const KEY_NUMBERS = [`η_crit = ${fmt(ETA_CRIT, 3)}`, `λmax = ${f4(LAM_MAX)}`, `λmin = ${f4(LAM_MIN)}`, `ρ = ${f4(R.rho)}`,
  `κ = ${fmt(R.condition_number, 4)}`, `1.12 → ${fmtInt(runFor(1.12).steps)} steps`, `1.13 → boom at ${fmtInt(runFor(1.13).steps)}`,
  `w* = (${f4(R.w_star[0])}, ${f4(R.w_star[1])})`, `R² = ${fmt(R.r_squared, 3)}`];

export const REPO_URL = "https://github.com/Tanmay-Jampala/learn-or-explode";
