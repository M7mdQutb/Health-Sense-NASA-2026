/* ============================================================
   TASK 1 — Foundation & Data  (folder: src/core in the contract)
   Single global:  window.Core  =  { C, store, bus, actions, helpers, sim, loaders }
   Every name below follows 00_INTEGRATION_GUIDE.md literally.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 1) CONSTANTS — the single reference ---------- */
  const REGIONS = ['head', 'neck', 'chest', 'upper_back', 'lower_back', 'abdomen', 'spine',
    'l_shoulder', 'r_shoulder', 'l_arm', 'r_arm', 'l_hip', 'r_hip', 'l_femur', 'r_femur',
    'l_knee', 'r_knee', 'l_lower_leg', 'r_lower_leg'];
  const REGION_LABELS = {
    head: ['Head', 'الرأس'], neck: ['Neck', 'الرقبة'], chest: ['Chest', 'الصدر'],
    upper_back: ['Upper back', 'أعلى الظهر'], lower_back: ['Lower back', 'أسفل الظهر'],
    abdomen: ['Abdomen', 'البطن'], spine: ['Spine', 'العمود الفقري'],
    l_shoulder: ['Left shoulder', 'الكتف الأيسر'], r_shoulder: ['Right shoulder', 'الكتف الأيمن'],
    l_arm: ['Left arm', 'الذراع الأيسر'], r_arm: ['Right arm', 'الذراع الأيمن'],
    l_hip: ['Left hip', 'الورك الأيسر'], r_hip: ['Right hip', 'الورك الأيمن'],
    l_femur: ['Left thigh', 'الفخذ الأيسر'], r_femur: ['Right thigh', 'الفخذ الأيمن'],
    l_knee: ['Left knee', 'الركبة اليسرى'], r_knee: ['Right knee', 'الركبة اليمنى'],
    l_lower_leg: ['Left lower leg', 'أسفل الساق اليسرى'], r_lower_leg: ['Right lower leg', 'أسفل الساق اليمنى']
  };
  const SYSTEMS = ['skeletal', 'cardiovascular', 'nervous', 'respiratory', 'immune'];
  const STATUS = { NOMINAL: 'nominal', CAUTION: 'caution', CRITICAL: 'critical' };
  const HAZARD_IDS = ['gravity', 'radiation', 'isolation', 'closed_env', 'distance'];
  const EVENTS = {
    REGION_SELECTED: 'region:selected', SYSTEM_CHANGED: 'system:changed', SYMPTOM_LOGGED: 'symptom:logged',
    COUNTERMEASURE_COMPLETED: 'countermeasure:completed', CHECKIN_COMPLETED: 'checkin:completed',
    CREW_GOAL_PROGRESS: 'crew:goal-progress', ENVIRONMENT_UPDATED: 'environment:updated',
    ALERT_RAISED: 'alert:raised', COMMS_STATE_CHANGED: 'comms:state-changed', DIAGNOSIS_SUGGESTED: 'diagnosis:suggested'
  };

  /* ---------- 2) SOURCES (ط) + official thresholds (ي) + TO VERIFY placeholders ---------- */
  const SRC = (id, name, url, type) => ({ id, name, url, type });
  // url: only the address that appears in the contract is filled in; the rest stay null until verified.
  // type: 'real' = reference document / downloaded dataset, 'simulated' = generated data (loaders flip this).
  const SOURCES = [
    SRC('hrp-risks', 'NASA HRP — Risks of Human Spaceflight', 'https://www.nasa.gov/hrp/risks', 'real'),
    SRC('nasa-std-3001', 'NASA-STD-3001 Vol 1 Rev C', null, 'real'),
    SRC('osdr-i4', 'OSDR — Inspiration4 (cardio / physiology)', null, 'simulated'),
    SRC('physionet-bidmc', 'PhysioNet BIDMC (HR / resp / SpO2 @ 1 Hz)', null, 'simulated'),
    SRC('hrp-radiation', 'NASA Space Radiation Element', null, 'real'),
    SRC('srag', 'NASA SRAG (ALARA limits)', null, 'real'),
    SRC('osdr', 'OSDR (OSD-984, OSD-964 …)', null, 'real'),
    SRC('hrp-hazards', 'HRP — 5 Hazards of Human Spaceflight', null, 'real'),
    SRC('nasa-crew-physio', 'Flight Crew Physiological Data (data.nasa.gov)', null, 'simulated'),
    SRC('osdr-osd-1018', 'OSDR OSD-1018 (isolation / REM sleep)', null, 'simulated'),
    SRC('eclss-ochmo', 'OCHMO ECLSS Technical Brief', null, 'real'),
    SRC('ntrs-hhp', 'Human Health & Performance (Moon to Mars)', null, 'real'),
    SRC('nlsp', 'NASA Life Sciences Portal', null, 'real')
  ];

  // The ONLY official numbers allowed in code (contract section ي)
  const THRESHOLDS = {
    ppCO2: { max: 3, unit: 'mmHg', sourceId: 'eclss-ochmo', rule: 'must stay below max' },
    ppO2: { min: 145, max: 155, unit: 'mmHg', sourceId: 'eclss-ochmo' },
    temp: { min: 18, max: 27, unit: '°C', sourceId: 'eclss-ochmo' },
    nutrition: { baseline: 3035, unit: 'kcal/day', sourceId: 'eclss-ochmo' }
  };
  // Everything else is a labelled placeholder — never presented as an official value.
  const TO_VERIFY = {
    radiationWarnLimit: { value: null, verifyAgainst: 'srag', note: 'ALARA / career dose limit not in source file' },
    boneDensityLimit: { value: null, verifyAgainst: 'nasa-std-3001' },
    orthostaticBP: { value: null, verifyAgainst: 'nasa-std-3001' },
    spo2Limits: { value: null, verifyAgainst: 'physionet-bidmc' },
    cautionMarginPct: { value: 0.15, verifyAgainst: 'eclss-ochmo', note: 'UI heuristic ("approaching limit"), NOT an official value' }
  };
  const HAZARDS = {
    gravity: { name: 'Gravity', systems: ['skeletal', 'cardiovascular', 'nervous'], sources: ['hrp-risks', 'hrp-hazards', 'nasa-std-3001', 'osdr-i4'] },
    radiation: { name: 'Radiation', systems: ['immune', 'nervous'], sources: ['hrp-radiation', 'srag', 'osdr'] },
    isolation: { name: 'Isolation', systems: ['nervous'], sources: ['osdr-osd-1018', 'hrp-hazards'] },
    closed_env: { name: 'Closed environment', systems: ['respiratory'], sources: ['eclss-ochmo', 'physionet-bidmc'] },
    distance: { name: 'Distance from Earth', systems: SYSTEMS.slice(), sources: ['ntrs-hhp', 'hrp-hazards'] }
  };

  /* ---------- 3) HELPERS ---------- */
  const helpers = {
    statusFromScore: s => (s < 40 ? STATUS.CRITICAL : s <= 70 ? STATUS.CAUTION : STATUS.NOMINAL),
    severityBand: v => (v <= 3 ? 'mild' : v <= 6 ? 'moderate' : 'severe'),
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    levelFromXp: xp => Math.floor(xp / 100) + 1,
    regionLabel: (id, lang = 0) => (REGION_LABELS[id] || [id, id])[lang],
    worstStatus(list) { return list.includes('critical') ? 'critical' : list.includes('caution') ? 'caution' : 'nominal'; },
    /** worst status of a region across all five systems */
    regionWorst(id) { return helpers.worstStatus(SYSTEMS.map(s => store.get().regionStatus[s][id].status)); },
    /** reading status vs the official thresholds: nominal | caution (approaching) | critical (crossed) */
    readingStatus(key, v) {
      const t = THRESHOLDS[key], m = TO_VERIFY.cautionMarginPct.value;
      if (key === 'ppCO2') return v >= t.max ? 'critical' : v >= t.max * (1 - m) ? 'caution' : 'nominal';
      const span = t.max - t.min;
      if (v < t.min || v > t.max) return 'critical';
      return (v < t.min + span * m || v > t.max - span * m) ? 'caution' : 'nominal';
    },
    uid: () => Math.random().toString(36).slice(2, 9)
  };

  /* ---------- 4) EVENT BUS ---------- */
  const handlers = {};
  const bus = {
    on(name, fn) { (handlers[name] = handlers[name] || new Set()).add(fn); return () => bus.off(name, fn); },
    off(name, fn) { handlers[name] && handlers[name].delete(fn); },
    emit(name, payload) { (handlers[name] || []).forEach(fn => { try { fn(payload, name); } catch (e) { console.error('[bus]', name, e); } }); }
  };

  /* ---------- 5) STORE — one central store, 12 slices (ز) ---------- */
  function regionMap(overrides, def = { score: 88, reason: 'Within expected range' }) {
    const m = {};
    REGIONS.forEach(r => { const o = overrides[r] || def; m[r] = { score: o.score, status: helpers.statusFromScore(o.score), reason: o.reason }; });
    return m;
  }
  const initial = () => ({
    astronaut: { name: '', missionDay: 47, missionTotalDays: 180, role: '' },
    regionStatus: {
      skeletal: regionMap({
        spine: { score: 55, reason: 'ARED session missed 3 days in a row' },
        l_femur: { score: 58, reason: 'ARED session missed 3 days in a row' },
        r_femur: { score: 58, reason: 'ARED session missed 3 days in a row' },
        lower_back: { score: 24, reason: 'Reported pain + reduced spinal loading' }
      }),
      cardiovascular: regionMap({
        head: { score: 60, reason: 'Fluid shift toward the head' },
        neck: { score: 63, reason: 'Fluid shift (jugular distension risk)' }
      }),
      nervous: regionMap({
        head: { score: 72, reason: 'Cognitive load moderate; cumulative radiation green but nearing caution' }
      }),
      respiratory: regionMap({ chest: { score: 62, reason: 'ppCO2 approaching the cabin limit' } }),
      immune: regionMap({
        chest: { score: 80, reason: 'No flags' }, abdomen: { score: 82, reason: 'No flags' }, head: { score: 78, reason: 'No flags' }
      })
    },
    symptoms: [],                       // {id, region, severity, time, note?}
    countermeasures: [
      { id: 'ared', name: 'ARED resistance session', system: 'skeletal', regions: ['spine', 'l_femur', 'r_femur', 'l_hip', 'r_hip'], durationMin: 45, done: false },
      { id: 'spine-stretch', name: 'Spinal decompression stretch', system: 'skeletal', regions: ['spine', 'lower_back', 'upper_back'], durationMin: 15, done: false },
      { id: 'head-pressure', name: 'Head pressure measurement', system: 'cardiovascular', regions: ['head', 'neck'], durationMin: 10, done: false },
      { id: 'meditation', name: 'Guided meditation', system: 'nervous', regions: ['head'], durationMin: 12, done: false }
    ],
    crew: [
      { id: 'c1', name: 'Nour Hamdy', deepSleepWeekly: 6.1, xp: 340 },
      { id: 'c2', name: 'Mateo Ortiz', deepSleepWeekly: 7.4, xp: 410 },
      { id: 'c3', name: 'Mei Tanaka', deepSleepWeekly: 5.2, xp: 275 },
      { id: 'c4', name: 'Jonas Berg', deepSleepWeekly: 6.8, xp: 390 }
    ],
    gamification: { xp: 340, level: 4, badges: ['first-checkin'], unlockedNodes: ['root'], crewGoal: { title: 'Crew countermeasure streak', target: 12, progress: 5 } },
    ui: { activeSystem: 'skeletal', selectedRegion: null, openPanel: null },
    environment: {
      ppCO2: 2.6, ppO2: 150, temp: 22.5, source: 'simulated', manualCO2: false, history: [],
      status: { ppCO2: 'nominal', ppO2: 'nominal', temp: 'nominal' }
    },
    radiation: { cumulative_mSv: 38, warnLimit: TO_VERIFY.radiationWarnLimit, doseRate_mSv_day: 0.5, source: 'simulated' },
    sleep: {
      perCrew: { c1: { hours: 6.1, deepPct: 17, circadianDisruption: 0.42 }, c2: { hours: 7.0, deepPct: 21, circadianDisruption: 0.2 },
                 c3: { hours: 5.4, deepPct: 14, circadianDisruption: 0.55 }, c4: { hours: 6.6, deepPct: 19, circadianDisruption: 0.33 } },
      source: 'simulated'
    },
    comms: { state: 'online', delaySec: 0 },
    sources: SOURCES
  });

  function createStore(init) {
    let state = init; const subs = new Set();
    return {
      get: () => state,
      set(patch) { state = Object.assign({}, state, typeof patch === 'function' ? patch(state) : patch); subs.forEach(f => f(state)); },
      subscribe(f) { subs.add(f); return () => subs.delete(f); }
    };
  }
  const store = createStore(initial());

  /* ---------- 6) ACTIONS — each important change emits its event ---------- */
  const A = {
    selectRegion(id) {
      store.set(s => ({ ui: Object.assign({}, s.ui, { selectedRegion: id, openPanel: id ? 'region' : null }) }));
      bus.emit(EVENTS.REGION_SELECTED, { region: id });
    },
    setSystem(id) {
      store.set(s => ({ ui: Object.assign({}, s.ui, { activeSystem: id }) }));
      bus.emit(EVENTS.SYSTEM_CHANGED, { system: id });
    },
    /* INTEGRATION PATCH: keeps type/context/resolved for Task 4 and returns the entry. Region colouring from symptoms is
       computed as an overlay in js/layers (so undo/resolve restore the colour); the old skeletal-score rewrite was removed. */
    addSymptom({ region, severity, note, type, context }) {
      const time = Date.now(), entry = { id: helpers.uid(), region, severity, time, note: note || '', type: type || 'pain', context: context || null, resolved: false };
      store.set(s => ({ symptoms: [entry].concat(s.symptoms) }));
      bus.emit(EVENTS.SYMPTOM_LOGGED, { region, severity, time, id: entry.id });
      return entry;
    },
    addXP(n) {
      store.set(s => { const xp = s.gamification.xp + n; return { gamification: Object.assign({}, s.gamification, { xp, level: helpers.levelFromXp(xp) }) }; });
    },
    completeCountermeasure(id) {
      const cm = store.get().countermeasures.find(c => c.id === id);
      if (!cm || cm.done) return;
      store.set(s => {
        const rs = Object.assign({}, s.regionStatus), sys = Object.assign({}, rs[cm.system]);
        cm.regions.forEach(r => { const sc = Math.min(100, sys[r].score + (cm.boost || 12))   /* INTEGRATION PATCH: per-countermeasure demo boost */; sys[r] = Object.assign({}, sys[r], { score: sc, status: helpers.statusFromScore(sc) }); });
        rs[cm.system] = sys;
        return { regionStatus: rs, countermeasures: s.countermeasures.map(c => (c.id === id ? Object.assign({}, c, { done: true }) : c)) };
      });
      bus.emit(EVENTS.COUNTERMEASURE_COMPLETED, { id });   // INTEGRATION PATCH: XP and crew goal are owned by js/gamification
    },
    raiseAlert(hazard, level, sourceId) { bus.emit(EVENTS.ALERT_RAISED, { hazard, level, sourceId }); },
    updateEnvironment(patch) {
      const prev = store.get().environment, next = Object.assign({}, prev, patch);
      const status = {}; ['ppCO2', 'ppO2', 'temp'].forEach(k => { status[k] = helpers.readingStatus(k, next[k]); });
      next.status = status;
      next.history = prev.history.concat({ t: Date.now(), ppCO2: next.ppCO2, ppO2: next.ppO2, temp: next.temp }).slice(-120);
      // respiratory layer follows ppCO2 (chest)
      const sc = status.ppCO2 === 'critical' ? 25 : status.ppCO2 === 'caution' ? 62 : 88;
      store.set(s => {
        const rs = Object.assign({}, s.regionStatus), res = Object.assign({}, rs.respiratory);
        res.chest = { score: sc, status: helpers.statusFromScore(sc), reason: status.ppCO2 === 'critical' ? `ppCO2 above ${THRESHOLDS.ppCO2.max} ${THRESHOLDS.ppCO2.unit}` : status.ppCO2 === 'caution' ? 'ppCO2 approaching the cabin limit' : 'Within expected range' };
        rs.respiratory = res; return { environment: next, regionStatus: rs };
      });
      bus.emit(EVENTS.ENVIRONMENT_UPDATED, { ppCO2: next.ppCO2, ppO2: next.ppO2, temp: next.temp });
      // alerts only on a worsening transition, so they don't spam every tick
      const rank = { nominal: 0, caution: 1, critical: 2 };
      Object.keys(status).forEach(k => {
        if (rank[status[k]] > rank[prev.status[k]]) A.raiseAlert('closed_env', status[k], THRESHOLDS[k].sourceId);
      });
    },
    setManualCO2(value) {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 20) return { ok: false, error: 'Enter a CO₂ value between 0 and 20 mmHg.' };
      const rounded = +n.toFixed(2);
      A.updateEnvironment({ ppCO2: rounded, source: 'manual', manualCO2: true });
      return { ok: true, value: rounded };
    },
    resumeCO2Simulation() {
      if (!store.get().environment.manualCO2) return;
      A.updateEnvironment({ source: 'simulated', manualCO2: false });
    },
    updateRadiation(patch) {
      const prev = store.get().radiation, next = Object.assign({}, prev, patch);
      store.set({ radiation: next });
      const lim = next.warnLimit.value;   // null until verified -> no alert is invented
      if (lim != null && next.cumulative_mSv >= lim && prev.cumulative_mSv < lim) A.raiseAlert('radiation', 'caution', next.warnLimit.verifyAgainst);
    },
    setComms(state, delaySec = 0) {
      store.set({ comms: { state, delaySec } });
      bus.emit(EVENTS.COMMS_STATE_CHANGED, { state, delaySec });
      if (state === 'offline') A.raiseAlert('distance', 'caution', 'ntrs-hhp');
    }
  };

  /* ---------- 7) SIMULATION ENGINE (demo controls) ---------- */
  const sim = (function () {
    let timer = null, co2Boost = 0;
    const rnd = (a) => (Math.random() - 0.5) * 2 * a;
    function tick() {
      const e = store.get().environment, r = store.get().radiation;
      const baseCO2 = 2.6 + co2Boost;
      const patch = {
        ppO2: +(e.ppO2 + (150 - e.ppO2) * 0.2 + rnd(0.4)).toFixed(1),
        temp: +(e.temp + (22.5 - e.temp) * 0.1 + rnd(0.05)).toFixed(2)
      };
      if (!e.manualCO2) patch.ppCO2 = +helpers.clamp(e.ppCO2 + (baseCO2 - e.ppCO2) * 0.25 + rnd(0.03), 0.3, 6).toFixed(2);
      A.updateEnvironment(patch);
      A.updateRadiation({ cumulative_mSv: +(r.cumulative_mSv + r.doseRate_mSv_day / 86400 * 60).toFixed(4) }); // 1 s tick ~ 1 min mission time (demo)
    }
    return {
      start(ms = 1000) { if (!timer) timer = setInterval(tick, ms); },
      stop() { clearInterval(timer); timer = null; },
      raiseCO2() { co2Boost = 0.9; },
      clearCO2() { co2Boost = 0; },
      cutComms() { A.setComms('offline', 0); },
      restoreComms() { A.setComms('online', 0); },
      boostDose() { A.updateRadiation({ doseRate_mSv_day: +(store.get().radiation.doseRate_mSv_day * 2).toFixed(3) }); },
      resetDose() { A.updateRadiation({ doseRate_mSv_day: 0.5 }); }
    };
  })();

  /* ---------- 8) DATA LOADERS — real file if present, otherwise simulated + flagged ---------- */
  const markSource = (id, type) => { const s = store.get().sources.find(x => x.id === id); if (s) s.type = type; };
  async function loadCSV(path) {
    const res = await fetch(path); if (!res.ok) throw new Error(path + ' ' + res.status);
    const [head, ...rows] = (await res.text()).trim().split(/\r?\n/);
    const cols = head.split(',').map(c => c.trim());
    return rows.map(r => { const v = r.split(','); const o = {}; cols.forEach((c, i) => { o[c] = isNaN(+v[i]) ? v[i] : +v[i]; }); return o; });
  }
  const loaders = {
    loadCSV,
    /** PhysioNet BIDMC, 1 Hz. Expected file: data/bidmc_sample.csv with columns hr,resp,spo2 */
    async loadPhysio(path = 'data/bidmc_sample.csv') {
      try { const rows = await loadCSV(path); markSource('physionet-bidmc', 'real'); return { type: 'real', rows }; }
      catch (e) {
        const rows = Array.from({ length: 300 }, (_, i) => ({ hr: +(72 + 4 * Math.sin(i / 20) + rnd1()).toFixed(1), resp: +(15 + 1.5 * Math.sin(i / 30) + rnd1() / 4).toFixed(1), spo2: +(97.5 + rnd1() / 3).toFixed(1) }));
        markSource('physionet-bidmc', 'simulated'); return { type: 'simulated', rows };
      }
    },
    /** OSDR summary (Inspiration4 cardio / OSD-1018 sleep). Expected: data/osdr_<name>.csv */
    async loadOSDRSummary(name = 'i4', path) {
      const p = path || `data/osdr_${name}.csv`, id = name === '1018' ? 'osdr-osd-1018' : 'osdr-i4';
      try { const rows = await loadCSV(p); markSource(id, 'real'); return { type: 'real', rows }; }
      catch (e) { markSource(id, 'simulated'); return { type: 'simulated', rows: [] }; }
    }
  };
  function rnd1() { return (Math.random() - 0.5) * 2; }

  window.Core = { C: { REGIONS, REGION_LABELS, SYSTEMS, STATUS, HAZARD_IDS, EVENTS, HAZARDS, SOURCES, THRESHOLDS, TO_VERIFY }, store, bus, actions: A, helpers, sim, loaders };
})();
