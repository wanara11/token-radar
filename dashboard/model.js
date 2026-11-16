// The token radar's model, for the page: the same derivation lib/model.ts runs, in plain
// JavaScript, so the dashboard recomputes every row it shows and the page's numbers are the
// board's numbers. No network, no clock, no randomness: the same data in gives the same page out.
//
// The model, in one line:
//   implied = round(tvl_usd x categoryMultiple x growthMult x maturityMult)
// where categoryMultiple is the median market-cap-per-TVL of the live-token protocols in the
// row's own category (learned from the snapshot, clamped to [0.05, 1.0], the global median when
// the category has too few live protocols to learn from), growthMult follows the seven-day TVL
// change clamped to [-60, 120] per cent, and maturityMult follows how long the protocol has run
// with no token (age in days, capped at 1095, unknown age counts as 365).
//
// The farm plan is derived the same way: the protocol's category, chains, TVL and age decide the
// action, the capital, the hold and every cost and time. No protocol name is special-cased.
(function (root) {
  'use strict';

  /** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
  function ageDays(asOf, listedAt) {
    if (listedAt === null || listedAt === undefined) return null;
    var a = Date.parse(asOf + 'T00:00:00Z');
    var b = Date.parse(listedAt + 'T00:00:00Z');
    if (!isFinite(a) || !isFinite(b)) return null;
    return Math.max(0, Math.floor((a - b) / 86400000));
  }

  /** The implied value of one row, recomputed from its own figures and the model's constants. */
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity));
  }

  /** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }

  /** The first chain a protocol names, or a neutral phrase. */
  function chainOf(p) {
    return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain';
  }

  /** What one transaction costs on a chain, in the words a farmer budgets by. */
  function gasFor(chain) {
    var c = String(chain).toLowerCase();
    if (c === 'ethereum') return 'about $6 of gas';
    if (c === 'solana') return 'under $0.10 of gas';
    if (c === 'arbitrum' || c === 'optimism' || c === 'base' || c === 'polygon' || c === 'blast' || c === 'scroll' || c === 'linea' || c === 'zksync era' || c === 'mode') return 'under $1 of gas';
    if (c === 'bsc' || c === 'avalanche' || c === 'fantom' || c === 'gnosis') return 'under $0.50 of gas';
    return 'about $2 of gas';
  }

  /** How much capital one farm position needs, from the protocol's own TVL. */
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }

  /** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }

  /** The category's one action, in the words a farmer can follow. */
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and borrow $10 against it, then repay the borrow the same week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0 || c.indexOf('swap') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and swap $10 through it once.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('yield aggregator') >= 0) return 'Deposit $' + capital + " into " + name + "'s highest-TVL yield vault on " + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app once.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('vault') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' risk vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s basis vault on " + chain + ' and keep the position.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }

  /** The category's weekly qualifying action, in the words a farmer can follow. */
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $5 against the supply, repay it, and leave the supply in place.';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0 || c.indexOf('swap') >= 0) return 'Swap $10 through the pool and add $5 of liquidity if the range moved.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('yield aggregator') >= 0) return 'Harvest the vault yield and re-deposit it into the same vault.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $10 to the chain and use the destination app once.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Check the staking rewards and restake what has accrued.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Open one $5 position and close it the same week.';
    if (c.indexOf('prediction') >= 0) return 'Settle one market and place one new position.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('vault') >= 0) return 'Check the vault allocation and add $5 if the strategy changed.';
    if (c.indexOf('stable') >= 0) return 'Mint or redeem $10 of the stable asset through the protocol.';
    if (c.indexOf('rwa') >= 0) return 'Check the yield that accrued and leave the asset in place.';
    if (c.indexOf('insurance') >= 0) return 'Check the policy and the covered amount are still active.';
    if (c.indexOf('risk') >= 0) return 'Review the vault risk report and leave the deposit in place.';
    if (c.indexOf('basis') >= 0) return 'Check the basis position and the funding it earned.';
    return 'Make one qualifying action: a deposit, a borrow, a swap or a vote.';
  }

  /** A protocol's farm plan: six steps, each an action with a cost and a time. */
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction on ' + chain, time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: 'Each week, do one qualifying action: ' + weeklyFor(p), cost: gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  root.RadarModel = { ageDays: ageDays, impliedOf: impliedOf, stepText: stepText, chainOf: chainOf, gasFor: gasFor, capitalFor: capitalFor, holdDaysFor: holdDaysFor, actionFor: actionFor, weeklyFor: weeklyFor, farmSteps: farmSteps };
})(typeof window !== 'undefined' ? window : globalThis);
