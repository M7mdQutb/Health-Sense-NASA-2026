/* ============================================================
   TASK 3 — Layers  (folder: js/layers; contract: src/layers)
   Port of twin-py/twin/layers.py onto the shared Core store.
   window.Layers = { compute, summarize, reasonFor, paint, init, active, setActive, STATUS_WORD, TRACKED, REASONS }
   No colours here: status names only; CSS tokens (and Twin.resolveColor) turn them into colours.
   ============================================================ */
(function () {
  'use strict';
  const { C, store, bus, actions, helpers, sim } = Core;
  const RANK = { na: -1, nominal: 0, caution: 1, critical: 2 };
  const worst = (...a) => a.filter(Boolean).reduce((m, s) => (RANK[s] > RANK[m] ? s : m), 'nominal');
  const STATUS_WORD = { nominal: 'Nominal', caution: 'Caution', critical: 'Critical', na: 'Not tracked' };
  const KEY_MSG = { nominal: 'Within the expected range', caution: 'Watch this area', critical: 'Act now' };

  // Which regions each layer actually tracks (00 §ب: respiratory on chest; immune on chest, abdomen, head)
  const TRACKED = { respiratory: ['chest'], immune: ['chest', 'abdomen', 'head'] };
  const SYS_LABEL = { skeletal: 'Skeletal', cardiovascular: 'Cardiovascular', nervous: 'Nervous', respiratory: 'Respiratory', immune: 'Immune' };
  const SYS_SOURCE = { skeletal: 'hrp-risks', cardiovascular: 'hrp-risks', nervous: 'hrp-hazards', respiratory: 'eclss-ochmo', immune: 'hrp-radiation' };

  // Supplied anatomy is grouped by body region, not by organ system.
  // Profiles select the closest available view and document structures not present as separate meshes.
  const MODEL_VIEWS = {
    skeletal: { boneRegions: C.REGIONS.slice(), organRegions: [], focusRegions: ['spine', 'upper_back', 'lower_back', 'l_hip', 'r_hip', 'l_femur', 'r_femur', 'l_shoulder', 'r_shoulder'], showSkin: false, description: 'Skeleton only' },
    cardiovascular: { boneRegions: [], organRegions: ['chest'], focusRegions: ['head', 'neck', 'chest'], skinOpacity: 0.28, description: 'Chest organ region; the source mesh groups the heart with nearby organs' },
    nervous: { boneRegions: ['head', 'neck', 'spine'], organRegions: [], focusRegions: ['head', 'neck', 'spine'], skinOpacity: 0.16, description: 'Head, neck and spine landmarks; no separate brain mesh is supplied' },
    respiratory: { boneRegions: [], organRegions: ['chest', 'neck'], focusRegions: ['neck', 'chest'], skinOpacity: 0.28, description: 'Chest and neck organ regions; internal structures are grouped by body region' },
    immune: { boneRegions: [], organRegions: ['chest', 'abdomen'], focusRegions: ['head', 'chest', 'abdomen'], skinOpacity: 0.28, description: 'Chest and abdomen organ regions; immune organs are not individually separated' }
  };
  let lastPaintSystem = null, lastColorKey = null, lastMarkerKey = null;

  // Countermeasure catalogue (durations are demo values, not NASA numbers). Registered into store.countermeasures at init.
  const CATALOG = [
    { id: 'ared', name: 'ARED resistance session', system: 'skeletal', regions: ['spine', 'l_femur', 'r_femur', 'l_hip', 'r_hip'], durationMin: 45 },
    { id: 'spine-stretch', name: 'Spinal decompression stretch', system: 'skeletal', regions: ['spine', 'lower_back', 'upper_back'], durationMin: 8, purpose: 'relieve pressure across the lower spine' },
    { id: 'shoulder-mobility', name: 'Shoulder mobility routine', system: 'skeletal', regions: ['l_shoulder', 'r_shoulder', 'l_arm', 'r_arm'], durationMin: 5, purpose: 'restore joint movement' },
    { id: 'head-pressure', name: 'Head pressure measurement', system: 'cardiovascular', regions: ['head', 'neck'], durationMin: 10 },
    { id: 'fluid-load', name: 'Fluid loading + compression', system: 'cardiovascular', regions: ['chest', 'neck'], durationMin: 20 },
    { id: 'meditation', name: 'Guided meditation', system: 'nervous', regions: ['head'], durationMin: 12 },
    { id: 'cabin-vent', name: 'Ventilate cabin and re-measure', system: 'respiratory', regions: ['chest'], durationMin: 5 },
    { id: 'shelter', name: 'Reduce exposure / shelter', system: 'immune', regions: ['chest', 'abdomen', 'head'], durationMin: 30 }
  ];
  const _r = (reason, cm, source) => ({ reason, cm, source });
  const REASONS = {
    skeletal: {
      lower_back: _r('The spine lengthens in microgravity and loading is low, so the lower back is under strain and losing support.', 'spine-stretch', 'hrp-risks'),
      upper_back: _r('Low spinal loading in orbit reduces support along the back.', 'spine-stretch', 'hrp-risks'),
      spine: _r('Vertebrae lose bone density without gravity loading, faster when resistance sessions are skipped.', 'ared', 'hrp-risks'),
      l_hip: _r('Hips carry little load in orbit, so bone density drops, faster after missed ARED days.', 'ared', 'nasa-std-3001'),
      r_hip: _r('Hips carry little load in orbit, so bone density drops, faster after missed ARED days.', 'ared', 'nasa-std-3001'),
      l_femur: _r('Femur bone loss is a known spaceflight risk when resistance training lapses.', 'ared', 'hrp-risks'),
      r_femur: _r('Femur bone loss is a known spaceflight risk when resistance training lapses.', 'ared', 'hrp-risks'),
      l_shoulder: _r('Shoulders are unloaded in microgravity; joint movement declines without regular use.', 'shoulder-mobility', 'hrp-risks'),
      r_shoulder: _r('Shoulders are unloaded in microgravity; joint movement declines without regular use.', 'shoulder-mobility', 'hrp-risks')
    },
    cardiovascular: {
      head: _r('Fluids shift toward the head in microgravity. This can raise pressure inside the skull and blur vision (SANS).', 'head-pressure', 'hrp-risks'),
      neck: _r('Neck veins stay distended by the headward fluid shift.', 'head-pressure', 'hrp-risks'),
      chest: _r('The heart adapts to a lower workload; this raises the risk of orthostatic hypotension when standing.', 'fluid-load', 'hrp-risks')
    },
    nervous: { head: _r('Poor sleep, a shifted body clock and stress add up to high cognitive load.', 'meditation', 'hrp-hazards') },
    respiratory: { chest: _r('One of ppCO2 or ppO2 is outside, or approaching, its cabin range. Chest status is the worst of the two.', 'cabin-vent', 'eclss-ochmo') },
    immune: {
      chest: _r('Accumulated radiation dose can suppress immune function.', 'shelter', 'hrp-radiation'),
      abdomen: _r('Accumulated radiation dose can suppress immune function.', 'shelter', 'hrp-radiation'),
      head: _r('Accumulated radiation dose can suppress immune function and affect the brain.', 'shelter', 'hrp-radiation')
    }
  };

  const openSymptoms = () => store.get().symptoms.filter(s => !s.resolved);
  const sevStatus = n => (n >= 7 ? 'critical' : n >= 4 ? 'caution' : null);   // 00 §د: 1–3 mild, 4–6 moderate, 7–10 severe

  /** system -> { region: { status, score, tracked, fromSymptom, source, origin, reason } } */
  function compute(system) {
    const s = store.get(), out = {}, tracked = TRACKED[system], severityByRegion = Object.create(null);
    openSymptoms().forEach(x => { severityByRegion[x.region] = Math.max(severityByRegion[x.region] || 0, x.severity); });
    C.REGIONS.forEach(id => {
      if (tracked && !tracked.includes(id)) { out[id] = { status: 'na', score: null, tracked: false, fromSymptom: false, source: null, origin: 'simulated', reason: 'Not tracked in this layer' }; return; }
      const e = s.regionStatus[system][id];
      let base = e.status, origin = 'simulated';
      if (system === 'respiratory') { base = worst(base, s.environment.status.ppO2); origin = s.environment.source; }
      const top = severityByRegion[id] || 0, sym = sevStatus(top);
      const status = worst(base, sym);
      out[id] = { status, score: e.score, tracked: true, fromSymptom: !!sym && RANK[sym] >= RANK[base] && status === sym && sym !== base, source: SYS_SOURCE[system], origin, reason: e.reason };
    });
    return out;
  }
  const summarize = colors => { const v = Object.values(colors); return { critical: v.filter(x => x.status === 'critical').length, caution: v.filter(x => x.status === 'caution').length }; };
  const reasonFor = (system, id) => (REASONS[system] || {})[id] || null;

  /* ---- countermeasure flow: Start -> Finish (the timer is the person's real activity) ---- */
  const L = { active: null };
  function start(id) { L.active = id; store.set({}); }
  function finish(id) { L.active = null; actions.completeCountermeasure(id); }
  function setActive(system) { actions.setSystem(system); }

  /* ---- push colours + markers into the 3D canvas (or the 2D fallback: same API) ---- */
  function paint(twin) {
    if (!twin) return;
    const s = store.get(), system = s.ui.activeSystem, profile = MODEL_VIEWS[system] || MODEL_VIEWS.skeletal;
    if (lastPaintSystem !== system) {
      if (twin.setModel) twin.setModel(system, profile);
      if (twin.setHighlighted) twin.setHighlighted(profile.focusRegions);
      lastPaintSystem = system;
    }
    const colors = compute(system), map = {};
    C.REGIONS.forEach(id => { if (colors[id].tracked) map[id] = colors[id].status; });
    const colorKey = JSON.stringify(C.REGIONS.map(id => [id, colors[id].tracked ? colors[id].status : null]));
    if (colorKey !== lastColorKey) { twin.setRegionColors(map); lastColorKey = colorKey; }
    const mk = openSymptoms().map(x => ({ region: x.region, intensity: x.severity / 10, type: 'symptom' }));
    if (s.environment.status.ppCO2 === 'critical') mk.push({ region: 'chest', intensity: 0.8, type: 'env_alert' });
    const markerKey = JSON.stringify(mk);
    if (markerKey !== lastMarkerKey) { twin.setMarkers(mk); lastMarkerKey = markerKey; }
  }
  function init() {
    store.set({ countermeasures: CATALOG.map(c => Object.assign({ boost: 20 /* demo score gain, not a medical effect */ }, c, { done: false })) });
    bus.on(C.EVENTS.COUNTERMEASURE_COMPLETED, ({ id }) => {      // side effects on the simulated world
      if (id === 'cabin-vent') sim.clearCO2();
      if (id === 'shelter') sim.resetDose();
    });
  }

  window.Layers = Object.assign(L, { compute, summarize, reasonFor, paint, init, start, finish, setActive, openSymptoms, sevStatus, worst, STATUS_WORD, KEY_MSG, SYS_LABEL, SYS_SOURCE, TRACKED, REASONS, CATALOG, MODEL_VIEWS });
})();
