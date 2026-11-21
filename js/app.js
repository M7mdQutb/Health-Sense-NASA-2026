/* App wiring: the only file that knows every module. Order = 00 §5 (core -> ui shell -> twin -> layers -> logging -> gamification). */
(function () {
  'use strict';
  const { store, bus, actions, sim, C } = Core;
  Layers.init(); 
  // Gamification.init();
  UI.init();

  const stage = document.getElementById('stage'); let twin, fallbackWhy = null;
  try {
    if (!window.THREE) throw new Error('three.js not loaded (run: python serve.py --fetch)');
    twin = Twin.create(stage, { onQuality: q => console.info('[twin] quality', q) });
  } catch (err) {
    fallbackWhy = err.message; console.warn('[twin] using 2D fallback:', err);
    stage.innerHTML = ''; stage.className = 'stage'; twin = TwinFallback.create(stage);
    stage.insertAdjacentHTML('beforeend', '<div class="stage-note">2D schematic: the 3D view needs three.js (run <code>python serve.py --fetch</code> once) and WebGL.</div>');
  }
  const paint = () => Layers.paint(twin);
  let raf = 0; store.subscribe(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); });
  paint();

  bus.on(C.EVENTS.COMMS_STATE_CHANGED, p => twin.setAutonomous(p.state === 'offline'));
  sim.start(2000);                       // telemetry cadence: every 2 s, all data from Core.sim (replaceable by a live source)
  //window.HS = { twin, Core, Layers, Logging, Gamification, UI, fallbackWhy };
  window.HS = { twin, Core, Layers, Logging, UI, fallbackWhy };

})();
