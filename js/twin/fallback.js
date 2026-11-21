/* 2D schematic fallback for Task 2's canvas. Same API subset as Twin.create(), used when three.js / WebGL is unavailable.
   Body schematic from twin-py (SVG viewBox 0 0 300 590). Colours come from CSS classes -> tokens. */
(function () {
  'use strict';
  const { C, store, actions, helpers } = Core, NS = 'http://www.w3.org/2000/svg';
  const SHAPES = {   // kind: e=ellipse c=circle r=rect
    head: ['e', 150, 45, 30, 36], neck: ['r', 138, 78, 24, 22], chest: ['r', 105, 100, 90, 50], upper_back: ['r', 105, 150, 90, 30], abdomen: ['r', 105, 180, 90, 50],
    lower_back: ['r', 105, 230, 90, 45], spine: ['r', 143, 100, 14, 175], l_shoulder: ['c', 90, 112, 17, 17], r_shoulder: ['c', 210, 112, 17, 17],
    l_arm: ['r', 66, 132, 22, 110], r_arm: ['r', 212, 132, 22, 110], l_hip: ['r', 106, 277, 42, 32], r_hip: ['r', 152, 277, 42, 32],
    l_femur: ['r', 108, 311, 38, 105], r_femur: ['r', 154, 311, 38, 105], l_knee: ['r', 110, 418, 34, 28], r_knee: ['r', 156, 418, 34, 28],
    l_lower_leg: ['r', 112, 448, 30, 120], r_lower_leg: ['r', 158, 448, 30, 120]
  };
  const centre = s => (s[0] === 'r' ? [s[1] + s[3] / 2, s[2] + s[4] / 2] : [s[1], s[2]]);
  function el(tag, attrs) { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; }
  function create(container) {
    container.classList.add('fb');
    const svg = el('svg', { viewBox: '0 0 300 590', role: 'group', 'aria-label': 'Body regions. Select a region.', preserveAspectRatio: 'xMidYMid meet' });
    const shapes = {}, markerG = el('g', {});
    // draw order: torso/back first, spine and shoulders on top
    ['upper_back', 'chest', 'abdomen', 'lower_back', 'head', 'neck', 'l_arm', 'r_arm', 'l_hip', 'r_hip', 'l_femur', 'r_femur', 'l_knee', 'r_knee', 'l_lower_leg', 'r_lower_leg', 'spine', 'l_shoulder', 'r_shoulder'].forEach(id => {
      const s = SHAPES[id], e = s[0] === 'e' ? el('ellipse', { cx: s[1], cy: s[2], rx: s[3], ry: s[4] }) : s[0] === 'c' ? el('circle', { cx: s[1], cy: s[2], r: s[3] }) : el('rect', { x: s[1], y: s[2], width: s[3], height: s[4], rx: 10 });
      e.setAttribute('class', 'rg'); e.setAttribute('tabindex', '0'); e.setAttribute('role', 'button'); e.setAttribute('aria-label', helpers.regionLabel(id)); e.dataset.region = id;
      const t = el('title', {}); t.textContent = helpers.regionLabel(id); e.appendChild(t);
      e.addEventListener('click', () => actions.selectRegion(id));
      e.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); actions.selectRegion(id); } });
      svg.appendChild(e); shapes[id] = e;
    });
    svg.appendChild(markerG); container.appendChild(svg);
    const sel = () => { const cur = store.get().ui.selectedRegion; C.REGIONS.forEach(id => shapes[id].classList.toggle('sel', id === cur)); };
    const unsub = store.subscribe(sel); sel();
    return {
      fallback: true, regions: shapes,
      setRegionColors(map) { C.REGIONS.forEach(id => { shapes[id].setAttribute('class', 'rg' + (map && map[id] ? ' ' + map[id] : '') + (id === store.get().ui.selectedRegion ? ' sel' : '')); }); },
      setMarkers(list) {
        markerG.innerHTML = ''; const n = {};
        (list || []).forEach(m => { if (!SHAPES[m.region]) return; const i = n[m.region] = (n[m.region] || 0) + 1, [x, y] = centre(SHAPES[m.region]);
          const c = el('circle', { cx: x + (i - 1) * 10, cy: y, r: 4 + 7 * (m.intensity == null ? .5 : m.intensity), class: 'mk ' + (m.type || 'symptom') }); markerG.appendChild(c); });
      },
      setHighlighted() {}, setEffects() {}, setEffectsEnabled() {}, setQuality() {}, focusRegion() {}, resetView() {},
      setAutonomous(on) { container.classList.toggle('twin--autonomous', !!on); },
      destroy() { unsub(); container.innerHTML = ''; }
    };
  }
  window.TwinFallback = { create };
})();
