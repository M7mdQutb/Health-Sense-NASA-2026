/* ============================================================
   TASK 5 — Gamification  (folder: js/gamification; contract: src/gamification)
   Port of gamification/engine.py + data.py. Listens to contract events, owns the `gamification` + `crew` slices.
   Rewards only go up: symptoms never reduce XP, readiness or progress.
   XP values, levels, the 40 h goal and the 10 min alert window are GAME DESIGN numbers, not NASA values.
   ============================================================ */
(function () {
  'use strict';
  const { C, store, bus } = Core, EV = C.EVENTS;
  const ME = 'c1', GOAL_HOURS = 40, ALERT_WINDOW_MS = 10 * 60 * 1000, CABIN_TICKS_PER_DAY = 15;  // demo: 15 ticks x 2 s = 1 "cabin day"
  const XP = { symptom: 10, countermeasure: 40, checkin: 25, alert: 30, cabin: 50, node: 20, goal: 60 };
  const LEVELS = [[0, 'Cadet'], [100, 'Navigator'], [250, 'Flight Specialist'], [450, 'Mission Specialist'], [700, 'Commander'], [1000, 'Mars Pioneer']];
  const RENAMES = { 'Fill survey': 'Cognitive Calibration Sequence', 'Log symptom': 'Systems Status Report', 'Exercise session': 'Gravity Countermeasure Run (ARED)',
    'Log nutrition': 'Fuel Reserve Log', 'Sleep report': 'Rest Cycle Sync', 'Respond to CO2 alert': 'Atmosphere Response Drill' };
  const TREE = {   // branch -> [id, name, unlock text, counter, needed]
    Physical: [['p1', 'Gravity Guard', 'Finish 1 ARED run', 'ared', 1], ['p2', 'Iron Cadence', 'Finish 3 countermeasure sessions', 'countermeasures', 3], ['p3', 'Fuel Discipline', 'Log nutrition 7 days in a row', 'nutrition', 7]],
    Mental: [['m1', 'Clear Signal', 'Complete 1 calibration sequence', 'checkins', 1], ['m2', 'Steady Orbit', 'Complete 5 calibration sequences', 'checkins', 5], ['m3', 'Honest Reporter', 'File 3 status reports', 'symptoms', 3]],
    Social: [['s1', 'Crew Pulse', 'Sync 1 rest cycle', 'sleep_nights', 1], ['s2', 'Night Watch', 'Sync 4 rest cycles', 'sleep_nights', 4], ['s3', 'Silent Link', 'Finish 2 check-ins while comms are offline', 'offline_ops', 2]],
    'Environmental Awareness': [['e1', 'Cabin Watch', 'Keep the cabin in limits 1 day', 'cabin', 1], ['e2', 'CO2 Responder', 'Answer 2 atmosphere alerts promptly', 'alerts', 2], ['e3', 'Shield Keeper', 'Keep the cabin in limits 3 days in a row', 'cabin', 3]]
  };
  const BADGES = [['first', 'First Report', 'Filed your first status report', 'symptoms', 1], ['week_ared', 'Week of Iron', '5 countermeasure sessions', 'countermeasures', 5],
    ['calib', 'Calibrated', '3 calibration sequences', 'checkins', 3], ['autonomous', 'Autonomous Ops', '2 check-ins during comms blackout', 'offline_ops', 2],
    ['responder', 'First Responder', 'Answered an alert on time', 'alerts', 1], ['crew_sleep', 'Crew Night In', 'Crew reached 40 h of deep sleep together', null, 0]];
  const COUNTERS = ['symptoms', 'countermeasures', 'ared', 'checkins', 'nutrition', 'alerts', 'cabin', 'sleep_nights', 'offline_ops'];

  let E;   // engine state
  function reset() {
    const crew = store.get().crew;
    E = { c: {}, nodes: {}, badges: {}, xp: {}, hours: {}, goalDone: false, notes: ['Mission clock started. Crew standing by.'], alertOpenAt: null, cabinTicks: 0, cabinStreak: 0, cabinRewarded: false, comms: store.get().comms.state };
    crew.forEach(m => { E.c[m.id] = Object.fromEntries(COUNTERS.map(k => [k, 0])); E.nodes[m.id] = new Set(); E.badges[m.id] = new Set(); E.xp[m.id] = m.xp; E.hours[m.id] = m.deepSleepWeekly; });
    publish();
  }
  const total = () => +Object.values(E.hours).reduce((a, b) => a + b, 0).toFixed(1);
  function levelOf(xp) { let i = 0; LEVELS.forEach((l, k) => { if (xp >= l[0]) i = k; }); return { level: i + 1, title: LEVELS[i][1], nextAt: i + 1 < LEVELS.length ? LEVELS[i + 1][0] : null, prevAt: LEVELS[i][0] }; }
  const readiness = id => { const c = E.c[id]; return Math.round(60 * Math.min(c.countermeasures / 14, 1) + 40 * Math.min(c.checkins / 7, 1)); };
  const note = m => { E.notes = [m].concat(E.notes).slice(0, 8); };
  const name = id => (store.get().crew.find(m => m.id === id) || {}).name || id;
  const give = (id, n) => { E.xp[id] += n; };

  function unlock() {
    store.get().crew.forEach(m => {
      const id = m.id, c = E.c[id];
      Object.values(TREE).forEach(nodes => nodes.forEach(([nid, nm, , ctr, need]) => { if (!E.nodes[id].has(nid) && c[ctr] >= need) { E.nodes[id].add(nid); give(id, XP.node); note(`${name(id)} unlocked ${nm}.`); } }));
      BADGES.forEach(([bid, bn, , ctr, need]) => { if (ctr && !E.badges[id].has(bid) && c[ctr] >= need) { E.badges[id].add(bid); note(`${name(id)} earned the ${bn} badge.`); } });
      if (E.goalDone) E.badges[id].add('crew_sleep');
    });
  }
  /** write engine state into the shared slices; emit crew:goal-progress when the goal moved */
  let lastGoal = null;
  function publish() {
    const s = store.get(), me = levelOf(E.xp[ME]), goal = { title: 'Crew deep-sleep goal', target: GOAL_HOURS, progress: Math.min(total(), GOAL_HOURS), unit: 'h' };
    store.set({
      crew: s.crew.map(m => Object.assign({}, m, { xp: E.xp[m.id], deepSleepWeekly: +E.hours[m.id].toFixed(1) })),
      gamification: { xp: E.xp[ME], level: me.level, title: me.title, prevAt: me.prevAt, nextAt: me.nextAt, readiness: readiness(ME), badges: [...E.badges[ME]], unlockedNodes: [...E.nodes[ME]],
        counters: Object.assign({}, E.c[ME]), crewGoal: goal, goalDone: E.goalDone, notes: E.notes.slice() }
    });
    if (lastGoal !== null && lastGoal !== goal.progress) bus.emit(EV.CREW_GOAL_PROGRESS, { progress: goal.progress, target: goal.target });
    lastGoal = goal.progress;
  }
  const after = () => { unlock(); publish(); };

  bus.on(EV.SYMPTOM_LOGGED, () => { E.c[ME].symptoms++; give(ME, XP.symptom); note('Status report received. Early reporting keeps the crew ahead.'); after(); });
  bus.on(EV.COUNTERMEASURE_COMPLETED, ({ id }) => {
    const c = E.c[ME]; c.countermeasures++; give(ME, XP.countermeasure); if (id === 'ared') c.ared++;
    const cm = store.get().countermeasures.find(x => x.id === id);
    note(`${(cm && cm.name) || id} completed. ${id === 'ared' ? 'Gravity countermeasure on track.' : 'Nice work.'}`);
    if (id === 'cabin-vent' && E.alertOpenAt && Date.now() - E.alertOpenAt <= ALERT_WINDOW_MS) {   // Atmosphere Response Drill
      E.alertOpenAt = null; store.get().crew.forEach(m => { E.c[m.id].alerts++; give(m.id, XP.alert); }); note('Atmosphere alert cleared on time. Crew earns shared XP.');
    }
    after();
  });
  bus.on(EV.CHECKIN_COMPLETED, p => {
    const c = E.c[ME]; c.checkins++; give(ME, XP.checkin); if (E.comms === 'offline') c.offline_ops++;
    note('Calibration sequence logged. Readiness updated.'); after();
  });
  bus.on(EV.ALERT_RAISED, p => { if (p.hazard === 'closed_env') { E.alertOpenAt = Date.now(); note('Atmosphere alert open. Atmosphere Response Drill is ready: ventilate within 10 min.'); publish(); } });
  bus.on(EV.COMMS_STATE_CHANGED, p => { E.comms = p.state; note(p.state === 'offline' ? 'Comms blackout. Autonomous Operations challenge is live.' : 'Link restored.'); publish(); });
  bus.on(EV.ENVIRONMENT_UPDATED, () => {       // passive: cabin held in limits (not critical). Demo clock: 15 ticks = 1 "cabin day"
    const st = store.get().environment.status;
    if (Object.values(st).includes('critical')) { E.cabinTicks = 0; E.cabinStreak = 0; return; }
    if (++E.cabinTicks < CABIN_TICKS_PER_DAY) return;
    E.cabinTicks = 0; E.cabinStreak++; store.get().crew.forEach(m => { E.c[m.id].cabin = Math.max(E.c[m.id].cabin, E.cabinStreak); });
    if (E.cabinStreak >= 3 && !E.cabinRewarded) { E.cabinRewarded = true; store.get().crew.forEach(m => give(m.id, XP.cabin)); note('Cabin held in limits 3 days. Crew bonus awarded.'); }
    after();
  });

  /** Rest Cycle Sync: one night of deep sleep from the `sleep` slice (hours x deepPct) goes into the crew goal. */
  function syncRestCycle() {
    const per = store.get().sleep.perCrew;
    store.get().crew.forEach(m => { const p = per[m.id]; if (p) { E.hours[m.id] += p.hours * p.deepPct / 100; E.c[m.id].sleep_nights++; } });
    note('Rest cycle synced for the crew.');
    if (!E.goalDone && total() >= GOAL_HOURS) { E.goalDone = true; store.get().crew.forEach(m => give(m.id, XP.goal)); note('Earth data pack unlocked: movie night is on.'); }
    after();
  }
  /** Fuel Reserve Log: one nutrition log = one day in the demo. (Not a contract event; UI calls it directly.) */
  function logNutrition() { E.c[ME].nutrition++; give(ME, 15); note('Fuel reserve log filed. Reference baseline: 3035 kcal/day.'); after(); }
  function completeCheckin(p) { bus.emit(EV.CHECKIN_COMPLETED, p); }

  window.Gamification = { XP, LEVELS, TREE, BADGES, RENAMES, GOAL_HOURS, init: reset, reset, syncRestCycle, completeCheckin, logNutrition, levelOf, state: () => E };
})();
