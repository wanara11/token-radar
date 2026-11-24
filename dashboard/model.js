// The page's mirror of lib/model.ts: the same model, in the browser, so the
// dashboard recomputes every row and proves the board matches. No network:
// every fitted number comes from window.RADAR (data.js).

(function () {
  'use strict';

  var R = window.RADAR;
  var MODEL = R.model;
  var DAY_MS = 86400000;

  function finite(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  function fmtUsd(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }

  function sigmoid(z) {
    if (z >= 0) return 1 / (1 + Math.exp(-z));
    var e = Math.exp(z);
    return e / (1 + e);
  }

  // ------------------------------------------------------------ the raw figures

  /** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
  function ageDays(asOf, listedAt) {
    if (listedAt === null || listedAt === undefined) return null;
    var a = Date.parse(asOf + 'T00:00:00Z');
    var b = Date.parse(listedAt + 'T00:00:00Z');
    if (!isFinite(a) || !isFinite(b)) return null;
    return Math.max(0, Math.floor((a - b) / DAY_MS));
  }

  /** The seven-day change, winsorized to the model's band, in per cent: only the week's direction counts. */
  function growthPct(p) {
    var raw = finite(p.change_7d, 0);
    return Math.min(MODEL.growth_hi_pct, Math.max(MODEL.growth_lo_pct, raw));
  }

  /** The age in years, with an unlisted age counting as one year. */
  function ageYears(p) {
    var age = ageDays(R.as_of, p.listed_at);
    return (age === null ? MODEL.unknown_age_days : age) / 365;
  }

  /** What one transaction costs on a chain, in dollars. */
  function gasFor(chain) {
    var c = String(chain).toLowerCase();
    if (c === 'ethereum') return 6;
    if (c === 'solana') return 0.1;
    if (c === 'arbitrum' || c === 'optimism' || c === 'base' || c === 'polygon' || c === 'blast' || c === 'scroll' || c === 'linea' || c === 'zksync era' || c === 'mode') return 1;
    if (c === 'bsc' || c === 'avalanche' || c === 'fantom' || c === 'gnosis') return 0.5;
    return 2;
  }

  /** What one transaction costs on a chain, in the words a farmer budgets by. */
  function gasWords(chain) {
    var g = gasFor(chain);
    if (g >= 6) return 'about $6 of gas';
    if (g >= 2) return 'about $2 of gas';
    if (g >= 1) return 'under $1 of gas';
    if (g >= 0.5) return 'under $0.50 of gas';
    return 'under $0.10 of gas';
  }

  /** The cheapest chain a protocol runs on, by what one transaction costs there. */
  function cheapestChain(p) {
    var chains = p.chains || [];
    if (chains.length === 0) return 'its main chain';
    var best = chains[0];
    var bestGas = gasFor(best);
    for (var i = 1; i < chains.length; i++) {
      var g = gasFor(chains[i]);
      if (g < bestGas) { bestGas = g; best = chains[i]; }
    }
    return best;
  }

  // ------------------------------------------------------------ the fitted model

  function catOffsetValue(category) {
    var list = R.value_fit.cat_offsets;
    for (var i = 0; i < list.length; i++) if (list[i].category === category) return list[i].offset;
    return 0;
  }

  function catOffsetOdds(category) {
    var list = R.odds_fit.cat_offsets;
    for (var i = 0; i < list.length; i++) if (list[i].category === category) return list[i].offset;
    return 0;
  }

  /** The value if a token launches: TVL x the size curve x the category offset. */
  function valueIfLaunches(p) {
    var f = R.value_fit;
    var mult = Math.exp(f.intercept + f.slope * Math.log(p.tvl_usd) + catOffsetValue(p.category === null ? 'Other' : p.category));
    return p.tvl_usd * mult;
  }

  /** The token odds: the logistic curve on age and the week's move, plus the category offset. */
  function oddsOf(p) {
    var f = R.odds_fit;
    var z = f.intercept + f.age_slope * ageYears(p) + f.growth_slope * growthPct(p) + catOffsetOdds(p.category === null ? 'Other' : p.category);
    return Math.min(0.99, Math.max(0.01, sigmoid(z)));
  }

  /** The row's implied value, recomputed from its raw figures plus the stored tie-break. */
  function impliedOf(row) {
    var raw = Math.max(1, Math.round(valueIfLaunches(row) * oddsOf(row)));
    return raw + (row.tie_nudge || 0);
  }

  // ------------------------------------------------------------ the farm scenario

  /** The board's default scenario: 7% of the implied value, 12 weeks, deposit 0.02% of TVL. */
  function defaultScenario() {
    return { drop_share: MODEL.drop_share, horizon_weeks: MODEL.horizon_weeks, deposit: { mode: 'share', share: MODEL.deposit_share } };
  }

  /** How much capital one farm position needs, from the plan deposit. */
  function depositFor(p, scenario) {
    if (scenario.deposit.mode === 'fixed') return scenario.deposit.dollars;
    return Math.min(MODEL.deposit_cap, Math.max(MODEL.deposit_floor, scenario.deposit.share * p.tvl_usd));
  }

  /** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
  function holdDaysFor(age) {
    if (age === null) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }

  // ------------------------------------------------------------ the farm plan

  /** One table per category function: [keywords, template]. {C} is the capital, {N} the name, {H} the chain. */
  var ACTION_TABLE = [
    [['lend', 'cdp', 'collateral'], 'Supply $${C} of USDC to {N} on {H} and borrow $10 against it, then repay the borrow the same week.'],
    [['dex', 'amm', 'swap'], 'Provide $${C} of liquidity to {N}\'s main pool on {H} and swap $10 through it once.'],
    [['yield', 'leveraged farm', 'yield aggregator'], 'Deposit $${C} into {N}\'s highest-TVL yield vault on {H} and keep the shares.'],
    [['bridge', 'cross chain'], 'Bridge $${C} of USDC to {H} through {N} and use the bridged funds in its app once.'],
    [['staking', 'restak'], 'Stake $${C} of the chain\'s staking asset through {N} and keep the receipt token.'],
    [['perpetual', 'derivative', 'options'], 'Deposit $${C} of USDC as margin on {N} and open one small hedged position.'],
    [['prediction'], 'Fund $${C} and place one market position on {N}.'],
    [['curator', 'allocator', 'vault'], 'Deposit $${C} into a {N} vault on {H} and keep the shares.'],
    [['stable'], 'Mint or deposit $${C} of the stable asset through {N} on {H}.'],
    [['rwa'], 'Mint $${C} of the protocol\'s yield asset on {H} and hold it.'],
    [['insurance'], 'Buy $${C} of cover from {N} on {H} and keep the policy.'],
    [['risk'], 'Deposit $${C} into a {N} risk vault on {H} and keep the shares.'],
    [['basis'], 'Deposit $${C} of USDC into {N}\'s basis vault on {H} and keep the position.'],
    [[], 'Deposit $${C} of USDC into {N} on {H} and keep the position open.']
  ];

  function fill(t, capital, name, chain) {
    return t.split('${C}').join(capital).split('{N}').join(name).split('{H}').join(chain);
  }

  /** The first table row whose keywords match the category, in order; the last row is the fallback. */
  function pick(table, c, capital, name, chain) {
    for (var i = 0; i < table.length; i++) {
      var ks = table[i][0];
      for (var j = 0; j < ks.length; j++) if (c.indexOf(ks[j]) !== -1) return fill(table[i][1], capital, name, chain);
    }
    return fill(table[table.length - 1][1], capital, name, chain);
  }

  function actionFor(p, capital, chain) {
    return pick(ACTION_TABLE, String(p.category || '').toLowerCase(), capital, p.name, chain);
  }

  var WEEKLY_TABLE = [
    [['lend', 'cdp', 'collateral'], 'Borrow $5 against the supply, repay it, and leave the supply in place.'],
    [['dex', 'amm', 'swap'], 'Swap $10 through the pool and add $5 of liquidity if the range moved.'],
    [['yield', 'leveraged farm', 'yield aggregator'], 'Harvest the vault yield and re-deposit it into the same vault.'],
    [['bridge', 'cross chain'], 'Bridge $10 to the chain and use the destination app once.'],
    [['staking', 'restak'], 'Check the staking rewards and restake what has accrued.'],
    [['perpetual', 'derivative', 'options'], 'Open one $5 position and close it the same week.'],
    [['prediction'], 'Settle one market and place one new position.'],
    [['curator', 'allocator', 'vault'], 'Check the vault allocation and add $5 if the strategy changed.'],
    [['stable'], 'Mint or redeem $10 of the stable asset through the protocol.'],
    [['rwa'], 'Check the yield that accrued and leave the asset in place.'],
    [['insurance'], 'Check the policy and the covered amount are still active.'],
    [['risk'], 'Review the vault risk report and leave the deposit in place.'],
    [['basis'], 'Check the basis position and the funding it earned.'],
    [[], 'Make one qualifying action: a deposit, a borrow, a swap or a vote.']
  ];

  function weeklyFor(p) {
    return pick(WEEKLY_TABLE, String(p.category || '').toLowerCase());
  }

  var RISK_TABLE = [
    [['lend', 'cdp', 'collateral'], 'A borrow can be liquidated if the collateral falls; keep the borrow small and watch the health factor.'],
    [['dex', 'amm', 'swap'], 'Liquidity can lose to impermanent loss if the price moves far; a narrow range earns more and risks more.'],
    [['yield', 'leveraged farm', 'yield aggregator'], 'A vault stacks other protocols beneath it, so any of them can fail; read the strategy page and avoid vaults whose yield is mostly paid in an unlisted points token.'],
    [['bridge', 'cross chain'], 'A bridge holds your funds between chains; use a large one and never bridge more than the plan deposit at once.'],
    [['staking', 'restak'], 'Staked assets can be slashed or locked; check the unbonding wait before you stake.'],
    [['perpetual', 'derivative', 'options'], 'Leverage can wipe a margin deposit in one move; keep the position small and hedged.'],
    [['prediction'], 'A market position can go to zero; stake only the plan deposit on one market.'],
    [['stable'], 'A stable asset can depeg; check what backs it before you mint.'],
    [['rwa'], 'A real-world asset depends on its issuer and its custodian; check both before you mint.'],
    [['insurance'], 'Cover pays only for the risks the policy names; read what is excluded before you buy.'],
    [['curator', 'allocator', 'vault', 'risk'], 'A curator vault follows one manager, so check who the curator is and what they can change.'],
    [[], 'A new protocol can fail or be exploited; never deposit more than the plan deposit.']
  ];

  function riskFor(p) {
    return pick(RISK_TABLE, String(p.category || '').toLowerCase());
  }

  /** A step as one string: its action, then its cost and time. */
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
    return s;
  }

  /** A protocol's farm plan: ten steps, each an action with a cost and a time. */
  function farmSteps(p, scenario) {
    var chain = cheapestChain(p);
    var capital = Math.round(depositFor(p, scenario));
    var age = ageDays(R.as_of, p.listed_at);
    var hold = holdDaysFor(age);
    var gas = gasWords(chain);
    var gasUsd = gasFor(chain);
    var weeks = scenario.horizon_weeks;
    var chains = p.chains || [];
    var secondChain = chains.length > 1 ? chains[1] : null;
    var exit = R.exit_pct;
    var threshold = Math.round(p.tvl_usd * (1 + exit / 100));
    return [
      {
        text: 'Set up a fresh wallet for this farm alone and keep its seed phrase offline. Buy about $2 of ' + chain + ' gas on an exchange so the wallet can pay its first transactions.',
        cost: '$1.00 (one exchange withdrawal)',
        time: '10 minutes hands-on'
      },
      {
        text: 'Reach ' + p.name + ' from its DefiLlama page or its official accounts, bookmark the app, and match the contract addresses against its docs. Never sign an approval from a link sent in a message.',
        cost: 'free',
        time: '5 minutes hands-on'
      },
      {
        text: 'Move $' + capital + ' of USDC to ' + chain + ' — from an exchange that supports it, or by bridging from Ethereum with a large bridge that lists ' + chain + '.',
        cost: '$1.00 (one exchange withdrawal) plus ' + gas,
        time: '10 minutes hands-on; 2-20 minutes to arrive'
      },
      {
        text: 'Strategy risk: ' + riskFor(p),
        cost: 'free (reading only; the deposit is the capital at risk)',
        time: '10 minutes hands-on'
      },
      {
        text: actionFor(p, capital, chain) + ' Start with a $100 test, then size up to the full $' + capital + ' (the plan size is ' + (100 * (capital / Math.max(1, p.tvl_usd))).toFixed(3) + '% of its ' + fmtUsd(p.tvl_usd) + ' TVL) and hold it for at least ' + hold + ' days.',
        cost: '$' + capital + ' of capital and about $' + (3 * gasUsd).toFixed(2) + ' of gas (3 transactions)',
        time: '15 minutes hands-on'
      },
      {
        text: secondChain !== null
          ? 'Deepen the footprint: repeat a smaller deposit on ' + secondChain + ', the protocol\'s second chain, so the same wallet shows activity on more than one chain.'
          : 'Deepen the footprint: post the receipt token where ' + p.name + ' lists a points boost (a lending market or a pool), but never loop it more than once.',
        cost: 'about $' + (2 * gasUsd).toFixed(2) + ' of gas (2 transactions)',
        time: '10 minutes hands-on'
      },
      {
        text: 'Touch the position once a week for ' + weeks + ' weeks: ' + weeklyFor(p) + ' A steady wallet reads better than one deposit.',
        cost: gas + ' a week',
        time: '5 minutes a week for ' + weeks + ' weeks'
      },
      {
        text: 'Exit rule: withdraw if ' + p.name + '\'s TVL prints below ' + fmtUsd(threshold) + ', which is ' + exit.toFixed(1) + '% from today\'s ' + fmtUsd(p.tvl_usd) + ' and a week worse than 95% of this snapshot\'s protocols. Also withdraw if withdrawals pause or the team goes quiet.',
        cost: 'free',
        time: '5 minutes a week for ' + weeks + ' weeks'
      },
      {
        text: 'Keep a ledger from the first transaction: date, transaction hash, asset, amount and dollar value of every top-up, claim and withdrawal. A claim may ask the wallet to prove its history.',
        cost: 'nothing but the log',
        time: '5 minutes'
      },
      {
        text: 'Claim only from ' + p.name + '\'s own points page, reached from its official accounts. Never pay to claim, and remember a drop is taxable income in many places at its value on the day it arrives.',
        cost: gas + ' (1 transaction)',
        time: '10 minutes'
      }
    ];
  }

  /** The plan's costed economics: 19 chain transactions + $2 withdrawals, 195 minutes. */
  function planEconomics(p, implied, scenario) {
    var deposit = depositFor(p, scenario);
    var gas = gasFor(cheapestChain(p));
    var fees = 2 + 19 * gas;
    var hours = 195 / 60;
    var drop = implied * scenario.drop_share * (deposit / (deposit + p.tvl_usd));
    var net = drop - fees;
    var tbill = deposit * MODEL.tbill_rate * (scenario.horizon_weeks / 52);
    var netPerHour = net / hours;
    var verdict = net > tbill && netPerHour >= MODEL.farm_net_per_hour ? 'FARM' : net <= 0 ? 'SKIP' : 'MARGINAL';
    return { deposit: deposit, drop: drop, fees: fees, hours: hours, net: net, tbill: tbill, net_per_hour: netPerHour, verdict: verdict };
  }

  /** One row's verdict under a scenario, recomputed here from its raw figures. */
  function verdictFor(row, scenario) {
    return planEconomics(row, impliedOf(row), scenario);
  }

  // ------------------------------------------------------------ the integrity strip

  /** Recompute every row in the browser and prove the board matches. */
  function recomputeAll() {
    var rows = R.rows;
    var mismatches = 0;
    var totalStored = 0;
    var totalRecomputed = 0;
    var prevStored = Infinity;
    var nudgesOk = true;
    var orderOk = true;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var raw = Math.max(1, Math.round(valueIfLaunches(row) * oddsOf(row)));
      var recomputed = raw + (row.tie_nudge || 0);
      totalStored += row.implied_value_usd;
      totalRecomputed += recomputed;
      if (recomputed !== row.implied_value_usd) mismatches++;
      if (row.rank !== i + 1) orderOk = false;
      if (row.implied_value_usd >= prevStored) orderOk = false;
      // The tie-break rule: a nudge only when the raw value would tie or outrank the row above.
      var expectedNudge = raw >= prevStored ? prevStored - 1 - raw : 0;
      if ((row.tie_nudge || 0) !== expectedNudge) nudgesOk = false;
      prevStored = row.implied_value_usd;
    }
    var watchlist = 0;
    var wl = {};
    for (var j = 0; j < R.watchlist.length; j++) wl[R.watchlist[j]] = true;
    for (var k = 0; k < rows.length; k++) if (wl[rows[k].slug]) watchlist++;
    var ledger = 0;
    var acc = R.accounting || [];
    for (var m = 0; m < acc.length; m++) ledger += acc[m].count;
    return {
      rows: rows.length,
      mismatches: mismatches,
      totalsEqual: totalStored === totalRecomputed,
      total: totalStored,
      orderOk: orderOk,
      nudgesOk: nudgesOk,
      watchlist: watchlist,
      watchlistSize: R.watchlist_size,
      ledger: ledger,
      ok: mismatches === 0 && totalStored === totalRecomputed && orderOk && nudgesOk && watchlist === R.watchlist_size
    };
  }

  window.RadarModel = {
    fmtUsd: fmtUsd,
    ageDays: ageDays,
    growthPct: growthPct,
    ageYears: ageYears,
    gasFor: gasFor,
    cheapestChain: cheapestChain,
    valueIfLaunches: valueIfLaunches,
    oddsOf: oddsOf,
    impliedOf: impliedOf,
    defaultScenario: defaultScenario,
    depositFor: depositFor,
    farmSteps: farmSteps,
    stepText: stepText,
    planEconomics: planEconomics,
    verdictFor: verdictFor,
    recomputeAll: recomputeAll
  };
})();
