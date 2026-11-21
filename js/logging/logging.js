/* ============================================================
   TASK 4 — Symptom logging + Offline Triage  (folder: js/logging; contract: src/logging)
   Port of twin-py/twin/symptoms.py. Writes the `symptoms` slice, emits symptom:logged and diagnosis:suggested.
   window.Logging = { TYPES, log, undo, setSeverity, toggleResolved, triage, triageAll, framing, handoff, recurring, last, ... }
   Decision support only. Not a diagnosis.
   ============================================================ */
(function () {
  'use strict';
  const { C, store, bus, actions, helpers } = Core, T = C.THRESHOLDS;
  const DISCLAIMER = 'Decision support only. Not a diagnosis.';
  const UNDO_MS = 10000;
  const URG = { contact_ground: 0, self_treat: 1, watch: 2 };
  const URGENCY_LABEL = { watch: 'Monitor', self_treat: 'Treat yourself', contact_ground: 'Call ground at first chance' };
  const TYPES = [   // [id, label, icon, hazard id from the contract]
    ['pain', 'Pain', '⚡', 'gravity'], ['numbness', 'Numbness', '〰', 'gravity'], ['dizziness', 'Dizziness', '🌀', 'gravity'],
    ['pressure', 'Pressure', '◉', 'gravity'], ['fatigue', 'Fatigue', '▽', 'isolation'], ['blurred_vision', 'Blurred vision', '◌', 'gravity'],
    ['headache', 'Headache', '✦', 'closed_env'], ['shortness_of_breath', 'Short of breath', '≋', 'closed_env'],
    ['orthostatic', 'Dizzy on standing', '↑', 'gravity'], ['sleep_disturbance', 'Sleep trouble', '☾', 'isolation'], ['stress', 'Stress / anxiety', '◈', 'isolation']
  ];
  const TYPE_LABEL = Object.fromEntries(TYPES.map(t => [t[0], t[1]]));
  const band = n => helpers.severityBand(n);
  const bandStatus = n => ({ severe: 'critical', moderate: 'caution', mild: 'nominal' })[band(n)];

  const L = { last: null };   // { id, until, suggestions }

  function matches(rule, i) {
    if (!rule.types.includes('*') && !rule.types.includes(i.type)) return false;
    const w = rule.when, e = i.environment;
    if (w.minSeverity != null && i.severity < w.minSeverity) return false;
    if (w.ppCO2Gt != null && !(e.ppCO2 > w.ppCO2Gt)) return false;
    if (w.ppO2Outside && !(e.ppO2 < T.ppO2.min || e.ppO2 > T.ppO2.max)) return false;
    if (w.tempOutside && !(e.temp < T.temp.min || e.temp > T.temp.max)) return false;
    if (w.daysInSpaceGte != null && !(i.daysInSpace >= w.daysInSpaceGte)) return false;
    if (w.sleepHoursLt != null && !(i.sleepHours < w.sleepHoursLt)) return false;
    if (w.aredMissedGte != null && !(i.aredMissedDays >= w.aredMissedGte)) return false;
    return true;
  }
  /** pure: { type, severity, environment, daysInSpace, aredMissedDays, sleepHours } -> sorted suggestions */
  function triage(inp, rules) {
    return (rules || window.TRIAGE_RULES).filter(r => matches(r, inp))
      .map(r => Object.assign({}, r, { specificity: Object.keys(r.when).length + (r.types.includes('*') ? 0 : 1), disclaimer: DISCLAIMER }))
      .sort((a, b) => URG[a.urgency] - URG[b.urgency] || b.specificity - a.specificity);
  }
  function inputFor(type, severity) {
    const s = store.get(), ared = s.countermeasures.find(c => c.id === 'ared');
    return { type, severity, environment: s.environment, daysInSpace: s.astronaut.missionDay,
      aredMissedDays: ared && ared.done ? 0 : 3, sleepHours: s.sleep.perCrew.c1.hours };   // derived from the store, no extra slices
  }
  function framing(s) {
    const c = store.get().comms;
    if (c.state === 'online') return { badge: null, lead: s.urgency === 'contact_ground' ? 'Send to the flight surgeon now, with the summary below.' : 'Send to the flight surgeon if it persists.' };
    if (c.state === 'delayed') return { badge: `Reply in ~${c.delaySec}s`, lead: `Expect a reply in about ${c.delaySec} seconds. First action: ${s.action}.` };
    return { badge: 'Autonomous Mode', lead: `No link to ground. Decide on board: ${s.action}. Re-check in 30 minutes and log the change.` };
  }

  function log({ region, type, severity, note }) {
    const env = store.get().environment;
    const sym = actions.addSymptom({ region, severity, type, note, context: { ppCO2: env.ppCO2, ppO2: env.ppO2, temp: env.temp } });
    const sugg = triage(inputFor(type, severity));
    sugg.slice(0, 3).forEach(r => bus.emit(C.EVENTS.DIAGNOSIS_SUGGESTED, { ruleId: r.id, cause: r.cause, urgency: r.urgency, region, sourceId: r.source }));
    L.last = { id: sym.id, until: Date.now() + UNDO_MS, suggestions: sugg };
    return sym;
  }
  function patch(id, p) { store.set(s => ({ symptoms: s.symptoms.map(x => (x.id === id ? Object.assign({}, x, p) : x)) })); }
  function undo(id) {      // 10 s window, enforced here as well as hidden in the UI
    if (!L.last || L.last.id !== id || Date.now() > L.last.until) return false;
    store.set(s => ({ symptoms: s.symptoms.filter(x => x.id !== id) })); L.last = null; return true;
  }
  const setSeverity = (id, n) => patch(id, { severity: helpers.clamp(n, 1, 10) });
  const toggleResolved = id => { const x = store.get().symptoms.find(s => s.id === id); if (x) patch(id, { resolved: !x.resolved }); };
  const open = () => store.get().symptoms.filter(s => !s.resolved);
  const recurring = region => store.get().symptoms.filter(s => s.region === region && Date.now() - s.time <= 7 * 864e5).length >= 3;

  /** Offline Triage: run every open symptom through the rules; emit diagnosis:suggested for the top hit of each. */
  function triageAll() {
    return open().map(s => {
      const sugg = triage(inputFor(s.type, s.severity)), top = sugg[0];
      if (top) bus.emit(C.EVENTS.DIAGNOSIS_SUGGESTED, { ruleId: top.id, cause: top.cause, urgency: top.urgency, region: s.region, sourceId: top.source });
      return { symptom: s, suggestions: sugg };
    });
  }
  function handoff() {
    const s = store.get(), iso = t => new Date(t).toISOString().replace('T', ' ').slice(0, 19) + ' UTC', e = s.environment;
    const lines = ['SYMPTOM HANDOFF (demo, not a medical record)', 'Generated: ' + iso(Date.now()), 'Link: ' + s.comms.state,
      `Cabin: ppCO2 ${e.ppCO2}, ppO2 ${e.ppO2}, temp ${e.temp} C (simulated)`, ''];
    open().forEach(x => lines.push(`- ${iso(x.time)} | ${x.region} | ${x.type} | severity ${x.severity}/10${x.note ? ' | note: ' + x.note : ''}`));
    return lines.concat(['', DISCLAIMER]).join('\n');
  }
  const ago = t => { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.floor(m / 60) + ' h ago'; };

  // when the link drops, Offline Triage runs on what is already logged
  bus.on(C.EVENTS.COMMS_STATE_CHANGED, p => { if (p.state === 'offline') triageAll(); });

  window.Logging = Object.assign(L, { TYPES, TYPE_LABEL, DISCLAIMER, URGENCY_LABEL, UNDO_MS, band, bandStatus, triage, inputFor, framing, log, undo, setSeverity, toggleResolved, open, recurring, triageAll, handoff, ago });
})();
