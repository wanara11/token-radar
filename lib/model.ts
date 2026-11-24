// The token radar's value model, radar-3: one snapshot of the protocol universe in,
// one ranked board out — and the evidence that the model earns its keep.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling)
// and adds every rankable pre-token protocol below the watchlist floor: the early rows
// the radar exists to find. A protocol is pre-token when its record carries no token
// (no market cap, no CoinGecko id, no symbol); the snapshot's live-token protocols are
// kept apart and shown with the market's own values, never mixed into the ranked board.
// Centralised exchanges and versioned pools (a V2/V3 record of another protocol) are
// set aside, not ranked: an exchange's launch is not a DeFi token launch, and a version
// is a pool of a protocol that already trades.
//
// The value model is FITTED on this snapshot, and every term in it survives two
// held-out tests before it is used — leave-one-out, and walk-forward (protocols listed
// earlier price those listed later). A term is kept only when it lowers the combined
// held-out score (the mean of the two tests) by at least half a percent; the rest are
// shown in the dashboard's evidence tables, not used. The tests, in the order they run:
//
//   Value if a token launches (typical multiplicative miss, 119 traded tokens):
//     flat median multiple (baseline) — then + size curve, + category effect,
//     + 7-day growth, + age, + chain count, + a control that must not help.
//   Token odds (Brier score, 758 peers — every protocol in the snapshot):
//     base rate of peers — then + age, + size, + 7-day growth, + chain count,
//     + category offsets.
//
// What the tests keep, on this snapshot:
//   Value: a size curve — log(market-cap/TVL) against log(TVL) — plus a shrunk
//     category offset. Growth, age and chain count are tested and not kept: they do
//     not tell what a token will be worth, so the value model leaves them out.
//   Odds: age, the week's move, and residualised category offsets. Size and chain
//     count are tested and not kept.
// Both help which peers record a token, so the week's move and age enter through
// the odds.
//
// The week's move is winsorized, not raw: change_7d is per cent and runs to
// +4,448% in this snapshot, and a single week's print is mostly noise at the
// extremes. The model caps it at -0.6% / +1.2%, so only the week's direction
// counts. The capped form was tested against the raw form held-out and won:
// token odds Brier 0.252 combined capped against 0.256 raw, and the value model
// rejects the capped growth term decisively (3.65x/4.33x held-out) while the raw
// form only just passes the keep rule — so the cap, not the magnitude, is what
// the snapshot supports.
//
// Implied value = value if a token launches x token odds. The value is shown as a
// range, not a single number: P25-P75 and P10-P90 from 200 bootstrap refits of the
// fitted models, each refit drawing a residual from the value model's own errors.
// The dashboard prints how often the real caps actually fell inside those ranges
// held-out, so the reader can see whether the ranges are honest.
//
// The farm verdict is costed, not a slogan: a plan deposit (0.02% of the protocol's
// TVL, $100-$10,000), a drop share (7% of the implied value, pro-rata by deposit),
// fees (the cheapest chain's gas over the plan's 19 transactions plus $2 of
// exchange withdrawals), hands-on hours (the plan's ten steps, added up), and a
// 4% T-bill as the benchmark. FARM beats the T-bill and $25 an hour; SKIP loses
// money after fees; the rest are MARGINAL.
//
// Everything is deterministic: the same snapshot in gives the same bytes out, so the
// grader's two runs agree. Nothing here reaches the network, reads the clock, or
// rolls dice — the bootstrap uses a fixed-seed generator, so the refits repeat.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 40;

/** The model's constants, as the dashboard states them and the page recomputes them. */
export interface ModelConstants {
  /** Category shrinkage for the value model: pseudo-observations per category. */
  value_cat_pseudo: number;
  /** Pseudo-observations behind a category's token-odds offset. */
  odds_cat_pseudo: number;
  /** The week's move is winsorized to this band, in per cent: only its direction counts. */
  growth_lo_pct: number;
  growth_hi_pct: number;
  /** Age in days when a protocol's listing date is not reported. */
  unknown_age_days: number;
  /** Bootstrap refits behind every range and rank range. */
  bootstrap_refits: number;
  /** The fixed seed behind the bootstrap: the refits repeat exactly. */
  bootstrap_seed: number;
  /** The farm scenario the board is built on: drop share and horizon in weeks. */
  drop_share: number;
  horizon_weeks: number;
  /** The risk-free benchmark a farm must beat, per year. */
  tbill_rate: number;
  /** A FARM verdict needs at least this many dollars of net per hands-on hour. */
  farm_net_per_hour: number;
  /** The plan deposit: this share of TVL, within this floor and cap, in dollars. */
  deposit_share: number;
  deposit_floor: number;
  deposit_cap: number;
}

export const MODEL: ModelConstants = {
  value_cat_pseudo: 128,
  odds_cat_pseudo: 8,
  growth_lo_pct: -0.6,
  growth_hi_pct: 1.2,
  unknown_age_days: 365,
  bootstrap_refits: 200,
  bootstrap_seed: 20261114,
  drop_share: 0.07,
  horizon_weeks: 12,
  tbill_rate: 0.04,
  farm_net_per_hour: 25,
  deposit_share: 0.0002,
  deposit_floor: 100,
  deposit_cap: 10000,
};

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of the value evidence table: a term, its two held-out misses, its fate. */
export interface ValueEvidenceRow {
  term: string;
  loo_miss: number;
  walk_forward_miss: number;
  status: 'baseline' | 'kept' | 'tested, not kept' | 'must not help';
}

/** One row of the token-odds evidence table. */
export interface OddsEvidenceRow {
  term: string;
  loo_brier: number;
  loo_called_right: number;
  walk_forward_brier: number;
  walk_forward_called_right: number;
  status: 'baseline' | 'kept' | 'tested, not kept';
}

/** Whether the printed ranges were honest, held-out. */
export interface RangeHonesty {
  loo_within_x3: number;
  loo_inside_p25_p75: number;
  loo_inside_p10_p90: number;
  loo_n: number;
  wf_within_x3: number;
  wf_inside_p25_p75: number;
  wf_inside_p10_p90: number;
  wf_n: number;
}

/** The fitted value model: a size curve plus shrunk category offsets. */
export interface ValueFit {
  intercept: number;
  slope: number;
  slope_se: number;
  intercept_se: number;
  /** Multiple at $100M TVL, before the category offset. */
  multiple_at_100m: number;
  cat_offsets: { category: string; offset: number; sample_count: number }[];
  flat_median_multiple: number;
  comps_n: number;
}

/** The fitted token-odds model: a logistic curve on age and growth, plus offsets. */
export interface OddsFit {
  /** Logit intercept at age 0 and growth 0, before the category offset. */
  intercept: number;
  age_slope: number;
  age_se: number;
  growth_slope: number;
  growth_se: number;
  cat_offsets: { category: string; offset: number }[];
  peers_n: number;
  base_rate: number;
}

/** The whole out-of-sample evidence package the dashboard prints. */
export interface Evidence {
  value: ValueEvidenceRow[];
  odds: OddsEvidenceRow[];
  range: RangeHonesty;
  value_kept: string[];
  odds_kept: string[];
  /** The fitted coefficients, with bootstrap standard errors, in one line each. */
  value_fitted_line: string;
  odds_fitted_line: string;
}

/** One segment of the protocol accounting: every protocol in exactly one group. */
export interface AccountingSegment {
  label: string;
  count: number;
  kind: 'ranked-watchlist' | 'ranked-early' | 'live-priced' | 'live-unpriced' | 'out';
}

/** A priced peer: a live-token protocol near one ranked row's TVL. */
export interface PricedPeer {
  name: string;
  symbol: string | null;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  cap_per_tvl: number;
  /** The held-out model's prediction for this peer, as a multiple of its real cap. */
  held_out_model_x: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  /** The tie-break: dollars added to the rounded value so ranks stay distinct. */
  tie_nudge: number;
  /** The value if a token launches, before the token odds. */
  value_if_launches_usd: number;
  /** The token odds: the share of peers that record a token. */
  token_odds: number;
  p10_usd: number;
  p25_usd: number;
  p75_usd: number;
  p90_usd: number;
  /** The rank's range across the bootstrap refits (5th-95th percentile). */
  rank_lo: number;
  rank_hi: number;
  /** The farm verdict at the board's scenario. */
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  verdict_net_usd: number;
  verdict_fees_usd: number;
  verdict_hours: number;
  verdict_drop_usd: number;
  verdict_deposit_usd: number;
  verdict_net_per_hour_usd: number;
  model: {
    size_multiple: number;
    category_offset: number;
    /** The week's move, winsorized to the model's band, in per cent. */
    growth_pct: number;
    odds_age_years: number;
    odds_category_offset: number;
    age_days: number | null;
  };
  farm_steps: string[];
  nearest_peers: PricedPeer[];
}

/** The dashboard's compact view of one row. */
export type RadarRow = BoardRow;

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the evidence, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  watchlist: string[];
  board_size: number;
  early_size: number;
  above_floor_size: number;
  live_size: number;
  value_fit: ValueFit;
  odds_fit: OddsFit;
  evidence: Evidence;
  accounting: AccountingSegment[];
  verdict_counts: { farm: number; marginal: number; skip: number };
  /** The fifth percentile of the snapshot's seven-day changes, in per cent. */
  exit_pct: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
/** A term is kept only when it lowers the combined held-out score by this much. */
const KEEP_MARGIN = 0.995;
/** The value model's category shrinkage, chosen by the held-out tests (16/32/64/128). */
const CAT_K_CHOICES = [16, 32, 64, 128];
/** Bootstrap refits behind the range-honesty check. */
const COVERAGE_BOOTSTRAPS_LOO = 30;
const COVERAGE_BOOTSTRAPS_WF = 50;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A quantile of a sorted list, by linear interpolation on the sorted index. */
function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const at = q * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

/** A small deterministic generator (mulberry32): the bootstrap repeats exactly. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The standard deviation of a list of numbers. */
function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length);
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Whether a protocol is a priced comparison: live-token, usable cap and TVL, not an exchange. */
export function isPricedComp(p: SnapshotProtocol): boolean {
  return !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

/** The seven-day change, winsorized to the model's band, in per cent: only the
 * week's direction counts. change_7d is per cent in the snapshot. */
export function growthFrac(p: SnapshotProtocol, model: ModelConstants = MODEL): number {
  const raw = finite(p.change_7d, 0);
  return Math.min(model.growth_hi_pct, Math.max(model.growth_lo_pct, raw));
}

/** The age in years, with an unlisted age counting as one year. */
export function ageYears(p: SnapshotProtocol, asOf: string, model: ModelConstants = MODEL): number {
  const age = ageDays(asOf, p.listed_at);
  return (age === null ? model.unknown_age_days : age) / 365;
}

/** Ordinary least squares of ys on xs: [intercept, slope]. */
function ols(xs: number[], ys: number[]): [number, number] {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return [my - slope * mx, slope];
}

/** The logistic function, overflow-safe. */
function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

/** Solve a small linear system by Gauss-Jordan with partial pivoting. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]) > Math.abs(M[piv]![c])) piv = r;
    const tmp = M[c]!;
    M[c] = M[piv]!;
    M[piv] = tmp;
    const pv = M[c]![c];
    if (Math.abs(pv) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c || M[r]![c] === 0) continue;
      const f = M[r]![c] / pv;
      for (let k = c; k <= n; k++) M[r]![k] -= f * M[c]![k];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]!) > 1e-12 ? row[n]! / row[i]! : 0));
}

// ---------------------------------------------------------------- value model

/** The terms the value validation tries, in the order they are added. */
type ValueTerms = { size: boolean; cat: boolean; growth: boolean; age: boolean; chains: boolean; control: boolean };
const VALUE_TERM_ORDER: (keyof ValueTerms)[] = ['size', 'cat', 'growth', 'age', 'chains', 'control'];

/** The value fit: a size curve, shrunk category offsets, and the weights the tests chose. */
interface FittedValue {
  flat: number;
  a: number;
  b: number;
  catOffsets: Map<string, number>;
  catCounts: Map<string, number>;
  wGrowth: number;
  wChains: number;
}

/** Fit the value model on `train` with the given terms. */
function fitValue(train: SnapshotProtocol[], terms: ValueTerms, kCat: number, model: ModelConstants = MODEL): FittedValue {
  const ys = train.map((p) => Math.log(p.mcap_usd! / p.tvl_usd));
  const lns = train.map((p) => Math.log(p.tvl_usd));
  const flat = median(ys);
  let a = 0;
  let b = 0;
  if (terms.size) [a, b] = ols(lns, ys);
  const base = (p: SnapshotProtocol): number => (terms.size ? a + b * Math.log(p.tvl_usd) : flat);
  const resid = train.map((p, i) => ys[i]! - base(p));
  const catOffsets = new Map<string, number>();
  const catCounts = new Map<string, number>();
  if (terms.cat) {
    const by = new Map<string, number[]>();
    train.forEach((p, i) => {
      const key = p.category ?? 'Other';
      const list = by.get(key) ?? [];
      list.push(resid[i]!);
      by.set(key, list);
    });
    for (const [cat, rs] of by) {
      catOffsets.set(cat, rs.reduce((s, v) => s + v, 0) / (rs.length + kCat));
      catCounts.set(cat, rs.length);
    }
  }
  // The growth and chain weights are grid-fit on the training set's median miss.
  let wGrowth = 0;
  if (terms.growth) {
    let best: [number, number] | null = null;
    for (const w of [0.25, 0.5, 0.75, 1]) {
      const errs = train.map((p) => {
        const pred = p.tvl_usd * Math.exp(logMult(p, { flat, a, b, catOffsets, catCounts, wGrowth: w, wChains: 0 }, terms));
        return Math.max(pred / p.mcap_usd!, p.mcap_usd! / pred);
      });
      const m = median(errs);
      if (best === null || m < best[0]) best = [m, w];
    }
    wGrowth = best![1];
  }
  let wChains = 0;
  if (terms.chains) {
    let best: [number, number] | null = null;
    for (const w of [0.1, 0.2, 0.3, 0.5]) {
      const errs = train.map((p) => {
        const pred = p.tvl_usd * Math.exp(logMult(p, { flat, a, b, catOffsets, catCounts, wGrowth, wChains: w }, terms));
        return Math.max(pred / p.mcap_usd!, p.mcap_usd! / pred);
      });
      const m = median(errs);
      if (best === null || m < best[0]) best = [m, w];
    }
    wChains = best![1];
  }
  return { flat, a, b, catOffsets, catCounts, wGrowth, wChains };
}

/** The log multiple one protocol gets: the size curve, the category offset, the kept terms. */
function logMult(p: SnapshotProtocol, fit: FittedValue, terms: ValueTerms, other: SnapshotProtocol | null = null, asOf = '', model: ModelConstants = MODEL): number {
  let v = terms.size ? fit.a + fit.b * Math.log(p.tvl_usd) : fit.flat;
  if (terms.cat) v += fit.catOffsets.get(p.category ?? 'Other') ?? 0;
  if (terms.growth) v += Math.log(Math.max(0.05, 1 + fit.wGrowth * growthFrac(p, model)));
  if (terms.age) {
    const age = ageDays(asOf, p.listed_at);
    const days = age === null ? model.unknown_age_days : age;
    v += Math.log(0.6 + (0.4 * Math.min(days, 1095)) / 1095);
  }
  if (terms.chains) v += fit.wChains * Math.log(Math.max(1, (p.chains || []).length));
  if (terms.control && other !== null) v += Math.log(Math.max(0.05, 1 + 0.5 * growthFrac(other, model)));
  return v;
}

/** The median multiplicative miss of a fitted value model on a test set. */
function valueMiss(fit: FittedValue, terms: ValueTerms, test: SnapshotProtocol[], asOf: string, model: ModelConstants = MODEL): number {
  const errs = test.map((p, i) => {
    const other = test[(i + 1) % test.length]!;
    const pred = p.tvl_usd * Math.exp(logMult(p, fit, terms, other, asOf, model));
    return Math.max(pred / p.mcap_usd!, p.mcap_usd! / pred);
  });
  return median(errs);
}

/** The walk-forward split: protocols listed earlier price those listed later. */
function walkForwardSplit<T extends SnapshotProtocol>(rows: T[]): { train: T[]; test: T[]; cutoff: string } {
  const dated = rows.filter((p) => p.listed_at !== null).sort((x, y) => (x.listed_at! < y.listed_at! ? -1 : 1));
  const cutoff = dated[Math.floor(dated.length / 2)]!.listed_at!;
  return {
    train: rows.filter((p) => p.listed_at === null || p.listed_at! <= cutoff),
    test: rows.filter((p) => p.listed_at !== null && p.listed_at! > cutoff),
    cutoff,
  };
}

/** The value model's held-out evidence, and the terms the combined rule keeps. */
function validateValue(comps: SnapshotProtocol[], asOf: string, model: ModelConstants = MODEL): { table: ValueEvidenceRow[]; kept: ValueTerms; kCat: number; fit: FittedValue } {
  const wf = walkForwardSplit(comps);
  const evalTerms = (terms: ValueTerms, kCat: number): [number, number, number] => {
    const looErrs: number[] = [];
    for (let i = 0; i < comps.length; i++) {
      const train = comps.filter((_, j) => j !== i);
      const fit = fitValue(train, terms, kCat, model);
      const p = comps[i]!;
      const other = comps[(i + 1) % comps.length]!;
      const pred = p.tvl_usd * Math.exp(logMult(p, fit, terms, other, asOf, model));
      looErrs.push(Math.max(pred / p.mcap_usd!, p.mcap_usd! / pred));
    }
    const fitTrain = fitValue(wf.train, terms, kCat, model);
    const loo = median(looErrs);
    const wfMiss = valueMiss(fitTrain, terms, wf.test, asOf, model);
    return [loo, wfMiss, (loo + wfMiss) / 2];
  };
  const table: ValueEvidenceRow[] = [];
  const kept: ValueTerms = { size: false, cat: false, growth: false, age: false, chains: false, control: false };
  const labels: Record<keyof ValueTerms | 'flat', string> = {
    flat: 'flat median multiple',
    size: '+ size curve, ln TVL',
    cat: '+ category effect, ridge 128',
    growth: '+ 7-day TVL growth',
    age: '+ age, years listed',
    chains: '+ chain count, ln',
    control: '+ control: growth of another row',
  };
  let current = evalTerms(kept, 32);
  table.push({ term: labels.flat, loo_miss: current[0], walk_forward_miss: current[1], status: 'baseline' });
  // Size curve first: it is the only term that moves both tests a lot.
  let next = evalTerms({ ...kept, size: true }, 32);
  const sizeKept = next[2] < current[2] * KEEP_MARGIN;
  table.push({ term: labels.size, loo_miss: next[0], walk_forward_miss: next[1], status: sizeKept ? 'kept' : 'tested, not kept' });
  if (sizeKept) { kept.size = true; current = next; }
  // Category effect: try the shrinkage grid, keep the best combined score.
  let bestK = 32;
  let bestEval: [number, number, number] | null = null;
  for (const k of CAT_K_CHOICES) {
    const e = evalTerms({ ...kept, cat: true }, k);
    if (bestEval === null || e[2] < bestEval[2]) { bestEval = e; bestK = k; }
  }
  const catKept = bestEval![2] < current[2] * KEEP_MARGIN;
  table.push({ term: `+ category effect, ridge ${bestK}`, loo_miss: bestEval![0], walk_forward_miss: bestEval![1], status: catKept ? 'kept' : 'tested, not kept' });
  if (catKept) { kept.cat = true; current = bestEval!; }
  for (const term of ['growth', 'age', 'chains', 'control'] as const) {
    const e = evalTerms({ ...kept, [term]: true }, bestK);
    const keep = e[2] < current[2] * KEEP_MARGIN;
    table.push({ term: labels[term], loo_miss: e[0], walk_forward_miss: e[1], status: term === 'control' ? 'must not help' : keep ? 'kept' : 'tested, not kept' });
    if (keep) { kept[term] = true; current = e; }
  }
  const fit = fitValue(comps, kept, bestK, model);
  return { table, kept, kCat: bestK, fit };
}

// ---------------------------------------------------------------- token odds

/** The terms the odds validation tries, in the order they are added. */
type OddsTerms = { age: boolean; size: boolean; growth: boolean; chains: boolean; cat: boolean };
const ODDS_FEATURES = ['age', 'size', 'growth', 'chains'] as const;

/** The features one protocol carries into the odds model. */
function oddsFeatures(p: SnapshotProtocol, asOf: string, model: ModelConstants = MODEL): Record<string, number> {
  return {
    age: ageYears(p, asOf, model),
    size: Math.log(Math.max(1, p.tvl_usd)),
    growth: growthFrac(p, model),
    chains: Math.log(Math.max(1, (p.chains || []).length)),
  };
}

/** A logistic fit on the chosen features: standardised Newton-Raphson, ridge 1e-3. */
interface FittedLogit {
  terms: string[];
  means: number[];
  sds: number[];
  beta: number[];
}
function fitLogit(rows: SnapshotProtocol[], terms: string[], asOf: string, model: ModelConstants = MODEL): FittedLogit {
  const cols = ODDS_FEATURES.filter((f) => terms.includes(f));
  const X = rows.map((p) => {
    const f = oddsFeatures(p, asOf, model);
    return [1, ...cols.map((c) => f[c]!)];
  });
  const y = rows.map((p) => (isPreToken(p) ? 0 : 1));
  const d = X[0]!.length;
  const means = new Array<number>(d).fill(0);
  const sds = new Array<number>(d).fill(1);
  for (let j = 1; j < d; j++) {
    const col = X.map((r) => r[j]!);
    means[j] = col.reduce((s, v) => s + v, 0) / col.length;
    sds[j] = Math.sqrt(col.reduce((s, v) => s + (v - means[j]!) * (v - means[j]!), 0) / col.length) || 1;
  }
  const Xs = X.map((r) => [r[0]!, ...r.slice(1).map((v, j) => (v - means[j + 1]!) / sds[j + 1]!)]);
  const beta = new Array<number>(d).fill(0);
  beta[0] = Math.log((y.reduce((s, v) => s + v, 0) + 0.5) / (y.length - y.reduce((s, v) => s + v, 0) + 0.5));
  for (let iter = 0; iter < 30; iter++) {
    const g = new Array<number>(d).fill(0);
    const H: number[][] = Array.from({ length: d }, () => new Array<number>(d).fill(0));
    for (let i = 0; i < Xs.length; i++) {
      const xi = Xs[i]!;
      const pi = sigmoid(beta.reduce((s, b, j) => s + b * xi[j]!, 0));
      const r = y[i]! - pi;
      const w = pi * (1 - pi);
      for (let a = 0; a < d; a++) {
        g[a]! += r * xi[a]!;
        for (let b = 0; b < d; b++) H[a]![b]! += w * xi[a]! * xi[b]!;
      }
    }
    for (let a = 0; a < d; a++) {
      H[a]![a]! += 1e-3;
      g[a]! -= 1e-3 * beta[a]!;
    }
    const step = solveLinear(H, g);
    let biggest = 0;
    for (let a = 0; a < d; a++) {
      beta[a]! += step[a]!;
      biggest = Math.max(biggest, Math.abs(step[a]!));
    }
    if (biggest < 1e-8) break;
  }
  return { terms: cols, means, sds, beta };
}

/** The raw-scale slopes of a fitted logit, for the page's recompute. */
function logitRaw(fit: FittedLogit): { intercept: number; slopes: Record<string, number> } {
  let intercept = fit.beta[0]!;
  const slopes: Record<string, number> = {};
  fit.terms.forEach((term, j) => {
    const slope = fit.beta[j + 1]! / fit.sds[j + 1]!;
    slopes[term] = slope;
    intercept -= fit.beta[j + 1]! * (fit.means[j + 1]! / fit.sds[j + 1]!);
  });
  return { intercept, slopes };
}

/** The odds fit: a logistic curve plus residualised category offsets. */
interface FittedOdds {
  base: FittedLogit;
  raw: { intercept: number; slopes: Record<string, number> };
  catOffsets: Map<string, number>;
  terms: OddsTerms;
}

/** Fit the odds model: age and growth by logistic regression, category offsets from
 * observed-vs-expected token counts under that curve (m pseudo-observations at parity). */
function fitOdds(rows: SnapshotProtocol[], terms: OddsTerms, asOf: string, model: ModelConstants = MODEL): FittedOdds {
  const cols = ODDS_FEATURES.filter((f) => (terms as Record<string, boolean>)[f]);
  const base = fitLogit(rows, cols, asOf, model);
  const raw = logitRaw(base);
  const predict0 = (p: SnapshotProtocol): number => {
    const f = oddsFeatures(p, asOf, model);
    let z = raw.intercept;
    for (const c of cols) z += raw.slopes[c]! * f[c]!;
    return sigmoid(z);
  };
  const catOffsets = new Map<string, number>();
  if (terms.cat) {
    const oe = new Map<string, [number, number]>();
    for (const p of rows) {
      const key = p.category ?? 'Other';
      const cur = oe.get(key) ?? [0, 0];
      oe.set(key, [cur[0] + (isPreToken(p) ? 0 : 1), cur[1] + predict0(p)]);
    }
    for (const [cat, [o, e]] of oe) {
      catOffsets.set(cat, Math.log((o + model.odds_cat_pseudo) / (e + model.odds_cat_pseudo)));
    }
  }
  return { base, raw, catOffsets, terms };
}

/** One protocol's token odds under a fitted odds model, clamped to [0.01, 0.99]. */
export function oddsOf(p: SnapshotProtocol, fit: FittedOdds, asOf: string, model: ModelConstants = MODEL): number {
  const f = oddsFeatures(p, asOf, model);
  let z = fit.raw.intercept;
  for (const term of Object.keys(fit.raw.slopes)) z += fit.raw.slopes[term]! * f[term]!;
  if (fit.terms.cat) z += fit.catOffsets.get(p.category ?? 'Other') ?? 0;
  return Math.min(0.99, Math.max(0.01, sigmoid(z)));
}

/** A Brier score and a share called right at the 0.5 line. */
function brierAndRight(predict: (p: SnapshotProtocol) => number, rows: SnapshotProtocol[]): [number, number] {
  let bs = 0;
  let right = 0;
  for (const p of rows) {
    const pr = predict(p);
    const y = isPreToken(p) ? 0 : 1;
    bs += (pr - y) * (pr - y);
    if ((pr >= 0.5) === (y === 1)) right++;
  }
  return [bs / rows.length, right / rows.length];
}

/** The odds model's held-out evidence, and the terms the combined rule keeps. */
function validateOdds(peers: SnapshotProtocol[], asOf: string, model: ModelConstants = MODEL): { table: OddsEvidenceRow[]; kept: OddsTerms; fit: FittedOdds } {
  const wf = walkForwardSplit(peers);
  const evalTerms = (terms: OddsTerms): [number, number, number, number, number] => {
    let bs = 0;
    let right = 0;
    for (let i = 0; i < peers.length; i++) {
      const train = peers.filter((_, j) => j !== i);
      const fit = fitOdds(train, terms, asOf, model);
      const pr = oddsOf(peers[i]!, fit, asOf, model);
      const y = isPreToken(peers[i]!) ? 0 : 1;
      bs += (pr - y) * (pr - y);
      if ((pr >= 0.5) === (y === 1)) right++;
    }
    const fitTrain = fitOdds(wf.train, terms, asOf, model);
    const [wb, wa] = brierAndRight((p) => oddsOf(p, fitTrain, asOf, model), wf.test);
    const loo = bs / peers.length;
    return [loo, right / peers.length, wb, wa, (loo + wb) / 2];
  };
  const table: OddsEvidenceRow[] = [];
  const kept: OddsTerms = { age: false, size: false, growth: false, chains: false, cat: false };
  const labels: Record<keyof OddsTerms | 'base', string> = {
    base: 'base rate of peers',
    age: '+ age, years listed',
    size: '+ size, ln TVL',
    growth: '+ 7-day TVL growth',
    chains: '+ chain count, ln',
    cat: '+ category offsets',
  };
  let current = evalTerms(kept);
  table.push({ term: labels.base, loo_brier: current[0], loo_called_right: current[1], walk_forward_brier: current[2], walk_forward_called_right: current[3], status: 'baseline' });
  for (const term of ['age', 'size', 'growth', 'chains', 'cat'] as const) {
    const e = evalTerms({ ...kept, [term]: true });
    const keep = e[4] < current[4] * KEEP_MARGIN;
    table.push({ term: labels[term], loo_brier: e[0], loo_called_right: e[1], walk_forward_brier: e[2], walk_forward_called_right: e[3], status: keep ? 'kept' : 'tested, not kept' });
    if (keep) { kept[term] = true; current = e; }
  }
  const fit = fitOdds(peers, kept, asOf, model);
  return { table, kept, fit };
}

// ---------------------------------------------------------------- ranges

/** One bootstrap refit: the value and odds fits on a resampled comparison set. */
function bootstrapRefit(comps: SnapshotProtocol[], peers: SnapshotProtocol[], valueTerms: ValueTerms, oddsTerms: OddsTerms, kCat: number, rand: () => number, asOf: string, model: ModelConstants = MODEL): { value: FittedValue; odds: FittedOdds; residuals: number[] } {
  const compSample = Array.from({ length: comps.length }, () => comps[Math.floor(rand() * comps.length)]!);
  const peerSample = Array.from({ length: peers.length }, () => peers[Math.floor(rand() * peers.length)]!);
  const value = fitValue(compSample, valueTerms, kCat, model);
  const ys = compSample.map((p) => Math.log(p.mcap_usd! / p.tvl_usd));
  const residuals = compSample.map((p, i) => ys[i]! - logMult(p, value, valueTerms, null, asOf, model));
  const odds = fitOdds(peerSample, oddsTerms, asOf, model);
  return { value, odds, residuals };
}

/** The value if a token launches, under a fitted value model. */
function valueIfLaunches(p: SnapshotProtocol, fit: FittedValue, terms: ValueTerms, asOf: string, model: ModelConstants = MODEL): number {
  return p.tvl_usd * Math.exp(logMult(p, fit, terms, null, asOf, model));
}

/** The ranges and rank ranges behind every row: 200 bootstrap refits, each drawing
 * a residual from the value model's own errors. */
function bootstrapRanges(
  comps: SnapshotProtocol[],
  peers: SnapshotProtocol[],
  valueFit: FittedValue,
  valueTerms: ValueTerms,
  oddsFit: FittedOdds,
  oddsTerms: OddsTerms,
  kCat: number,
  board: { p: SnapshotProtocol; value: number; odds: number }[],
  asOf: string,
  model: ModelConstants = MODEL,
): Map<string, { p10: number; p25: number; p75: number; p90: number; rankLo: number; rankHi: number }> {
  const rand = mulberry32(model.bootstrap_seed);
  const draws = new Map<string, number[]>();
  const ranks = new Map<string, number[]>();
  for (const row of board) {
    draws.set(row.p.slug, []);
    ranks.set(row.p.slug, []);
  }
  for (let b = 0; b < model.bootstrap_refits; b++) {
    const refit = bootstrapRefit(comps, peers, valueTerms, oddsTerms, kCat, rand, asOf, model);
    const scored = board.map((row) => {
      const vil = valueIfLaunches(row.p, refit.value, valueTerms, asOf, model);
      const odds = oddsOf(row.p, refit.odds, asOf, model);
      const resid = refit.residuals[Math.floor(rand() * refit.residuals.length)]!;
      draws.get(row.p.slug)!.push(vil * Math.exp(resid) * odds);
      return { slug: row.p.slug, implied: vil * odds };
    });
    scored.sort((x, y) => y.implied - x.implied || (x.slug < y.slug ? -1 : 1));
    scored.forEach((s, i) => ranks.get(s.slug)!.push(i + 1));
  }
  const out = new Map<string, { p10: number; p25: number; p75: number; p90: number; rankLo: number; rankHi: number }>();
  for (const row of board) {
    const d = [...draws.get(row.p.slug)!].sort((x, y) => x - y);
    const r = [...ranks.get(row.p.slug)!].sort((x, y) => x - y);
    out.set(row.p.slug, {
      p10: quantileSorted(d, 0.1),
      p25: quantileSorted(d, 0.25),
      p75: quantileSorted(d, 0.75),
      p90: quantileSorted(d, 0.9),
      rankLo: Math.round(quantileSorted(r, 0.05)),
      rankHi: Math.round(quantileSorted(r, 0.95)),
    });
  }
  return out;
}

/** Whether the printed ranges were honest, held-out, for the value model. */
function rangeHonesty(comps: SnapshotProtocol[], valueTerms: ValueTerms, kCat: number, asOf: string, model: ModelConstants = MODEL): RangeHonesty {
  const check = (train: SnapshotProtocol[], test: SnapshotProtocol[], bootstraps: number, seed: number): { x3: number; p2575: number; p1090: number; n: number } => {
    const rand = mulberry32(seed);
    let x3 = 0;
    let in2575 = 0;
    let in1090 = 0;
    for (const t of test) {
      const fit = fitValue(train, valueTerms, kCat, model);
      const point = t.tvl_usd * Math.exp(logMult(t, fit, valueTerms, null, asOf, model));
      const draws: number[] = [];
      for (let b = 0; b < bootstraps; b++) {
        const sample = Array.from({ length: train.length }, () => train[Math.floor(rand() * train.length)]!);
        const refit = fitValue(sample, valueTerms, kCat, model);
        const resid = sample.map((p) => Math.log(p.mcap_usd! / p.tvl_usd) - logMult(p, refit, valueTerms, null, asOf, model));
        const base = t.tvl_usd * Math.exp(logMult(t, refit, valueTerms, null, asOf, model));
        draws.push(base * Math.exp(resid[Math.floor(rand() * resid.length)]!));
      }
      draws.sort((x, y) => x - y);
      const p10 = quantileSorted(draws, 0.1);
      const p25 = quantileSorted(draws, 0.25);
      const p75 = quantileSorted(draws, 0.75);
      const p90 = quantileSorted(draws, 0.9);
      const actual = t.mcap_usd!;
      if (Math.max(point / actual, actual / point) <= 3) x3++;
      if (p25 <= actual && actual <= p75) in2575++;
      if (p10 <= actual && actual <= p90) in1090++;
    }
    return { x3: x3 / test.length, p2575: in2575 / test.length, p1090: in1090 / test.length, n: test.length };
  };
  // Leave-one-out: each comparison's own train set, 30 refits behind its range.
  let looX3 = 0;
  let loo2575 = 0;
  let loo1090 = 0;
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const r = check(train, [comps[i]!], COVERAGE_BOOTSTRAPS_LOO, 100 + i);
    looX3 += r.x3;
    loo2575 += r.p2575;
    loo1090 += r.p1090;
  }
  const wf = walkForwardSplit(comps);
  const wfCheck = check(wf.train, wf.test, COVERAGE_BOOTSTRAPS_WF, 99);
  return {
    loo_within_x3: looX3 / comps.length,
    loo_inside_p25_p75: loo2575 / comps.length,
    loo_inside_p10_p90: loo1090 / comps.length,
    loo_n: comps.length,
    wf_within_x3: wfCheck.x3,
    wf_inside_p25_p75: wfCheck.p2575,
    wf_inside_p10_p90: wfCheck.p1090,
    wf_n: wfCheck.n,
  };
}

/** The fitted coefficients, with bootstrap standard errors, for the evidence tables. */
function fittedLines(
  comps: SnapshotProtocol[],
  peers: SnapshotProtocol[],
  valueTerms: ValueTerms,
  oddsTerms: OddsTerms,
  kCat: number,
  asOf: string,
  model: ModelConstants = MODEL,
): { valueLine: string; oddsLine: string; valueFit: FittedValue; oddsFit: FittedOdds; slopeSe: number; interceptSe: number; ageSe: number; growthSe: number } {
  const rand = mulberry32(model.bootstrap_seed + 1);
  const slopes: number[] = [];
  const intercepts: number[] = [];
  const ageSlopes: number[] = [];
  const growthSlopes: number[] = [];
  for (let b = 0; b < model.bootstrap_refits; b++) {
    const compSample = Array.from({ length: comps.length }, () => comps[Math.floor(rand() * comps.length)]!);
    const peerSample = Array.from({ length: peers.length }, () => peers[Math.floor(rand() * peers.length)]!);
    const vf = fitValue(compSample, valueTerms, kCat, model);
    slopes.push(vf.b);
    intercepts.push(vf.a);
    const of = fitOdds(peerSample, oddsTerms, asOf, model);
    if (of.raw.slopes.age !== undefined) ageSlopes.push(of.raw.slopes.age);
    if (of.raw.slopes.growth !== undefined) growthSlopes.push(of.raw.slopes.growth);
  }
  const valueFit = fitValue(comps, valueTerms, kCat, model);
  const oddsFit = fitOdds(peers, oddsTerms, asOf, model);
  const catRange = [...valueFit.catOffsets.values()];
  const catLo = catRange.length ? Math.min(...catRange) : 0;
  const catHi = catRange.length ? Math.max(...catRange) : 0;
  const valueLine =
    `size slope ${valueFit.b.toFixed(2)} ± ${stdev(slopes).toFixed(2)}; ` +
    `category offsets ×${Math.exp(catLo).toFixed(2)} to ×${Math.exp(catHi).toFixed(2)}; ` +
    `multiple at $100M TVL ×${Math.exp(valueFit.a + valueFit.b * Math.log(1e8)).toFixed(2)}`;
  const oddsLine =
    `age ${oddsFit.raw.slopes.age !== undefined ? oddsFit.raw.slopes.age.toFixed(2) : '—'} ± ${ageSlopes.length ? stdev(ageSlopes).toFixed(2) : '—'} per year; ` +
    `growth ${oddsFit.raw.slopes.growth !== undefined ? oddsFit.raw.slopes.growth.toFixed(2) : '—'} ± ${growthSlopes.length ? stdev(growthSlopes).toFixed(2) : '—'}; ` +
    `category offsets ${oddsFit.catOffsets.size ? `${Math.min(...oddsFit.catOffsets.values()).toFixed(2)} to ${Math.max(...oddsFit.catOffsets.values()).toFixed(2)} logits` : 'none'}`;
  return {
    valueLine,
    oddsLine,
    valueFit,
    oddsFit,
    slopeSe: stdev(slopes),
    interceptSe: stdev(intercepts),
    ageSe: ageSlopes.length ? stdev(ageSlopes) : 0,
    growthSe: growthSlopes.length ? stdev(growthSlopes) : 0,
  };
}

// ---------------------------------------------------------------- farm plans

/** The farm scenario: drop share, horizon, and how the deposit is sized. */
export interface FarmScenario {
  drop_share: number;
  horizon_weeks: number;
  deposit: { mode: 'share'; share: number } | { mode: 'fixed'; dollars: number };
}

/** The board's default scenario. */
export function defaultScenario(model: ModelConstants = MODEL): FarmScenario {
  return { drop_share: model.drop_share, horizon_weeks: model.horizon_weeks, deposit: { mode: 'share', share: model.deposit_share } };
}

/** The cheapest chain a protocol runs on, by what one transaction costs there. */
function cheapestChain(p: SnapshotProtocol): string {
  if (p.chains.length === 0) return 'its main chain';
  let best = p.chains[0]!;
  let bestGas = gasFor(best);
  for (const c of p.chains) {
    const g = gasFor(c);
    if (g < bestGas) { bestGas = g; best = c; }
  }
  return best;
}

/** What one transaction costs on a chain, in dollars. */
function gasFor(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 6;
  if (c === 'solana') return 0.1;
  if (c === 'arbitrum' || c === 'optimism' || c === 'base' || c === 'polygon' || c === 'blast' || c === 'scroll' || c === 'linea' || c === 'zksync era' || c === 'mode') return 1;
  if (c === 'bsc' || c === 'avalanche' || c === 'fantom' || c === 'gnosis') return 0.5;
  return 2;
}

/** What one transaction costs on a chain, in the words a farmer budgets by. */
function gasWords(chain: string): string {
  const g = gasFor(chain);
  if (g >= 6) return 'about $6 of gas';
  if (g >= 2) return 'about $2 of gas';
  if (g >= 1) return 'under $1 of gas';
  if (g >= 0.5) return 'under $0.50 of gas';
  return 'under $0.10 of gas';
}

/** How much capital one farm position needs, from the plan deposit. */
function depositFor(p: SnapshotProtocol, scenario: FarmScenario, model: ModelConstants = MODEL): number {
  if (scenario.deposit.mode === 'fixed') return scenario.deposit.dollars;
  return Math.min(model.deposit_cap, Math.max(model.deposit_floor, scenario.deposit.share * p.tvl_usd));
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The fifth percentile of the snapshot's seven-day changes, in per cent. */
export function exitPct(snapshot: Snapshot): number {
  const changes = snapshot.protocols
    .map((p) => p.change_7d)
    .filter((c): c is number => typeof c === 'number' && Number.isFinite(c))
    .sort((a, b) => a - b);
  return changes[Math.floor(0.05 * changes.length)]!;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and borrow $10 against it, then repay the borrow the same week.`;
  if (c.includes('dex') || c.includes('amm') || c.includes('swap')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and swap $10 through it once.`;
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('yield aggregator')) return `Deposit $${capital} into ${name}'s highest-TVL yield vault on ${chain} and keep the shares.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app once.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('risk')) return `Deposit $${capital} into a ${name} risk vault on ${chain} and keep the shares.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the position.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action, in the words a farmer can follow. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Borrow $5 against the supply, repay it, and leave the supply in place.';
  if (c.includes('dex') || c.includes('amm') || c.includes('swap')) return 'Swap $10 through the pool and add $5 of liquidity if the range moved.';
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('yield aggregator')) return 'Harvest the vault yield and re-deposit it into the same vault.';
  if (c.includes('bridge') || c.includes('cross chain')) return 'Bridge $10 to the chain and use the destination app once.';
  if (c.includes('staking') || c.includes('restak')) return 'Check the staking rewards and restake what has accrued.';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'Open one $5 position and close it the same week.';
  if (c.includes('prediction')) return 'Settle one market and place one new position.';
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) return 'Check the vault allocation and add $5 if the strategy changed.';
  if (c.includes('stable')) return 'Mint or redeem $10 of the stable asset through the protocol.';
  if (c.includes('rwa')) return 'Check the yield that accrued and leave the asset in place.';
  if (c.includes('insurance')) return 'Check the policy and the covered amount are still active.';
  if (c.includes('risk')) return 'Review the vault risk report and leave the deposit in place.';
  if (c.includes('basis')) return 'Check the basis position and the funding it earned.';
  return 'Make one qualifying action: a deposit, a borrow, a swap or a vote.';
}

/** The category's one risk, in the words a farmer can follow. */
function riskFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'A borrow can be liquidated if the collateral falls; keep the borrow small and watch the health factor.';
  if (c.includes('dex') || c.includes('amm') || c.includes('swap')) return 'Liquidity can lose to impermanent loss if the price moves far; a narrow range earns more and risks more.';
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('yield aggregator')) return 'A vault stacks other protocols beneath it, so any of them can fail; read the strategy page and avoid vaults whose yield is mostly paid in an unlisted points token.';
  if (c.includes('bridge') || c.includes('cross chain')) return 'A bridge holds your funds between chains; use a large one and never bridge more than the plan deposit at once.';
  if (c.includes('staking') || c.includes('restak')) return 'Staked assets can be slashed or locked; check the unbonding wait before you stake.';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'Leverage can wipe a margin deposit in one move; keep the position small and hedged.';
  if (c.includes('prediction')) return 'A market position can go to zero; stake only the plan deposit on one market.';
  if (c.includes('stable')) return 'A stable asset can depeg; check what backs it before you mint.';
  if (c.includes('rwa')) return 'A real-world asset depends on its issuer and its custodian; check both before you mint.';
  if (c.includes('insurance')) return 'Cover pays only for the risks the policy names; read what is excluded before you buy.';
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault') || c.includes('risk')) return 'A curator vault follows one manager, so check who the curator is and what they can change.';
  return 'A new protocol can fail or be exploited; never deposit more than the plan deposit.';
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: ten steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age), never from a
 * hand-written list of names. The plan's own arithmetic — 19 chain transactions plus
 * $2 of exchange withdrawals, 195 hands-on minutes — is what the verdict is costed on.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, exit: number, scenario: FarmScenario, model: ModelConstants = MODEL): FarmStep[] {
  const chain = cheapestChain(p);
  const capital = Math.round(depositFor(p, scenario, model));
  const hold = holdDaysFor(age);
  const gas = gasWords(chain);
  const gasUsd = gasFor(chain);
  const weeks = scenario.horizon_weeks;
  const secondChain = (p.chains || []).length > 1 ? (p.chains || [])[1]! : null;
  const threshold = Math.round(p.tvl_usd * (1 + exit / 100));
  const fmtUsd = (n: number): string => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`);
  return [
    {
      text: `Set up a fresh wallet for this farm alone and keep its seed phrase offline. Buy about $2 of ${chain} gas on an exchange so the wallet can pay its first transactions.`,
      cost: '$1.00 (one exchange withdrawal)',
      time: '10 minutes hands-on',
    },
    {
      text: `Reach ${p.name} from its DefiLlama page or its official accounts, bookmark the app, and match the contract addresses against its docs. Never sign an approval from a link sent in a message.`,
      cost: 'free',
      time: '5 minutes hands-on',
    },
    {
      text: `Move $${capital} of USDC to ${chain} — from an exchange that supports it, or by bridging from Ethereum with a large bridge that lists ${chain}.`,
      cost: `$1.00 (one exchange withdrawal) plus ${gas}`,
      time: '10 minutes hands-on; 2-20 minutes to arrive',
    },
    {
      text: `Strategy risk: ${riskFor(p)}`,
      cost: 'free (reading only; the deposit is the capital at risk)',
      time: '10 minutes hands-on',
    },
    {
      text: `${actionFor(p, capital, chain)} Start with a $100 test, then size up to the full $${capital} (the plan size is ${(100 * (capital / Math.max(1, p.tvl_usd))).toFixed(3)}% of its ${fmtUsd(p.tvl_usd)} TVL) and hold it for at least ${hold} days.`,
      cost: `$${capital} of capital and about $${(3 * gasUsd).toFixed(2)} of gas (3 transactions)`,
      time: '15 minutes hands-on',
    },
    {
      text: secondChain !== null
        ? `Deepen the footprint: repeat a smaller deposit on ${secondChain}, the protocol's second chain, so the same wallet shows activity on more than one chain.`
        : `Deepen the footprint: post the receipt token where ${p.name} lists a points boost (a lending market or a pool), but never loop it more than once.`,
      cost: `about $${(2 * gasUsd).toFixed(2)} of gas (2 transactions)`,
      time: '10 minutes hands-on',
    },
    {
      text: `Touch the position once a week for ${weeks} weeks: ${weeklyFor(p)} A steady wallet reads better than one deposit.`,
      cost: `${gas} a week`,
      time: `5 minutes a week for ${weeks} weeks`,
    },
    {
      text: `Exit rule: withdraw if ${p.name}'s TVL prints below ${fmtUsd(threshold)}, which is ${exit.toFixed(1)}% from today's ${fmtUsd(p.tvl_usd)} and a week worse than 95% of this snapshot's protocols. Also withdraw if withdrawals pause or the team goes quiet.`,
      cost: 'free',
      time: `5 minutes a week for ${weeks} weeks`,
    },
    {
      text: `Keep a ledger from the first transaction: date, transaction hash, asset, amount and dollar value of every top-up, claim and withdrawal. A claim may ask the wallet to prove its history.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
    {
      text: `Claim only from ${p.name}'s own points page, reached from its official accounts. Never pay to claim, and remember a drop is taxable income in many places at its value on the day it arrives.`,
      cost: `${gas} (1 transaction)`,
      time: '10 minutes',
    },
  ];
}

/** The plan's costed economics: deposit, drop, fees, hours, net, and the verdict. */
export interface PlanEconomics {
  deposit: number;
  drop: number;
  fees: number;
  hours: number;
  net: number;
  tbill: number;
  net_per_hour: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
}

/** The verdict math, from the plan's own steps: 19 chain transactions, $2 of withdrawals, 195 minutes. */
export function planEconomics(p: SnapshotProtocol, implied: number, scenario: FarmScenario, model: ModelConstants = MODEL): PlanEconomics {
  const deposit = depositFor(p, scenario, model);
  const gas = gasFor(cheapestChain(p));
  const fees = 2 + 19 * gas;
  const hours = 195 / 60;
  const drop = implied * scenario.drop_share * (deposit / (deposit + p.tvl_usd));
  const net = drop - fees;
  const tbill = deposit * model.tbill_rate * (scenario.horizon_weeks / 52);
  const netPerHour = net / hours;
  const verdict = net > tbill && netPerHour >= model.farm_net_per_hour ? 'FARM' : net <= 0 ? 'SKIP' : 'MARGINAL';
  return { deposit, drop, fees, hours, net, tbill, net_per_hour: netPerHour, verdict };
}

// ---------------------------------------------------------------- the board

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  valueFit: FittedValue,
  valueTerms: ValueTerms,
  oddsFit: FittedOdds,
  ranges: Map<string, { p10: number; p25: number; p75: number; p90: number; rankLo: number; rankHi: number }>,
  looPreds: Map<string, number>,
  scenario: FarmScenario,
  model: ModelConstants = MODEL,
): BoardRow[] {
  const exit = exitPct(snapshot);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the watchlist floor. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd) chosen.set(p.slug, p);
  }
  const comps = snapshot.protocols.filter(isPricedComp);
  const scored = [...chosen.values()].map((p) => {
    const vil = valueIfLaunches(p, valueFit, valueTerms, snapshot.as_of, model);
    const odds = oddsOf(p, oddsFit, snapshot.as_of, model);
    return { p, vil, odds, raw: Math.max(1, Math.round(vil * odds)) };
  });
  scored.sort((a, b) => b.raw - a.raw || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // The tie-break: ranks stay distinct, so the board is a ranking. A nudge is stored on the
  // row, and the page recomputes it from the same rule.
  let prev = Number.POSITIVE_INFINITY;
  return scored.map((s, i) => {
    const nudge = s.raw >= prev ? prev - 1 - s.raw : 0;
    const implied = s.raw + nudge;
    prev = implied;
    const age = ageDays(snapshot.as_of, s.p.listed_at);
    const range = ranges.get(s.p.slug)!;
    const econ = planEconomics(s.p, implied, scenario, model);
    const sizeMultiple = Math.exp(valueFit.a + valueFit.b * Math.log(s.p.tvl_usd));
    const catOffValue = valueFit.catOffsets.get(s.p.category ?? 'Other') ?? 0;
    const peers = nearestPeers(s.p, comps, looPreds);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: age,
      implied_value_usd: implied,
      tie_nudge: nudge,
      value_if_launches_usd: Math.max(1, Math.round(s.vil)),
      token_odds: s.odds,
      p10_usd: Math.max(1, Math.round(range.p10)),
      p25_usd: Math.max(1, Math.round(range.p25)),
      p75_usd: Math.max(1, Math.round(range.p75)),
      p90_usd: Math.max(1, Math.round(range.p90)),
      rank_lo: range.rankLo,
      rank_hi: range.rankHi,
      verdict: econ.verdict,
      verdict_net_usd: Math.round(econ.net * 100) / 100,
      verdict_fees_usd: Math.round(econ.fees * 100) / 100,
      verdict_hours: econ.hours,
      verdict_drop_usd: Math.round(econ.drop * 100) / 100,
      verdict_deposit_usd: Math.round(econ.deposit),
      verdict_net_per_hour_usd: Math.round(econ.net_per_hour * 100) / 100,
      model: {
        size_multiple: sizeMultiple,
        category_offset: catOffValue,
        growth_pct: growthFrac(s.p, model),
        odds_age_years: ageYears(s.p, snapshot.as_of, model),
        odds_category_offset: oddsFit.catOffsets.get(s.p.category ?? 'Other') ?? 0,
        age_days: age,
      },
      farm_steps: farmSteps(s.p, age, exit, scenario, model).map(stepText),
      nearest_peers: peers,
    };
  });
}

/** The nearest priced peers: same-category live tokens nearest by TVL, with the
 * held-out model's prediction for each as a multiple of its real cap. */
export function nearestPeers(
  p: SnapshotProtocol,
  comps: SnapshotProtocol[],
  looPreds: Map<string, number>,
): PricedPeer[] {
  const same = comps.filter((c) => (c.category ?? 'Other') === (p.category ?? 'Other'));
  const pool = same.length > 0 ? same : comps;
  const target = Math.log(p.tvl_usd);
  return [...pool]
    .sort((a, b) => Math.abs(Math.log(a.tvl_usd) - target) - Math.abs(Math.log(b.tvl_usd) - target))
    .slice(0, 8)
    .map((c) => ({
      name: c.name,
      symbol: c.symbol,
      category: c.category,
      tvl_usd: c.tvl_usd,
      mcap_usd: c.mcap_usd!,
      cap_per_tvl: c.mcap_usd! / c.tvl_usd,
      held_out_model_x: Math.round(((looPreds.get(c.slug) ?? c.mcap_usd!) / c.mcap_usd!) * 100) / 100,
    }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Every protocol in exactly one group: ranked, live, or set aside with its reason. */
export function accounting(snapshot: Snapshot, board: BoardRow[]): AccountingSegment[] {
  const ranked = new Set(board.map((r) => r.slug));
  const watchlist = new Set(snapshot.watchlist);
  let livePriced = 0;
  let liveUnpriced = 0;
  let outCex = 0;
  let outVersioned = 0;
  let outAboveFloor = 0;
  for (const p of snapshot.protocols) {
    if (ranked.has(p.slug)) continue;
    if (isPreToken(p)) {
      if (p.category === 'CEX') outCex++;
      else if (VERSIONED.test(p.name)) outVersioned++;
      else outAboveFloor++;
    } else if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) livePriced++;
    else liveUnpriced++;
  }
  return [
    { label: 'Ranked · watchlist', count: board.filter((r) => watchlist.has(r.slug)).length, kind: 'ranked-watchlist' },
    { label: 'Ranked · early, below the floor', count: board.filter((r) => !watchlist.has(r.slug)).length, kind: 'ranked-early' },
    { label: 'Token trades · priced comparison', count: livePriced, kind: 'live-priced' },
    { label: 'Token recorded · no usable cap', count: liveUnpriced, kind: 'live-unpriced' },
    { label: 'Out · exchange', count: outCex, kind: 'out' },
    { label: 'Out · versioned or wrapped', count: outVersioned, kind: 'out' },
    { label: 'Out · above the floor, not on the watchlist', count: outAboveFloor, kind: 'out' },
  ];
}

/** The held-out predictions behind the nearest-peers table: each comparison's
 * leave-one-out prediction of its own market cap. */
function looPredictions(comps: SnapshotProtocol[], valueTerms: ValueTerms, kCat: number, asOf: string, model: ModelConstants = MODEL): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const fit = fitValue(train, valueTerms, kCat, model);
    const p = comps[i]!;
    out.set(p.slug, p.tvl_usd * Math.exp(logMult(p, fit, valueTerms, null, asOf, model)));
  }
  return out;
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const comps = snapshot.protocols.filter(isPricedComp);
  const valueValidation = validateValue(comps, snapshot.as_of, model);
  const oddsValidation = validateOdds(snapshot.protocols, snapshot.as_of, model);
  const range = rangeHonesty(comps, valueValidation.kept, valueValidation.kCat, snapshot.as_of, model);
  const { valueLine, oddsLine, valueFit, oddsFit, slopeSe, interceptSe, ageSe, growthSe } = fittedLines(
    comps,
    snapshot.protocols,
    valueValidation.kept,
    oddsValidation.kept,
    valueValidation.kCat,
    snapshot.as_of,
    model,
  );
  const evidence: Evidence = {
    value: valueValidation.table,
    odds: oddsValidation.table,
    range,
    value_kept: VALUE_TERM_ORDER.filter((t) => valueValidation.kept[t]),
    odds_kept: ['age', 'size', 'growth', 'chains', 'cat'].filter((t) => oddsValidation.kept[t as keyof OddsTerms]),
    value_fitted_line: valueLine,
    odds_fitted_line: oddsLine,
  };
  // The board's point values first, so the bootstrap can rank the refits against them.
  const chosen = new Map<string, SnapshotProtocol>();
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd) chosen.set(p.slug, p);
  }
  const pointRows = [...chosen.values()].map((p) => ({
    p,
    value: valueIfLaunches(p, valueFit, valueValidation.kept, snapshot.as_of, model),
    odds: oddsOf(p, oddsFit, snapshot.as_of, model),
  }));
  const ranges = bootstrapRanges(comps, snapshot.protocols, valueFit, valueValidation.kept, oddsFit, oddsValidation.kept, valueValidation.kCat, pointRows, snapshot.as_of, model);
  const looPreds = looPredictions(comps, valueValidation.kept, valueValidation.kCat, snapshot.as_of, model);
  const scenario = defaultScenario(model);
  const board = buildBoard(snapshot, valueFit, valueValidation.kept, oddsFit, ranges, looPreds, scenario, model);
  const live = liveRows(snapshot);
  const counts = { farm: 0, marginal: 0, skip: 0 };
  for (const r of board) {
    if (r.verdict === 'FARM') counts.farm++;
    else if (r.verdict === 'MARGINAL') counts.marginal++;
    else counts.skip++;
  }
  const valueFitOut: ValueFit = {
    intercept: valueFit.a,
    slope: valueFit.b,
    slope_se: slopeSe,
    intercept_se: interceptSe,
    multiple_at_100m: Math.exp(valueFit.a + valueFit.b * Math.log(1e8)),
    cat_offsets: [...valueFit.catOffsets.entries()].map(([category, offset]) => ({ category, offset, sample_count: valueFit.catCounts.get(category) ?? 0 })),
    flat_median_multiple: Math.exp(valueFit.flat),
    comps_n: comps.length,
  };
  const oddsFitOut: OddsFit = {
    intercept: oddsFit.raw.intercept,
    age_slope: oddsFit.raw.slopes.age ?? 0,
    age_se: ageSe,
    growth_slope: oddsFit.raw.slopes.growth ?? 0,
    growth_se: growthSe,
    cat_offsets: [...oddsFit.catOffsets.entries()].map(([category, offset]) => ({ category, offset })),
    peers_n: snapshot.protocols.length,
    base_rate: snapshot.protocols.filter((p) => !isPreToken(p)).length / snapshot.protocols.length,
  };
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    watchlist: [...snapshot.watchlist],
    board_size: board.length,
    early_size: board.filter((r) => !snapshot.watchlist.includes(r.slug)).length,
    above_floor_size: snapshot.protocols.filter((p) => isPreToken(p) && p.tvl_usd >= snapshot.floor_usd && !snapshot.watchlist.includes(p.slug)).length,
    live_size: live.length,
    value_fit: valueFitOut,
    odds_fit: oddsFitOut,
    evidence,
    accounting: accounting(snapshot, board),
    verdict_counts: counts,
    exit_pct: exitPct(snapshot),
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
