/* ============================================================
   TASK 6 — HUD / UI shell  (folder: js/ui; contract: src/ui + src/App)
   Port of hud/components.py + the panels that read the shared store. Modules never call each other's DOM:
   everything here reads `Core.store` and calls the other modules' public functions.
   Re-render rule: a panel's HTML is only replaced when it actually changed; values that tick every 2 s are
   `data-live` spans, so buttons and forms are never rebuilt under the user's finger.
   ============================================================ */
(function () {
  'use strict';
  const { C, store, bus, actions, helpers } = Core, EV = C.EVENTS, TH = C.THRESHOLDS, $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ICON = { nominal: '✓', caution: '▲', critical: '✖', info: 'ℹ', na: '–' }, TXT = { nominal: 'Nominal', caution: 'Caution', critical: 'Critical', info: 'Info', na: 'Not tracked' };

  /* ---------- components ---------- */
  const chip = s => `<span class="chip ${s}"><span aria-hidden="true">${ICON[s]}</span>${TXT[s]}</span>`;
  /** source badge: a Source ID from the contract, or the simulated flag (every shown number carries one) */
  const src = (id, type) => {
    const s = id && store.get().sources.find(x => x.id === id), sim = !id || (type || (s && s.type)) === 'simulated';
    return id ? `<span class="src ${sim ? 'sim' : ''}" title="${esc(s ? s.name : id)}${sim ? ' · simulated data' : ''}">⌖ ${esc(id)}</span>` : `<span class="src sim" title="Generated demo data">⚙ Simulated</span>`;
  };
  const tvBadge = (id, what) => `<span class="src tv" title="Not in the source file: verify against ${esc(id)}">TO VERIFY · ${esc(id)}${what ? ' · ' + esc(what) : ''}</span>`;
  function ring(label, text, frac, status, safe, noChip) {
    let s = '';
    if (safe) { const [a, b] = safe; s = `<circle class="safe" cx="50" cy="50" r="47" pathLength="100" stroke-dasharray="${((b - a) * 100).toFixed(1)} 100" stroke-dashoffset="${(-a * 100).toFixed(1)}" transform="rotate(-90 50 50)"/>`; }
    return `<div class="ring ${status}"><svg viewBox="0 0 100 100" role="img" aria-label="${esc(label)} ${esc(text)} ${TXT[status]}"><circle class="track" cx="50" cy="50" r="38"/>${s}` +
      `<circle class="val" cx="50" cy="50" r="38" pathLength="100" stroke-dasharray="${(Math.max(0, Math.min(1, frac)) * 100).toFixed(1)} 100" transform="rotate(-90 50 50)"/><text x="50" y="56">${esc(text)}</text></svg><span class="lbl">${esc(label)}</span>${noChip ? '' : chip(status)}</div>`;
  }
  const toast = (level, html) => `<div class="toast ${level}" role="alert"><b aria-hidden="true">${ICON[level]}</b><div>${html}</div></div>`;
  const panel = (title, body, right) => `<header><h2>${esc(title)}</h2>${right || ''}</header>${body}`;

  /* ---------- keyed mounting ---------- */
  const cache = {};
  function mount(id, html, key) {
    const k = key === undefined ? html : key; if (cache[id] === k) return;
    cache[id] = k; const el = document.getElementById(id); if (el) el.innerHTML = typeof html === 'function' ? html() : html;
  }

  /* ---------- local UI state (never in the shared store) ---------- */
  const U = { logOpen: false, draft: { severity: null, type: 'pain', note: '' }, done: null, calibOpen: false, calib: { sleep: 3, mood: 3, stress: 3 }, treeOpen: false,
    handoff: false, alerts: [], intake: 1800, physio: null };

  /* ---------- panels ---------- */
  function topBar() {
    const s = store.get(), a = s.astronaut, c = s.comms, sum = Layers.summarize(Layers.compute(s.ui.activeSystem));
    const ct = c.state === 'online' ? '● Online' : c.state === 'delayed' ? `◐ Delayed ${c.delaySec}s` : '○ Offline';
    return `<span class="name">${esc(a.name)}</span><span class="muted">${esc(a.role)} · Mission day ${a.missionDay}/${a.missionTotalDays}</span>` +
      `<span class="comms ${c.state}">Earth link: ${ct}</span>${c.state === 'offline' ? '<span class="auto">Autonomous Mode</span>' : ''}` +
      `<span class="summary" aria-live="polite"><span class="muted">${esc(Layers.SYS_LABEL[s.ui.activeSystem])}</span><b style="color:var(--color-critical)">${sum.critical} critical</b><b style="color:var(--color-caution)">${sum.caution} caution</b></span>` +
      `<span class="sp"><span class="chip caution">Demo · not a medical device</span><button class="ghost sm" data-act="sources">Data sources</button></span>`;
  }

  function regionCard() {
    const s = store.get(), sel = s.ui.selectedRegion, sys = s.ui.activeSystem;
    if (!sel) return panel('Region details', `<div class="empty">Tap or click any part of the body to see its status, why, and what to do. Drag to rotate, scroll to zoom.</div>`);
    const info = Layers.compute(sys)[sel], r = Layers.reasonFor(sys, sel), st = info.status;
    const why = st === 'na' ? 'This layer does not track this region. Switch layer to see where it is monitored.' : st === 'nominal' ? 'Within the expected range. No action needed.' : (r ? r.reason : info.reason);
    let live = '';
    if (sys === 'respiratory' && sel === 'chest') live = `<div class="sys-rows"><div class="row"><span>ppCO₂</span><span><b data-live="ppCO2"></b> mmHg <small>limit &lt; ${TH.ppCO2.max}</small></span></div>` +
      `<div class="row"><span>ppO₂</span><span><b data-live="ppO2"></b> mmHg <small>${TH.ppO2.min}–${TH.ppO2.max}</small></span></div>` +
      `<div class="row"><span>SpO₂</span><span><b data-live="spo2"></b> % ${tvBadge('physionet-bidmc', 'limits')}</span></div></div>`;
    else if ((sys === 'immune' && Layers.TRACKED.immune.includes(sel)) || (sys === 'nervous' && sel === 'head')) live = `<div class="sys-rows"><div class="row"><span>Cumulative radiation</span><span><b data-live="msv"></b> mSv</span></div><div class="row"><span>Warning limit</span>${tvBadge('srag')}</div></div>`;
    else if (sys === 'cardiovascular' && sel === 'head') live = `<p class="callout">Vision changes or headaches here can point to raised pressure inside the skull. Log and report them.</p>`;
    const cm = r && st !== 'nominal' && st !== 'na' ? s.countermeasures.find(x => x.id === r.cm) : null;
    const plan = cm ? `<div class="plan"><div><b>Action plan</b><br>${esc(cm.name)} <small>· about ${cm.durationMin} min${cm.purpose ? ' to ' + esc(cm.purpose) : ''} · demo duration</small></div>` +
      (cm.done ? `<span class="chip nominal">✓ Done</span>` : Layers.active === cm.id ? `<button data-act="cm-finish" data-id="${cm.id}">Finish</button>` : `<button data-act="cm-start" data-id="${cm.id}">Start</button>`) + `</div>` : '';
    const rows = C.SYSTEMS.map(x => { const e = s.regionStatus[x][sel]; return `<div class="row"><span><i class="dot ${e.status}"></i>${esc(Layers.SYS_LABEL[x])}</span><small>${e.score}</small></div>`; }).join('');
    return panel('Region details', `<div class="card"><div class="title"><div><h3>${esc(helpers.regionLabel(sel))}</h3><span class="ar" dir="rtl">${esc(helpers.regionLabel(sel, 1))}</span></div>` +
      `<button class="ghost sm" data-act="close" aria-label="Close">✕</button></div>` +
      `<p class="key ${st}">${chip(st)} ${esc(Layers.KEY_MSG[st] || 'Not tracked here')}</p><p style="margin:0">${esc(why)}</p>` +
      (info.fromSymptom ? `<p class="callout">Raised by a symptom you logged.</p>` : '') + live + plan +
      `<details style="margin-top:8px"><summary>This region across all layers</summary><div class="sys-rows">${rows}</div></details>` +
      `<button class="wide ghost" style="margin-top:8px" data-act="log-open">Log a symptom here</button>` +
      `<div class="badges">${src(info.source, info.origin)}${info.origin === 'simulated' && info.source ? src() : ''}</div><small>Demo only. Not medical advice.</small></div>`);
  }

  function logSheet() {
    const sel = store.get().ui.selectedRegion, d = U.draft;
    const sev = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<div class="opt s-${Logging.bandStatus(n)}"><input type="radio" name="sev" id="sev${n}" value="${n}" ${d.severity === n ? 'checked' : ''}><label for="sev${n}">${n}</label></div>`).join('');
    const typ = Logging.TYPES.map(t => `<div class="opt"><input type="radio" name="type" id="t_${t[0]}" value="${t[0]}" ${d.type === t[0] ? 'checked' : ''}><label for="t_${t[0]}"><span aria-hidden="true">${t[2]}</span>${esc(t[1])}</label></div>`).join('');
    if (U.done) {
      const L = Logging.last, sym = store.get().symptoms.find(x => x.id === U.done);
      const sugg = (L && L.id === U.done ? L.suggestions : []).slice(0, 3);
      return panel('Symptom logged', `<p class="key ${sym ? Logging.bandStatus(sym.severity) : ''}">${sym ? esc(Logging.TYPE_LABEL[sym.type]) + ' ' + sym.severity + '/10 · ' + esc(helpers.regionLabel(sym.region)) : 'Removed'}</p>` +
        (L && L.id === U.done && Date.now() < L.until ? `<div class="undo-wrap"><button class="ghost wide" data-act="undo" data-id="${U.done}">Undo</button><span class="drain"></span></div>` : '') +
        (store.get().comms.state === 'offline' ? '<span class="auto">Autonomous Mode</span>' : '') +
        (sym && Logging.recurring(sym.region) ? '<p class="callout">Recurring pattern: this area was logged 3 or more times this week.</p>' : '') +
        `<ul class="sugg">${sugg.map(s => `<li data-u="${s.urgency}"><b>${esc(s.cause)}</b><small>${esc(Logging.URGENCY_LABEL[s.urgency])}</small><p>${esc(Logging.framing(s).lead)}</p><small>${esc(Logging.DISCLAIMER)} ${src(s.source)}${s.toVerify ? ' ' + tvBadge(s.source, 'urgency') : ''}</small></li>`).join('') || `<li><b>No matching rule.</b><small>${esc(Logging.DISCLAIMER)}</small></li>`}</ul>` +
        `<button class="wide" data-act="log-done">Done</button>`);
    }
    return panel('Log a symptom', `<h3 style="margin-bottom:8px">${esc(helpers.regionLabel(sel))}</h3>` +
      `<fieldset class="sev-grid"><legend>How strong is it? (1 mild – 10 severe)</legend>${sev}</fieldset>` +
      `<fieldset class="type-grid"><legend>What does it feel like?</legend>${typ}</fieldset>` +
      `<p class="muted" style="font-size:.82rem;margin:0 0 8px">Cabin now: ppCO₂ <span data-live="ppCO2"></span> · ppO₂ <span data-live="ppO2"></span> · <span data-live="temp"></span> °C ${src()}</p>` +
      `<input class="note" id="log-note" maxlength="200" placeholder="Add a note (optional)" value="${esc(d.note)}">` +
      `<div class="btns"><button id="log-confirm" ${d.severity ? '' : 'disabled'} style="flex:1">Confirm</button><button class="ghost" data-act="log-cancel">Cancel</button></div>`);
  }

  function cabin() {
    const e = store.get().environment, g = (v, lo, hi) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    const rings = ring('ppCO₂', e.ppCO2, g(e.ppCO2, 0, 6), e.status.ppCO2, [0, TH.ppCO2.max / 6]) + ring('ppO₂', e.ppO2, g(e.ppO2, 100, 200), e.status.ppO2, [(TH.ppO2.min - 100) / 100, (TH.ppO2.max - 100) / 100]) +
      ring('Temp °C', e.temp, g(e.temp, 0, 40), e.status.temp, [TH.temp.min / 40, TH.temp.max / 40]);
    return panel('Cabin environment', `<div class="rings">${rings}</div><p class="muted" style="font-size:.8rem;margin:8px 0">Limits: ppCO₂ &lt; ${TH.ppCO2.max} · ppO₂ ${TH.ppO2.min}–${TH.ppO2.max} mmHg · ${TH.temp.min}–${TH.temp.max} °C</p>` +
      `<p style="margin:6px 0 4px">Today’s intake ${U.intake} of ${TH.nutrition.baseline} ${TH.nutrition.unit} baseline</p><div class="bar" role="img" aria-label="Intake ${U.intake} of ${TH.nutrition.baseline} kcal"><i style="width:${Math.min(100, U.intake / TH.nutrition.baseline * 100).toFixed(0)}%"></i></div>`,
      `<span class="badges" style="margin:0">${src()}${src('eclss-ochmo')}</span>`);
  }

  function alerts() {
    return panel('Alerts', U.alerts.length ? U.alerts.map(a => toast(a.level, `${a.text}<small>${new Date(a.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ${src(a.sourceId)}</small>`)).join('') : `<div class="empty">No alerts. Cabin readings are being watched.</div>`);
  }

  function triagePanel() {
    const open = Logging.open(), c = store.get().comms.state;
    const body = !open.length ? `<div class="empty">Nothing logged. Triage runs on board and needs no link to Earth.</div>` :
      open.slice(0, 4).map(x => { const top = Logging.triage(Logging.inputFor(x.type, x.severity))[0], f = top && Logging.framing(top);
        return `<ul class="sugg"><li data-u="${top ? top.urgency : 'watch'}" style="list-style:none"><b>${esc(helpers.regionLabel(x.region))} · ${esc(Logging.TYPE_LABEL[x.type])} ${x.severity}/10</b>` +
          (top ? `<span>${esc(top.cause)}</span><small>${esc(Logging.URGENCY_LABEL[top.urgency])}</small><p>${esc(f.lead)}</p><small>${src(top.source)}${top.toVerify ? ' ' + tvBadge(top.source, 'urgency') : ''}</small>` : '<small>No matching rule.</small>') + `</li></ul>`; }).join('') + `<small>${esc(Logging.DISCLAIMER)}</small>`;
    return panel('Offline triage', body, c === 'offline' ? '<span class="auto">Autonomous Mode</span>' : '');
  }

  function history() {
    const list = store.get().symptoms.slice(0, 20);
    return panel('Recent symptoms', (list.length ? `<ul class="hist">${list.map(s => `<li class="${s.resolved ? 'resolved' : ''}"><i class="dot ${Logging.bandStatus(s.severity)}"></i><div><b>${esc(helpers.regionLabel(s.region))}</b> · ${esc(Logging.TYPE_LABEL[s.type] || s.type)}<small>${Logging.ago(s.time)}${s.note ? ' · ' + esc(s.note) : ''}</small></div>` +
      `<div class="btns"><select data-sev="${s.id}" aria-label="Severity" ${s.resolved ? 'disabled' : ''}>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option ${n === s.severity ? 'selected' : ''}>${n}</option>`).join('')}</select><button class="ghost sm" data-act="resolve" data-id="${s.id}">${s.resolved ? 'Reopen' : 'Resolved'}</button></div></li>`).join('')}</ul>` : `<div class="empty">Nothing logged. Select a body region, then “Log a symptom here”.</div>`) +
      `<button class="ghost sm" style="margin-top:8px" data-act="handoff">${U.handoff ? 'Hide summary' : 'Handoff summary'}</button>` + (U.handoff ? `<textarea class="ho" readonly rows="9" id="handoff-text"></textarea>` : ''));
  }

  function radiation() {
    return panel('Radiation', `<div class="row"><span>Cumulative dose</span><b><span data-live="msv"></span> mSv</b></div><div class="row"><span>Dose rate</span><b><span data-live="rate"></span> mSv/day</b></div>` +
      `<div class="row"><span>Warning limit</span>${tvBadge('srag')}</div><p class="muted" style="font-size:.8rem;margin:6px 0 0">No radiation alert is raised until the official limit is filled in.</p>`,
      `<span class="badges" style="margin:0">${src()}${src('hrp-radiation')}</span>`);
  }

  function crewPanel() {
    const s = store.get(), g = s.gamification, G = Gamification, span = g.nextAt ? g.nextAt - g.prevAt : 1, pct = g.nextAt ? (g.xp - g.prevAt) / span * 100 : 100;
    const goalPct = Math.min(100, g.crewGoal.progress / g.crewGoal.target * 100);
    const branches = Object.entries(G.TREE).map(([b, nodes]) => `<div class="branch"><h3>${esc(b)}</h3>${nodes.map(([id, nm, hint, ctr, need]) => `<div class="node ${g.unlockedNodes.includes(id) ? 'on' : ''}"><span>${esc(nm)}<small>${esc(hint)}</small></span><small>${Math.min(g.counters[ctr] || 0, need)}/${need}</small></div>`).join('')}</div>`).join('');
    const names = Object.fromEntries(G.BADGES.map(b => [b[0], b]));
    return panel('Crew + readiness', `<div class="lvl">${ring('Readiness', g.readiness, g.readiness / 100, 'nominal', null, true)}<div style="flex:1;min-width:0"><b>Level ${g.level} · ${esc(g.title)}</b><div class="bar" style="margin:6px 0 2px"><i style="width:${pct.toFixed(0)}%"></i></div><small>${g.xp} XP${g.nextAt ? ' · next level at ' + g.nextAt : ' · max level'}</small></div></div>` +
      `<h3 style="margin:12px 0 6px">${esc(g.crewGoal.title)}</h3><div class="bar ${g.goalDone ? 'done' : ''}" role="img" aria-label="Crew deep sleep ${g.crewGoal.progress} of ${g.crewGoal.target} hours"><i style="width:${goalPct.toFixed(0)}%"></i></div>` +
      `<small>${g.crewGoal.progress} of ${g.crewGoal.target} h deep sleep together · reward: ${g.goalDone ? '<b>Earth data pack unlocked: movie night</b>' : 'Earth data pack (movie night)'} ${src()}</small>` +
      `<div style="margin-top:6px">${s.crew.map(m => `<div class="row"><span>${esc(m.name)}</span><small>${m.deepSleepWeekly} h · ${m.xp} XP</small></div>`).join('')}</div>` +
      `<div class="btns" style="margin-top:6px"><button class="sm" data-act="sync-rest">${esc(G.RENAMES['Sleep report'])}</button><button class="sm" data-act="calib-open">${esc(G.RENAMES['Fill survey'])}</button><button class="sm ghost" data-act="meal">${esc(G.RENAMES['Log nutrition'])}</button></div>` +
      (U.calibOpen ? `<div class="calib"><b>${esc(G.RENAMES['Fill survey'])}</b>${[['sleep', 'Sleep quality'], ['mood', 'Mood'], ['stress', 'Stress']].map(([k, l]) => `<label>${l}: <b id="cv-${k}">${U.calib[k]}</b> / 5<input type="range" min="1" max="5" value="${U.calib[k]}" data-calib="${k}"></label>`).join('')}<div class="btns"><button data-act="calib-done" style="flex:1">Complete</button><button class="ghost" data-act="calib-cancel">Cancel</button></div></div>` : '') +
      `<details data-tree ${U.treeOpen ? 'open' : ''}><summary>Resilience skill tree</summary><div class="tree">${branches}</div></details>` +
      `<div class="badges">${g.badges.map(b => `<span class="chip nominal" title="${esc(names[b][2])}">★ ${esc(names[b][1])}</span>`).join('') || '<small>No badges yet. Log a symptom or finish a countermeasure.</small>'}</div>` +
      `<h3 style="margin:10px 0 4px">Mission log</h3><ul class="feed">${g.notes.slice(0, 4).map(n => `<li>${esc(n)}</li>`).join('')}</ul>`);
  }

  const simPanel = () => panel('Simulation (demo controls)', `<details><summary>Open controls</summary><div class="btns">` +
    [['co2up', 'Raise CO₂'], ['co2down', 'Clear CO₂'], ['online', 'Link online'], ['delayed', 'Link delayed'], ['offline', 'Cut link'], ['dose', 'Dose ×2'], ['pain', 'Pain 8 · left shoulder'], ['ared', 'Complete ARED'], ['reset', 'Reset demo']].map(([a, l]) => `<button class="ghost sm" data-act="sim-${a}">${l}</button>`).join('') + `</div></details>`);

  /* ---------- live values (the only thing that changes every tick) ---------- */
  function live() {
    const s = store.get(), e = s.environment, r = s.radiation;
    const v = { ppCO2: e.ppCO2, ppO2: e.ppO2, temp: e.temp, msv: r.cumulative_mSv.toFixed(2), rate: r.doseRate_mSv_day, spo2: U.physio ? U.physio.spo2 : '–' };
    document.querySelectorAll('[data-live]').forEach(n => { const t = String(v[n.dataset.live]); if (n.textContent !== t) n.textContent = t; });
    const h = document.getElementById('handoff-text'); if (h) h.value = Logging.handoff();
  }

  /* ---------- provenance + TO VERIFY (one list) ---------- */
  function verifyItems() {
    const tv = C.TO_VERIFY, rules = window.TRIAGE_RULES.filter(r => r.toVerify).map(r => r.id).join(', ');
    return [['Radiation warning limit', 'srag', 'No radiation alert until filled'], ['Bone density limit', 'nasa-std-3001', 'Not used for colours yet'], ['Orthostatic blood-pressure limit', 'nasa-std-3001', 'Not used for colours yet'],
      ['SpO₂ limits', 'physionet-bidmc', 'SpO₂ is shown without a status colour'], [`Caution margin ${tv.cautionMarginPct.value * 100}% around official ranges`, 'eclss-ochmo', 'UI heuristic, not official'],
      ['Region score bands (below 40 critical, up to 70 caution)', 'hrp-risks', 'UI heuristic, mock scores'], ['Triage rules flagged toVerify: ' + rules, 'ntrs-hhp', 'Urgency and day/sleep/ARED triggers'],
      ['Demo values: countermeasure durations and score boost (+20), 600 s link delay, XP, 40 h goal, 10 min alert window', '—', 'Game/demo design, not NASA data']];
  }
  function openSources() {
    let d = document.getElementById('dlg'); if (!d) { d = document.createElement('dialog'); d.id = 'dlg'; document.body.appendChild(d); d.addEventListener('click', e => { if (e.target === d || e.target.dataset.act === 'dlg-close') d.close(); }); }
    d.innerHTML = `<div class="row"><h2>Data sources</h2><button class="ghost sm" data-act="dlg-close">Close</button></div><p class="muted">Every number in the app points to one of these Source IDs or is flagged simulated.</p>` +
      `<table><tr><th>ID</th><th>Source</th><th>Data</th><th>Link</th></tr>${store.get().sources.map(s => `<tr><td><code>${esc(s.id)}</code></td><td>${esc(s.name)}</td><td>${s.type === 'real' ? 'reference / real' : 'simulated'}</td><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>` : '—'}</td></tr>`).join('')}</table>` +
      `<h3 style="margin:14px 0 6px">Numbers to verify</h3><table><tr><th>Item</th><th>Verify against</th><th>Note</th></tr>${verifyItems().map(i => `<tr><td><span class="tv">TO VERIFY</span> ${esc(i[0])}</td><td><code>${esc(i[1])}</code></td><td>${esc(i[2])}</td></tr>`).join('')}</table>` +
      `<p class="muted">Official numbers in this app (eclss-ochmo): ppCO₂ &lt; 3 mmHg · ppO₂ 145–155 mmHg · cabin 18–27 °C · 3035 kcal/day. Demo only. Not a medical device.</p>`;
    d.showModal ? d.showModal() : d.setAttribute('open', '');
  }

  /* ---------- render all ---------- */
  function render() {
    const s = store.get();
    mount('top', topBar()); mount('p-card', regionCard(), regionCard());
    const sel = s.ui.selectedRegion;
    if (U.logOpen && sel) mount('p-log', logSheet, `log|${sel}|${U.done}|${U.done ? Date.now() < (Logging.last ? Logging.last.until : 0) : ''}|${Logging.last ? Logging.last.id : ''}`);
    else mount('p-log', '', 'off');
    document.getElementById('p-card').hidden = !!(U.logOpen && sel); document.getElementById('p-log').hidden = !(U.logOpen && sel);
    mount('p-cabin', cabin()); mount('p-alerts', alerts()); mount('p-triage', triagePanel()); mount('p-hist', history()); mount('p-crew', crewPanel()); mount('p-rad', radiation(), 'static'); mount('p-sim', simPanel(), 'static');
    document.querySelectorAll('.layers input').forEach(i => { i.checked = i.value === s.ui.activeSystem; });
    live();
  }
  let raf = 0; const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };

  /* ---------- events ---------- */
  const DEMO = { co2up: () => Core.sim.raiseCO2(), co2down: () => Core.sim.clearCO2(), online: () => actions.setComms('online', 0), delayed: () => actions.setComms('delayed', 600), offline: () => actions.setComms('offline', 0),
    dose: () => Core.sim.boostDose(), pain: () => { actions.selectRegion('l_shoulder'); Logging.log({ region: 'l_shoulder', type: 'pain', severity: 8, note: 'demo' }); }, ared: () => Layers.finish('ared'), reset: () => location.reload() };
  function pushAlert(level, text, sourceId) { U.alerts = [{ level, text, sourceId, t: Date.now() }].concat(U.alerts).slice(0, 5); schedule(); }

  function wire() {
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act, id = b.dataset.id, d = U.draft;
      if (a === 'close') actions.selectRegion(null);
      else if (a === 'cm-start') Layers.start(id); else if (a === 'cm-finish') Layers.finish(id);
      else if (a === 'log-open') { U.logOpen = true; U.done = null; U.draft = { severity: null, type: 'pain', note: '' }; }
      else if (a === 'log-cancel') U.logOpen = false; else if (a === 'log-done') { U.logOpen = false; U.done = null; }
      else if (a === 'undo') { Logging.undo(id); U.logOpen = false; U.done = null; }
      else if (a === 'resolve') Logging.toggleResolved(id); else if (a === 'handoff') U.handoff = !U.handoff;
      else if (a === 'sync-rest') Gamification.syncRestCycle(); else if (a === 'meal') { U.intake = Math.min(TH.nutrition.baseline, U.intake + 600); Gamification.logNutrition(); }
      else if (a === 'calib-open') U.calibOpen = true; else if (a === 'calib-cancel') U.calibOpen = false;
      else if (a === 'calib-done') { U.calibOpen = false; Gamification.completeCheckin(Object.assign({}, U.calib)); }
      else if (a === 'sources') openSources();
      else if (a.startsWith('sim-')) DEMO[a.slice(4)]();
      cache['p-log'] = null; render();
    });
    document.addEventListener('change', e => {
      const t = e.target;
      if (t.name === 'sev') { U.draft.severity = +t.value; const c = $('#log-confirm'); if (c) c.disabled = false; }
      else if (t.name === 'type') U.draft.type = t.value;
      else if (t.dataset.sev) Logging.setSeverity(t.dataset.sev, +t.value);
      else if (t.name === 'layer') actions.setSystem(t.value);
    });
    document.addEventListener('input', e => {
      const t = e.target;
      if (t.id === 'log-note') U.draft.note = t.value;
      else if (t.dataset.calib) { U.calib[t.dataset.calib] = +t.value; const o = document.getElementById('cv-' + t.dataset.calib); if (o) o.textContent = t.value; }
    });
    document.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('[data-tree]')) U.treeOpen = e.target.open; }, true);
    document.addEventListener('click', e => {
      if (e.target.id !== 'log-confirm') return; const d = U.draft; if (!d.severity) return;
      const sym = Logging.log({ region: store.get().ui.selectedRegion, type: d.type, severity: d.severity, note: d.note.trim().slice(0, 200) });
      U.done = sym.id; setTimeout(() => { cache['p-log'] = null; render(); }, Logging.UNDO_MS + 100); cache['p-log'] = null; render();
    });
    addEventListener('keydown', e => { if (e.key === 'Escape') { U.logOpen = false; actions.selectRegion(null); } });
    bus.on(EV.REGION_SELECTED, () => { U.logOpen = false; U.done = null; });
    bus.on(EV.ALERT_RAISED, p => {
      const s = store.get(), e = s.environment;
      if (p.hazard === 'closed_env') { const bits = [['ppCO2', 'ppCO₂', e.ppCO2, 'mmHg'], ['ppO2', 'ppO₂', e.ppO2, 'mmHg'], ['temp', 'Temp', e.temp, '°C']].filter(k => e.status[k[0]] !== 'nominal').map(k => `${k[1]} ${k[2]} ${k[3]} ${e.status[k[0]] === 'critical' ? 'outside range' : 'nearing range'}`); pushAlert(p.level, bits.join(' · ') || 'Cabin reading changed', p.sourceId); }
      else pushAlert(p.level, p.hazard === 'distance' ? 'No link to Earth. Autonomous Mode is on: use on-board triage.' : 'Alert: ' + p.hazard, p.sourceId);
    });
    bus.on(EV.COMMS_STATE_CHANGED, p => { if (p.state !== 'offline') pushAlert('info', p.state === 'online' ? 'Link to Earth restored.' : `Link delayed: replies in about ${p.delaySec} s.`, 'ntrs-hhp'); });
  }

  function init() {
    const layers = C.SYSTEMS.map((x, i) => `<input type="radio" name="layer" id="l${i}" value="${x}"><label for="l${i}">${esc(Layers.SYS_LABEL[x])}</label>`).join('');
    document.body.innerHTML = `<div class="shell"><header class="panel hud a-top" id="top"></header>` +
      `<aside class="col a-left"><section class="panel" id="p-crew"></section><section class="panel" id="p-rad"></section><section class="panel" id="p-sim"></section></aside>` +
      `<section class="panel a-center"><header><h2>Digital twin</h2><span class="hint">Drag to rotate · tap a region</span></header><div class="stage" id="stage"></div></section>` +
      `<aside class="col a-right"><section class="panel" id="p-card"></section><section class="panel" id="p-log" hidden></section><section class="panel" id="p-cabin"></section><section class="panel" id="p-alerts"></section><section class="panel" id="p-triage"></section><section class="panel" id="p-hist"></section></aside>` +
      `<nav class="layers a-layers" aria-label="Body system layer">${layers}</nav><div class="disc a-disc">Demo only. Not a medical device. All figures are simulated unless a source badge says otherwise.</div></div>`;
    wire(); store.subscribe(schedule); render();
    Core.loaders.loadPhysio().then(r => { let i = 0; U.physio = r.rows[0]; setInterval(() => { U.physio = r.rows[i++ % r.rows.length]; live(); }, 1000); });
  }
  window.UI = { init, render, esc, chip, src, ring, verifyItems };
})();
