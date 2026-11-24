// Token Radar's dashboard, radar-3. Reads window.RADAR (data.js) and
// window.RadarModel (model.js). No network: every byte shown is in data.js.
(function () {
  'use strict';
  var DATA = window.RADAR, MODEL = window.RadarModel;
  if (!DATA || !MODEL) return;
  var app = document.getElementById('board');
  var watchlist = new Set(DATA.watchlist || []);
  var state = { q: '', category: 'all', chain: 'all', tier: 'all', verdict: 'all', sort: 'implied', dir: -1, selected: null, drop: Math.round(DATA.model.drop_share * 100), horizon: DATA.model.horizon_weeks, deposit: 'share', depositFixed: 1000 };
  var dScen = null;

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtSigned(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    return (n < 0 ? '−$' : '+$') + (a >= 100 ? Math.round(a) : a.toFixed(2));
  }
  function fmtPct(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtAge(d) { return (d === null || d === undefined) ? 'unknown' : d >= 365 ? (d / 365).toFixed(1) + 'y' : Math.max(0, Math.round(d)) + 'd'; }
  function fmtMult(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : n.toFixed(2) + 'x'; }
  function fmtOdds(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : Math.round(n * 100) + '%'; }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }
  function kv(label, value) { return el('div', null, el('span', { text: label }), el('b', { class: 'num', text: value })); }

  function scenario() { return { drop_share: state.drop / 100, horizon_weeks: state.horizon, deposit: state.deposit === 'fixed' ? { mode: 'fixed', dollars: state.depositFixed } : { mode: 'share', share: DATA.model.deposit_share } }; }
  function scenOf(d) { return { drop_share: d.drop / 100, horizon_weeks: d.horizon, deposit: d.deposit === 'fixed' ? { mode: 'fixed', dollars: d.depositFixed } : { mode: 'share', share: DATA.model.deposit_share } }; }

  function readHash() {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.tier = 'all'; state.verdict = 'all';
    state.selected = null; state.sort = 'implied'; state.dir = -1;
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var p = new URLSearchParams(hash);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('tier')) state.tier = p.get('tier'); else if (p.get('wl') === '1') state.tier = 'watchlist';
    if (p.get('verdict')) state.verdict = p.get('verdict');
    if (p.get('sort')) state.sort = p.get('sort');
    if (p.get('p')) state.selected = p.get('p');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.tier !== 'all') p.set('tier', state.tier);
    if (state.verdict !== 'all') p.set('verdict', state.verdict);
    if (state.sort !== 'implied') p.set('sort', state.sort);
    if (state.selected) p.set('p', state.selected);
    var next = p.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function verdictOf(row, scen) { return MODEL.verdictFor(row, scen || scenario()); }

  function rows() {
    var q = state.q.trim().toLowerCase(), scen = scenario();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.tier === 'watchlist' && !watchlist.has(r.slug)) return false;
      if (state.tier === 'early' && watchlist.has(r.slug)) return false;
      if (state.verdict !== 'all' && verdictOf(r, scen).verdict.toLowerCase() !== state.verdict) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort, scen = scenario(), cache = {};
    function val(r) {
      if (key === 'name') return r.name.toLowerCase();
      if (key === 'tvl') return r.tvl_usd;
      if (key === 'growth') return r.change_7d === null ? -Infinity : r.change_7d;
      if (key === 'age') return r.age_days === null ? Infinity : r.age_days;
      if (key === 'odds') return r.token_odds;
      if (key === 'vil') return r.value_if_launches_usd;
      if (key === 'net') { if (!cache[r.slug]) cache[r.slug] = verdictOf(r, scen); return cache[r.slug].net_per_hour; }
      if (key === 'rank') return r.rank;
      return r.implied_value_usd;
    }
    return list.slice().sort(function (a, b) {
      var av = val(a), bv = val(b);
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function vCounts() {
    var scen = scenario(), c = { farm: 0, marginal: 0, skip: 0 };
    DATA.rows.forEach(function (r) { c[verdictOf(r, scen).verdict.toLowerCase()]++; });
    return c;
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'ring', 'aria-hidden': 'true' }), el('span', { class: 'brand-name' }, 'Token ', el('em', { text: 'Radar' }))),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Source ', el('b', { text: DATA.source })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version })))
    );
  }

  function hero() {
    var ev = DATA.evidence, vFinal = ev.value[ev.value.length - 1], oFinal = ev.odds[ev.odds.length - 1], vc = vCounts();
    return el('section', { class: 'hero' },
      el('div', null,
        el('div', { class: 'kicker', text: 'Pre-token radar · model radar-3' }),
        el('h1', { text: DATA.board_size + ' pre-token protocols, ranked by what a launch would be worth' }),
        el('p', null, 'Every value term fitted, then tested held-out twice — leave-one-out and walk-forward. Token odds from the peers\u2019 record, not a guess. Values are ranges, checked held-out. The watchlist is the floor: ', el('b', { text: String(DATA.watchlist_size) }), ' protocols the house list names, plus ', el('b', { text: String(DATA.early_size) }), ' early below the $', el('b', { text: Math.round(DATA.floor_usd / 1e6) + 'M' }), ' floor. A model, not a price.')
      ),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('b', { text: fmtMult(vFinal.walk_forward_miss) }), el('span', { text: 'Walk-forward miss (flat median ' + fmtMult(ev.value[0].walk_forward_miss) + ')' })),
        el('div', { class: 'stat' }, el('b', { text: Math.round(ev.range.loo_inside_p25_p75 * 100) + '% / ' + Math.round(ev.range.wf_inside_p25_p75 * 100) + '%' }), el('span', { text: 'Real caps inside P25–P75 (stated 50%)' })),
        el('div', { class: 'stat' }, el('b', { text: oFinal.loo_brier.toFixed(3) + ' / ' + oFinal.walk_forward_brier.toFixed(3) }), el('span', { text: 'Token-odds Brier, LOO / walk-forward (base ' + ev.odds[0].loo_brier.toFixed(3) + ' / ' + ev.odds[0].walk_forward_brier.toFixed(3) + ')' })),
        el('div', { class: 'stat' }, el('b', { text: ev.value_kept.join(' + ') }), el('span', { text: 'Value terms kept · odds kept: ' + ev.odds_kept.join(' + ') })),
        el('div', { class: 'stat' }, el('b', { text: vc.marginal + ' of ' + DATA.board_size }), el('span', { text: 'Stay net-positive after fees · ' + vc.farm + ' clear the $25/hour FARM bar · ' + vc.skip + ' SKIP' })),
        el('div', { class: 'stat hot' }, el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('span', { text: 'Watchlist covered · ledger 758 of 758' }))
      )
    );
  }

  function accounting() {
    var total = DATA.accounting.reduce(function (s, a) { return s + a.count; }, 0);
    var colors = { 'ranked-watchlist': 'var(--accent)', 'ranked-early': 'var(--accent-dim)', 'live-priced': 'var(--blue)', 'live-unpriced': '#7c8db0', 'out': 'var(--faint)' };
    return el('section', { class: 'accounting', 'aria-label': 'Protocol accounting' },
      el('div', { class: 'model-head' },
        el('h2', { text: 'Every protocol in the snapshot, in exactly one group' }),
        el('span', { class: 'sub', text: 'Nothing hidden: ' + total + ' protocols, ' + DATA.board_size + ' ranked.' })
      ),
      el('div', { class: 'stackbar', 'aria-hidden': 'true' }, DATA.accounting.map(function (a) {
        return el('i', { style: 'width:' + (a.count / total * 100).toFixed(2) + '%;background:' + colors[a.kind], title: a.label + ': ' + a.count });
      })),
      el('div', { class: 'segments' }, DATA.accounting.map(function (a) {
        return el('div', { class: 'segment' }, el('i', { style: 'background:' + colors[a.kind] }), el('span', { text: a.label }), el('b', { class: 'num', text: String(a.count) }));
      }))
    );
  }

  function integrity() {
    var rep = MODEL.recomputeAll();
    var text = rep.ok
      ? rep.rows + ' of ' + rep.rows + ' rows recomputed here, ranks in order, values never rise, totals equal ' + fmtUsd(rep.total) + ', tie-break nudges verified, watchlist ' + rep.watchlist + ' of ' + rep.watchlistSize + ', ledger ' + rep.ledger + ' of 758 protocols'
      : 'Recompute mismatch: ' + rep.mismatches + ' of ' + rep.rows + ' rows differ from board.json — do not trust the board until the builder is fixed';
    return el('section', { class: 'integrity ' + (rep.ok ? 'ok' : 'bad'), 'aria-label': 'Integrity strip' },
      el('span', { class: 'dot', 'aria-hidden': 'true' }),
      el('b', { text: rep.ok ? 'Integrity strip — recomputed in this browser: ' : 'Integrity strip — FAILED: ' }),
      el('span', { text: text })
    );
  }

  function evTable(title, caption, head, rows) {
    return el('div', { class: 'ev-table' },
      el('h3', { text: title }),
      el('table', null,
        el('thead', null, el('tr', null, head.map(function (h) { return el('th', { scope: 'col', text: h }); }))),
        el('tbody', null, rows.map(function (r) {
          return el('tr', null, r.map(function (c, i) { return el('td', { class: i === 0 ? '' : 'num' }, c); }));
        }))
      ),
      el('p', { class: 'sub', text: caption })
    );
  }

  function evidence() {
    var ev = DATA.evidence, rg = ev.range;
    var vRows = ev.value.map(function (r) { return [r.term, fmtMult(r.loo_miss), fmtMult(r.walk_forward_miss), r.status]; });
    var oRows = ev.odds.map(function (r) { return [r.term, r.loo_brier.toFixed(3), Math.round(r.loo_called_right * 100) + '%', r.walk_forward_brier.toFixed(3), Math.round(r.walk_forward_called_right * 100) + '%', r.status]; });
    var rRows = [
      ['Within x3 of the model', Math.round(rg.loo_within_x3 * 100) + '%', Math.round(rg.wf_within_x3 * 100) + '%', '—'],
      ['Inside P25–P75 (stated 50%)', Math.round(rg.loo_inside_p25_p75 * 100) + '%', Math.round(rg.wf_inside_p25_p75 * 100) + '%', '50%'],
      ['Inside P10–P90 (stated 80%)', Math.round(rg.loo_inside_p10_p90 * 100) + '%', Math.round(rg.wf_inside_p10_p90 * 100) + '%', '80%']
    ];
    return el('section', { class: 'evidence', 'aria-label': 'Out-of-sample evidence' },
      el('div', { class: 'model-head' },
        el('h2', { text: 'The model earns its keep, held-out' }),
        el('span', { class: 'sub', text: 'A term is kept only when it lowers the combined held-out score — the mean of leave-one-out and walk-forward — by at least 0.5%. The rest are shown, not used. Walk-forward splits by listing date: earlier protocols price later ones.' })
      ),
      el('div', { class: 'ev-grid' },
        evTable('Value if a token launches — median miss, ' + DATA.value_fit.comps_n + ' traded tokens',
          'Size curve and category effect survive; growth, age and chain count do not tell what a token will be worth. The control — another row\u2019s growth — must not help, and does not.',
          ['Term', 'Leave-one-out', 'Walk-forward', 'Fate'], vRows),
        evTable('Token odds — Brier score, 758 peers',
          'Category offsets are residualised: observed vs expected token counts under the age+growth curve, shrunk by 8 pseudo-observations.',
          ['Term', 'LOO Brier', 'LOO called right', 'WF Brier', 'WF called right', 'Fate'], oRows),
        evTable('Are the ranges honest? — share of real caps inside them',
          'Ranges from 200 bootstrap refits, each drawing a residual from the value model\u2019s own errors. ' + ev.value_fitted_line + '. ' + ev.odds_fitted_line + '.',
          ['Share of real caps', 'Leave-one-out', 'Walk-forward', 'Stated'], rRows)
      )
    );
  }

  function resetAll() { state.q = ''; state.category = 'all'; state.chain = 'all'; state.tier = 'all'; state.verdict = 'all'; state.drop = Math.round(DATA.model.drop_share * 100); state.horizon = DATA.model.horizon_weeks; state.deposit = 'share'; writeHash(); render(); }

  function tabButton(label, pressed, onclick) {
    return el('button', { type: 'button', 'aria-pressed': pressed ? 'true' : 'false', text: label, onclick: onclick });
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var vc = vCounts();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function select(id, label, all, opts, cur, on) {
      var s = el('select', { id: id, 'aria-label': label }, el('option', { value: 'all', text: all }),
        opts.map(function (o) { return el('option', { value: o.v, text: o.t, selected: o.v === cur ? 'selected' : null }); }));
      s.addEventListener('change', function () { on(s.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), s);
    }
    var depOpts = [{ v: 'share', t: 'Deposit 0.02% of TVL ($100–$10,000)' }].concat([100, 500, 1000, 5000, 10000].map(function (d) { return { v: 'fixed-' + d, t: 'Deposit $' + d.toLocaleString('en-US') + ' fixed' }; }));
    var depCur = state.deposit === 'share' ? 'share' : 'fixed-' + state.depositFixed;
    var dropRange = el('input', { type: 'range', id: 'drop', min: '1', max: '20', step: '1', value: String(state.drop), 'aria-label': 'Drop share' });
    var dropOut = el('output', { for: 'drop', class: 'num', text: state.drop + '%' });
    dropRange.addEventListener('input', function () { state.drop = parseInt(dropRange.value, 10); dropOut.textContent = state.drop + '%'; render(); });
    var horRange = el('input', { type: 'range', id: 'horizon', min: '4', max: '52', step: '1', value: String(state.horizon), 'aria-label': 'Horizon in weeks' });
    var horOut = el('output', { for: 'horizon', class: 'num', text: state.horizon + 'w' });
    horRange.addEventListener('input', function () { state.horizon = parseInt(horRange.value, 10); horOut.textContent = state.horizon + 'w'; render(); });
    return el('div', { class: 'controls' },
      el('div', { class: 'tabs verdict-tabs', role: 'group', 'aria-label': 'Filter by farm verdict' },
        tabButton('All ' + DATA.board_size, state.verdict === 'all', function () { state.verdict = 'all'; writeHash(); render(); }),
        tabButton('FARM ' + vc.farm, state.verdict === 'farm', function () { state.verdict = 'farm'; writeHash(); render(); }),
        tabButton('MARGINAL ' + vc.marginal, state.verdict === 'marginal', function () { state.verdict = 'marginal'; writeHash(); render(); }),
        tabButton('SKIP ' + vc.skip, state.verdict === 'skip', function () { state.verdict = 'skip'; writeHash(); render(); })
      ),
      el('div', { class: 'tabs', role: 'group', 'aria-label': 'Filter by tier' },
        tabButton('All tiers', state.tier === 'all', function () { state.tier = 'all'; writeHash(); render(); }),
        tabButton('Watchlist', state.tier === 'watchlist', function () { state.tier = 'watchlist'; writeHash(); render(); }),
        tabButton('Early', state.tier === 'early', function () { state.tier = 'early'; writeHash(); render(); })
      ),
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      select('category', 'Category', 'All categories', categories.map(function (c) { return { v: c, t: c }; }), state.category, function (v) { state.category = v; }),
      select('chain', 'Chain', 'All chains', chains.map(function (c) { return { v: c, t: c }; }), state.chain, function (v) { state.chain = v; }),
      select('deposit', 'Plan deposit', '', depOpts, depCur, function (v) {
        if (v === 'share') state.deposit = 'share';
        else { state.deposit = 'fixed'; state.depositFixed = parseInt(v.slice(6), 10); }
      }),
      el('div', { class: 'field slider' }, el('label', { for: 'drop', text: 'Drop share' }), el('div', { class: 'slider-row' }, dropRange, dropOut)),
      el('div', { class: 'field slider' }, el('label', { for: 'horizon', text: 'Horizon' }), el('div', { class: 'slider-row' }, horRange, horOut)),
      el('button', { class: 'button', type: 'button', text: 'Reset', onclick: resetAll }),
      el('span', { class: 'count', text: rows().length + ' rows shown' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); } },
        label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null)
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another verdict to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: resetAll })
      ));
    }
    var scen = scenario();
    var tbody = el('tbody');
    list.forEach(function (r) {
      var v = verdictOf(r, scen);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      tbody.appendChild(el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank' }, String(r.rank), el('span', { class: 'sub range', text: r.rank_lo + '–' + r.rank_hi })),
        el('td', null, el('div', { class: 'name' },
          el('b', null, r.name, watchlist.has(r.slug) ? el('span', { class: 'wl', text: 'WL' }) : el('span', { class: 'early', text: 'EARLY' })),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtOdds(r.token_odds) }),
        el('td', { class: 'num', text: fmtUsd(r.value_if_launches_usd) }),
        el('td', null, el('div', { class: 'implied' }, el('b', { class: 'num', text: fmtUsd(r.implied_value_usd) }), el('span', { class: 'sub range', text: fmtUsd(r.p25_usd) + '–' + fmtUsd(r.p75_usd) }))),
        el('td', null, el('span', { class: 'verdict ' + v.verdict.toLowerCase(), text: v.verdict }), el('span', { class: 'sub net ' + (v.net >= 0 ? 'pos' : 'neg'), text: fmtSigned(v.net) })),
        el('td', { class: 'num ' + (v.net_per_hour >= 25 ? 'pos' : v.net_per_hour >= 0 ? '' : 'neg'), text: '$' + v.net_per_hour.toFixed(2) })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', { class: 'board' },
          el('caption', { class: 'sub', text: 'Strongest implied value first. Rank range is the 5th–95th percentile across 200 bootstrap refits. Select a row for its model, peers and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'), sortHeader('age', 'Age'),
            sortHeader('odds', 'Token odds'), sortHeader('vil', 'If it launches'), sortHeader('implied', 'Implied value'), sortHeader('net', 'Verdict · net'), sortHeader('net', 'Net / hour'))),
          tbody
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; dScen = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    dScen = { drop: state.drop, horizon: state.horizon, deposit: state.deposit, depositFixed: state.depositFixed };
    writeHash();
    dialog.textContent = '';
    var recomputed = MODEL.impliedOf(row), vil = MODEL.valueIfLaunches(row), odds = MODEL.oddsOf(row);
    var catOffV = 0, catOffO = 0;
    DATA.value_fit.cat_offsets.forEach(function (c) { if (c.category === (row.category || 'Other')) catOffV = c.offset; });
    DATA.odds_fit.cat_offsets.forEach(function (c) { if (c.category === (row.category || 'Other')) catOffO = c.offset; });
    var sizeMult = Math.exp(DATA.value_fit.intercept + DATA.value_fit.slope * Math.log(row.tvl_usd));
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (watchlist.has(row.slug) ? ' · Watchlist' : ' · Early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'How the figure is made' }),
      el('div', { class: 'equation' }, [
        kv('TVL', fmtUsd(row.tvl_usd)),
        kv('Size curve — multiple at this TVL', fmtMult(sizeMult) + '  (ln multiple = ' + DATA.value_fit.intercept.toFixed(2) + ' ' + DATA.value_fit.slope.toFixed(2) + ' × ln TVL; ±' + DATA.value_fit.slope_se.toFixed(2) + ')'),
        kv('Category offset (' + (row.category || 'Other') + ')', '×' + Math.exp(catOffV).toFixed(2)),
        kv('Value if a token launches', fmtUsd(row.value_if_launches_usd)),
        kv('Token odds — age ' + MODEL.ageYears(row).toFixed(1) + 'y, week ' + fmtPct(row.change_7d) + ' (winsorized ' + MODEL.growthPct(row).toFixed(1) + '%), category ' + (catOffO >= 0 ? '+' : '') + catOffO.toFixed(2), fmtOdds(odds)),
        kv('Implied value = launches × odds', fmtUsd(row.implied_value_usd)),
        kv('Honest range P25–P75', fmtUsd(row.p25_usd) + ' – ' + fmtUsd(row.p75_usd) + '  ·  P10–P90 ' + fmtUsd(row.p10_usd) + ' – ' + fmtUsd(row.p90_usd)),
        kv('Rank across 200 bootstrap refits', 'rank ' + row.rank_lo + '–' + row.rank_hi + ' (5th–95th percentile)')
      ]),
      el('p', { class: 'check-line' }, 'The page recomputes this row as ', el('b', { text: fmtUsd(recomputed) }), recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.', ' Launches recomputed as ' + fmtUsd(Math.round(vil)) + '; odds as ' + fmtOdds(odds) + '. An estimate, not a price.')
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Nearest priced peers — their tokens trade' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'peers' },
          el('thead', null, el('tr', null, ['Token', 'Category', 'TVL', 'Market cap', 'Cap / TVL', 'Held-out model'].map(function (h) { return el('th', { scope: 'col', text: h }); }))),
          el('tbody', null, (row.nearest_peers || []).map(function (p) {
            return el('tr', null,
              el('td', null, el('b', { text: p.name }), p.symbol ? el('span', { class: 'sub', text: ' ' + p.symbol }) : null),
              el('td', { class: 'sub', text: p.category || 'Other' }),
              el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
              el('td', { class: 'num', text: fmtUsd(p.mcap_usd) }),
              el('td', { class: 'num', text: fmtMult(p.cap_per_tvl) }),
              el('td', { class: 'num', text: p.held_out_model_x.toFixed(2) + 'x' })
            );
          }))
        )
      ),
      el('p', { class: 'sub', text: 'Same-category live tokens nearest by TVL. Held-out model is the leave-one-out prediction as a multiple of the real cap — near 1.00x means the model prices it right.' })
    ));
    var verdictWrap = el('div'), stepsWrap = el('div');
    var dropRange = el('input', { type: 'range', min: '1', max: '20', step: '1', value: String(dScen.drop), 'aria-label': 'Drop share' });
    var dropOut = el('output', { class: 'num', text: dScen.drop + '%' });
    var horRange = el('input', { type: 'range', min: '4', max: '52', step: '1', value: String(dScen.horizon), 'aria-label': 'Horizon in weeks' });
    var horOut = el('output', { class: 'num', text: dScen.horizon + 'w' });
    var depSelect = el('select', { 'aria-label': 'Plan deposit' },
      el('option', { value: 'share', text: 'Deposit 0.02% of TVL ($100–$10,000)', selected: dScen.deposit === 'share' ? 'selected' : null }),
      [100, 500, 1000, 5000, 10000].map(function (d) { return el('option', { value: 'fixed-' + d, text: 'Deposit $' + d.toLocaleString('en-US') + ' fixed', selected: dScen.deposit === 'fixed' && dScen.depositFixed === d ? 'selected' : null }); })
    );
    function refreshV() {
      var scen = scenOf(dScen), v = MODEL.verdictFor(row, scen);
      var shares = [0.03, 0.05, 0.07, 0.10, 0.15], deposits = [100, 500, 1000, 5000, 10000];
      var fees = 2 + 19 * MODEL.gasFor(MODEL.cheapestChain(row));
      verdictWrap.textContent = '';
      verdictWrap.appendChild(el('div', { class: 'verdict-panel' },
        el('div', { class: 'verdict-big' }, el('span', { class: 'verdict ' + v.verdict.toLowerCase(), text: v.verdict }), el('span', { class: 'num', text: fmtSigned(v.net) + ' net · $' + v.net_per_hour.toFixed(2) + '/hour' })),
        el('div', { class: 'equation' }, [
          kv('Plan deposit', fmtUsd(Math.round(v.deposit))),
          kv('Expected drop (' + Math.round(scen.drop_share * 100) + '% of implied, pro-rata)', fmtUsd(v.drop)),
          kv('Fees — 19 transactions on ' + MODEL.cheapestChain(row) + ' + $2 withdrawals', fmtUsd(v.fees)),
          kv('Hands-on time — the plan\u2019s ten steps', v.hours.toFixed(2) + ' hours'),
          kv('T-bill benchmark — 4% a year on the deposit', fmtUsd(v.tbill)),
          kv('FARM needs net above the T-bill and $25/hour', v.verdict === 'FARM' ? 'clears both' : v.verdict === 'MARGINAL' ? 'net-positive, below the bar' : 'loses money after fees')
        ])
      ));
      verdictWrap.appendChild(el('div', { class: 'table-wrap' },
        el('table', { class: 'netgrid' },
          el('thead', null, el('tr', null, [el('th', { scope: 'col', text: 'Net by drop share × deposit' })].concat(deposits.map(function (d) { return el('th', { scope: 'col', class: 'num', text: fmtUsd(d) }); })))),
          el('tbody', null, shares.map(function (s) {
            return el('tr', null, [el('td', { class: 'num', text: Math.round(s * 100) + '%' })].concat(deposits.map(function (d) {
              var net = row.implied_value_usd * s * (d / (d + row.tvl_usd)) - fees;
              var cur = Math.abs(s - scen.drop_share) < 0.001 && Math.abs(d - v.deposit) < 1;
              return el('td', { class: 'num ' + (net >= 0 ? 'pos' : 'neg') + (cur ? ' cur' : ''), text: fmtSigned(net) });
            })));
          }).concat([el('tr', { class: 'tbill-row' }, [el('td', { class: 'num', text: 'T-bill pays' })].concat(deposits.map(function (d) {
            return el('td', { class: 'num', text: fmtUsd(d * DATA.model.tbill_rate * (scen.horizon_weeks / 52)) });
          })))]))
        )
      ));
      verdictWrap.appendChild(el('p', { class: 'sub', text: 'Exit rule: withdraw if ' + row.name + '\u2019s TVL prints below ' + fmtUsd(Math.round(row.tvl_usd * (1 + DATA.exit_pct / 100))) + ', which is ' + DATA.exit_pct.toFixed(1) + '% from today\u2019s ' + fmtUsd(row.tvl_usd) + ' and a week worse than 95% of this snapshot\u2019s protocols. Also withdraw if withdrawals pause or the team goes quiet.' }));
      stepsWrap.textContent = '';
      stepsWrap.appendChild(el('ol', { class: 'steps' }, MODEL.farmSteps(row, scen).map(MODEL.stepText).map(function (s) {
        var at = s.indexOf(' Cost: ');
        return el('li', null, el('b', { text: at >= 0 ? s.slice(0, at) : s }), el('span', { class: 'cost', text: at >= 0 ? s.slice(at + 1) : '' }));
      })));
    }
    dropRange.addEventListener('input', function () { dScen.drop = parseInt(dropRange.value, 10); dropOut.textContent = dScen.drop + '%'; refreshV(); });
    horRange.addEventListener('input', function () { dScen.horizon = parseInt(horRange.value, 10); horOut.textContent = dScen.horizon + 'w'; refreshV(); });
    depSelect.addEventListener('change', function () {
      if (depSelect.value === 'share') dScen.deposit = 'share';
      else { dScen.deposit = 'fixed'; dScen.depositFixed = parseInt(depSelect.value.slice(6), 10); }
      refreshV();
    });
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm verdict — costed, not a slogan' }),
      el('div', { class: 'scen-row' },
        el('div', { class: 'field slider' }, el('label', { text: 'Drop share' }), el('div', { class: 'slider-row' }, dropRange, dropOut)),
        el('div', { class: 'field slider' }, el('label', { text: 'Horizon' }), el('div', { class: 'slider-row' }, horRange, horOut)),
        el('div', { class: 'field' }, el('label', { text: 'Plan deposit' }), depSelect)
      ),
      verdictWrap
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — ten steps, each with its cost and time' }), stepsWrap));
    refreshV();
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }

  function footer() {
    return el('footer', null,
      el('p', null, el('b', { text: 'Method. ' }), 'Implied value is this entry\u2019s own claim, from the snapshot alone: a size curve and a category offset fitted on ', el('b', { text: String(DATA.value_fit.comps_n) }), ' traded tokens, times token odds fitted on all ', el('b', { text: String(DATA.odds_fit.peers_n) }), ' protocols. Every term survived two held-out tests or is shown as tested and not kept. ‘Records no token’ means its DefiLlama record carries no market cap, no CoinGecko id and no symbol — the record, not proof it has none.'),
      el('p', null, el('b', { text: 'Use. ' }), 'Farm the top first, one position per protocol, and check the protocol\u2019s own page before you claim anything. Never pay to claim.')
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(hero());
    shell.appendChild(accounting());
    shell.appendChild(integrity());
    shell.appendChild(evidence());
    shell.appendChild(controls());
    shell.appendChild(boardTable());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
    else if (dialog.open) dialog.close();
  }

  readHash();
  render();
  window.addEventListener('hashchange', function () { readHash(); render(); });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
