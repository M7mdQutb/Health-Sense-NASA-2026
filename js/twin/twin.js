/* ============================================================
   TASK 2 — 3D Digital Twin Core  (folder: src/twin in the contract)
   window.Twin.create(container, opts) -> TwinCanvas API
     setRegionColors({region: '#hex' | 'nominal'|'caution'|'critical'})   ← Task 3 calls this
     setHighlighted([regionIds])
     setMarkers([{region, intensity:0..1, type:'symptom'|'env_alert'|'radiation_source'}])   ← Task 4
     focusRegion(id) · resetView() · setEffects({...}) · setEffectsEnabled(bool)
     setAutonomous(bool) · setQuality('high'|'low') · destroy()
     setMuscleOptions({tendons:bool|0..1, fibres:bool|0..1})   ← muscle texture toggles
   Body surface = the muscles model (muscles.js), split into one mesh per region. The old body_shell ("skin") meshes are no longer used.
   Depends on: window.THREE (r128), window.Core (Task 1), window.TWIN_DATA (python build: bone / organ / centre / radius),
               window.createMuscles (muscles.js), window.MUSCLE_REGIONS (tools/build_muscle_regions.py -> data/muscle_regions.js).
   ============================================================ */
(function () {
  'use strict';
  const T = window.THREE, Core = window.Core, C = Core.C, EV = C.EVENTS;

  /* ---------- hologram shader: ONE program shared by every mesh ---------- */
  const U = { uTime: { value: 0 }, uAuto: { value: 0 } };   // shared uniform objects
  const VERT = `varying vec3 vN; varying vec3 vV; varying float vY;
    void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = -mv.xyz; vY = position.y; gl_Position = projectionMatrix*mv; }`;
  const FRAG = `uniform vec3 uColor; uniform float uGlow, uOpacity, uSolid, uTime, uAuto;
    varying vec3 vN; varying vec3 vV; varying float vY;
    void main(){
      vec3 n = normalize(vN), v = normalize(vV); float nv = abs(dot(n, v));
      float rim = pow(1.0 - nv, 2.2); float scan = 0.88 + 0.12*sin(vY*70.0 - uTime*1.2);
      vec3 col; float a;
      if (uSolid > 0.5) { col = uColor*(0.28 + 0.55*nv + 0.5*rim); a = 1.0; }
      else { col = uColor*(0.45 + 1.25*rim) + uGlow*vec3(0.55,0.85,1.0); a = (uOpacity*(0.22 + 1.0*rim) + uGlow*0.32)*scan; }
      vec3 amber = vec3(1.0, 0.69, 0.18); col = mix(col, amber*(0.35 + rim), uAuto*0.4);
      gl_FragColor = vec4(col + uGlow*0.25*uSolid, clamp(a, 0.0, 1.0));
    }`;
  function makeMat(color, solid, opacity, overlay) {
    return new T.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: T.DoubleSide, transparent: !solid, depthWrite: solid,
      polygonOffset: !!overlay, polygonOffsetFactor: -2, polygonOffsetUnits: -2,      // overlay sits on the muscle surface without z-fighting
      uniforms: { uColor: { value: new T.Color(color) }, uGlow: { value: 0 }, uOpacity: { value: opacity || 0.5 }, uSolid: { value: solid ? 1 : 0 }, uTime: U.uTime, uAuto: U.uAuto }
    });
  }

  /* ---------- data decode (python → typed arrays) ---------- */
  const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  function geometry(d) {
    const q = new Uint16Array(b64(d.p)), pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) pos[i] = d.lo[i % 3] + (q[i] / 65535) * d.sc[i % 3];
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setIndex(new T.BufferAttribute(new Uint16Array(b64(d.i)), 1));
    g.computeVertexNormals(); return g;
  }

  /* muscles.js is ONE mesh. Place it in the body_data coordinate system (verified by tools/build_muscle_regions.py). */
  const MUSCLE_HEIGHT = 2.0, MUSCLE_Y = -0.9996;

  /* Split the muscles mesh into one BufferGeometry per region. labels = one region index per vertex (MUSCLE_REGIONS.v).
     A triangle goes to the region of the majority of its vertices. Normals / tendon / fibre attributes are copied, so shading has no seams. */
  function splitMuscles(full, mr, wanted) {
    const lab = new Uint8Array(b64(mr.v)), A = full.attributes, nv = A.position.count;
    if (lab.length !== nv) throw new Error('Twin: muscle_regions.js has ' + lab.length + ' labels but muscles.js has ' + nv + ' vertices - re-run tools/build_muscle_regions.py');
    const P = A.position.array, N = A.normal.array, TD = A.tend.array, FD = A.fdir.array, IX = full.index.array, nt = IX.length / 3;
    const tris = {};
    for (let t = 0; t < nt; t++) {
      const la = lab[IX[3 * t]], lb = lab[IX[3 * t + 1]], lc = lab[IX[3 * t + 2]], id = mr.ids[lb === lc ? lb : la];
      (tris[id] || (tris[id] = [])).push(t);
    }
    const remap = new Int32Array(nv).fill(-1), out = {};
    wanted.forEach(id => {
      const list = tris[id]; if (!list) return;
      const verts = [];
      list.forEach(t => { for (let k = 0; k < 3; k++) { const v = IX[3 * t + k]; if (remap[v] < 0) { remap[v] = verts.length; verts.push(v); } } });
      const n = verts.length, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), td = new Float32Array(n), fd = new Float32Array(n * 3);
      const ix = n < 65536 ? new Uint16Array(list.length * 3) : new Uint32Array(list.length * 3);
      verts.forEach((v, i) => { for (let k = 0; k < 3; k++) { pos[i * 3 + k] = P[v * 3 + k]; nor[i * 3 + k] = N[v * 3 + k]; fd[i * 3 + k] = FD[v * 3 + k]; } td[i] = TD[v]; });
      list.forEach((t, i) => { for (let k = 0; k < 3; k++) ix[i * 3 + k] = remap[IX[3 * t + k]]; });
      verts.forEach(v => { remap[v] = -1; });
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3));
      g.setAttribute('tend', new T.BufferAttribute(td, 1)); g.setAttribute('fdir', new T.BufferAttribute(fd, 3));
      g.setIndex(new T.BufferAttribute(ix, 1)); out[id] = g;
    });
    return out;
  }

  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || null;
  /* INTEGRATION PATCH: body base colours come from the palette tokens (css/tokens.css) */
  const BASE = { skin: css('--twin-skin') || '#92C1AD', bone: css('--twin-bone') || '#EBFDFD', organ: css('--twin-organ') || '#C7E8DF' };
  const BACK = ['upper_back', 'lower_back', 'spine'];
  const MARKER_STYLE = { symptom: { color: '#ff5a64' }, env_alert: { color: '#ffb02e' }, radiation_source: { color: '#b68cff' } };

  function create(container, opts) {
    if (typeof window.createMuscles !== 'function' || !window.MUSCLE_REGIONS) throw new Error('Twin: load muscles.js and data/muscle_regions.js before Twin.create()');
    opts = Object.assign({ bindToStore: true, autoQuality: true, effects: true }, opts || {});
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    container.classList.add('twin');

    /* renderer / scene / camera */
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);                          // transparent → HUD shows behind
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    const el = renderer.domElement; el.className = 'twin-canvas'; container.appendChild(el);
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(38, 1, 0.05, 50);
    const body = new T.Group(); scene.add(body);
    /* muscles use a lit material (the hologram shaders ignore lights): the light rig turns with the camera azimuth, so the front is always lit */
    const lightRig = new T.Group(); scene.add(lightRig);
    lightRig.add(new T.HemisphereLight(0xcfe6ff, 0x40202a, 0.75));
    const keyLight = new T.DirectionalLight(0xffffff, 1.1); keyLight.position.set(2, 4, 5); lightRig.add(keyLight);
    const rimLight = new T.DirectionalLight(0x5fe0d6, 0.6); rimLight.position.set(-3, 2, -3); lightRig.add(rimLight);

    /* build regions: muscle mesh (+ status overlay) from muscles.js, bone / organ meshes from body_data.js */
    const regions = {}, pickables = [];
    let activePickables = pickables;
    const proto = window.createMuscles(T, { height: MUSCLE_HEIGHT }), muscleMat = proto.material, MU = proto.userData.uniforms;
    const muscleGeos = splitMuscles(proto.geometry, window.MUSCLE_REGIONS, C.REGIONS);
    const muscleRoot = new T.Group(); muscleRoot.position.y = MUSCLE_Y; body.add(muscleRoot);
    C.REGIONS.forEach(id => {
      const d = window.TWIN_DATA.regions[id], g = new T.Group(); g.name = id; body.add(g);
      const r = regions[id] = { id, data: d, group: g, color: new T.Color(BASE.skin), target: new T.Color(BASE.skin), glow: 0, ov: 0, mats: {}, meshes: {}, set: false };
      if (muscleGeos[id]) {
        const mesh = new T.Mesh(muscleGeos[id], muscleMat); mesh.name = id + '_muscles'; mesh.userData.region = id; mesh.renderOrder = 1;
        muscleRoot.add(mesh); r.meshes.muscle = mesh; pickables.push(mesh);
        /* hologram overlay on the same geometry: carries the status colour, hover / selection glow. Invisible while idle. */
        const ov = r.mats.overlay = makeMat(BASE.skin, false, 0, true); ov.uniforms.uOpacity.value = 0;
        const over = r.meshes.overlay = new T.Mesh(muscleGeos[id], ov); over.renderOrder = 3; over.visible = false; muscleRoot.add(over);
      }
      [['bone', true, 1], ['organ', true, 1]].forEach(([kind, solid, op]) => {
        if (!d[kind]) return;
        const m = r.mats[kind] = makeMat(BASE[kind], solid, op), mesh = new T.Mesh(geometry(d[kind]), m);
        r.meshes[kind] = mesh; mesh.userData.region = id; mesh.renderOrder = 1; mesh.visible = false; g.add(mesh); pickables.push(mesh);   // shown by setModel()
      });
    });
    activePickables = pickables.filter(mesh => mesh.visible);
    const defaultCol = new T.Color(BASE.skin);
    function resolveColor(v) {
      if (C.STATUS && ['nominal', 'caution', 'critical'].includes(v)) v = css('--color-' + v) || { nominal: '#5EE6EE', caution: '#FFB020', critical: '#FF5C63' }[v];
      return new T.Color(v);
    }

    let currentModel = null;
    /* profile: boneRegions[], organRegions[], showMuscles (alias: showSkin, default true), muscleOpacity (alias: skinOpacity).
       Opacity default: 1 when only muscles are shown, 0.3 (see-through) when bones / organs are shown inside. */
    function setModel(system, profile) {
      if (currentModel === system) return;
      profile = profile || {};
      const bones = new Set(profile.boneRegions || []), organs = new Set(profile.organRegions || []);
      const showM = profile.showMuscles !== undefined ? profile.showMuscles !== false : profile.showSkin !== false;
      const op = Number.isFinite(profile.muscleOpacity) ? profile.muscleOpacity : Number.isFinite(profile.skinOpacity) ? profile.skinOpacity : (bones.size || organs.size) ? 0.3 : 1;
      muscleMat.transparent = op < 0.98; muscleMat.opacity = op; muscleMat.depthWrite = op >= 0.98; muscleMat.needsUpdate = true;
      C.REGIONS.forEach(id => {
        const r = regions[id];
        if (r.meshes.muscle) r.meshes.muscle.visible = showM;
        if (r.meshes.bone) r.meshes.bone.visible = bones.has(id);
        if (r.meshes.organ) r.meshes.organ.visible = organs.has(id);
      });
      activePickables = pickables.filter(mesh => mesh.visible);
      container.dataset.model = system;
      currentModel = system;
    }
    function setMuscleOptions(o) {
      o = o || {}; const f = v => Math.min(1, Math.max(0, +v));
      if (o.tendons !== undefined) MU.uTendon.value = f(o.tendons);
      if (o.fibres !== undefined) MU.uFiber.value = f(o.fibres);
    }

    /* ---------- camera rig (own orbit controls: drag / wheel / pinch, limits, smooth focus) ---------- */
    const LIM = { dMin: 1.5, dMax: 6.5, pMin: 0.35, pMax: Math.PI - 0.35 };
    const HOME = { az: 0.25, pol: 1.5, dist: 4.4, tx: 0, ty: 0, tz: 0 };
    const cur = Object.assign({}, HOME), goal = Object.assign({}, HOME);
    const wrapNear = (a, ref) => a + Math.round((ref - a) / (2 * Math.PI)) * 2 * Math.PI;
    function setGoal(p) {
      Object.assign(goal, p);
      if (p.az !== undefined) goal.az = wrapNear(goal.az, cur.az);
      goal.dist = Math.min(LIM.dMax, Math.max(LIM.dMin, goal.dist)); goal.pol = Math.min(LIM.pMax, Math.max(LIM.pMin, goal.pol));
    }
    function applyCamera(dt) {
      const k = 1 - Math.exp(-dt * 7);
      for (const key in cur) cur[key] += (goal[key] - cur[key]) * k;
      const sp = Math.sin(cur.pol);
      camera.position.set(cur.tx + cur.dist * sp * Math.sin(cur.az), cur.ty + cur.dist * Math.cos(cur.pol), cur.tz + cur.dist * sp * Math.cos(cur.az));
      camera.lookAt(cur.tx, cur.ty, cur.tz);
      lightRig.rotation.y = cur.az;
    }
    function resetView() { setGoal(Object.assign({}, HOME, { az: wrapNear(HOME.az, cur.az) })); }
    function focusRegion(id) {
      const r = regions[id]; if (!r) return resetView();
      const c = r.data.center, rad = r.data.radius;
      setGoal({ tx: c[0], ty: c[1], tz: c[2], az: BACK.includes(id) ? Math.PI : 0.2, pol: 1.5, dist: Math.min(4.6, Math.max(1.8, rad * 2.6 + 1.2)) });
    }

    /* ---------- pointer input ---------- */
    const ptrs = new Map(); let down = null, hoverId = null, selectedId = null, needPick = false, pinch0 = 0;
    const ndc = new T.Vector2(), ray = new T.Raycaster(), label = document.createElement('div');
    label.className = 'twin-label'; container.appendChild(label);
    function pick(e) {
      const b = el.getBoundingClientRect(); ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(ndc, camera); const h = ray.intersectObjects(activePickables, false)[0]; return h ? h.object.userData.region : null;
    }
    function setHover(id, e) {
      hoverId = id; el.style.cursor = id ? 'pointer' : 'grab';
      if (!id) { label.classList.remove('on'); return; }
      label.textContent = Core.helpers.regionLabel(id); label.classList.add('on');
      const b = container.getBoundingClientRect(); label.style.transform = `translate(${e.clientX - b.left + 14}px, ${e.clientY - b.top + 14}px)`;
    }
    let lastMove = null;
    const onDown = e => {
      el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, multi: ptrs.size > 1 };
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); down.multi = true; }
      if (e.pointerType !== 'mouse') setHover(pick(e), e);
      el.style.cursor = 'grabbing';
    };
    const onMove = e => {
      const p = ptrs.get(e.pointerId);
      if (!p) { lastMove = e; needPick = true; return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (down) down.moved += Math.abs(dx) + Math.abs(dy);
      if (ptrs.size === 1) { setGoal({ az: goal.az - dx * 0.0085, pol: goal.pol - dy * 0.0085 }); if (down && down.moved > 6) setHover(null); }
      else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) setGoal({ dist: goal.dist * (pinch0 / d) }); pinch0 = d; }
    };
    const onUp = e => {
      ptrs.delete(e.pointerId); el.style.cursor = 'grab';
      if (down && !down.multi && down.moved < 7 && performance.now() - down.t < 600) {
        const id = pick(e);
        if (id) { selectedId = id; Core.actions.selectRegion(id); focusRegion(id); }   // → emits region:selected
      }
      if (!ptrs.size) down = null; pinch0 = 0;
      if (e.pointerType !== 'mouse') setHover(null);
    };
    const onWheel = e => { e.preventDefault(); setGoal({ dist: goal.dist * Math.exp(e.deltaY * 0.0012) }); };
    const onLeave = () => { if (!ptrs.size) setHover(null); };
    el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp); el.addEventListener('pointerleave', onLeave); el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('dblclick', resetView);

    /* reset button */
    const btn = document.createElement('button'); btn.className = 'twin-reset'; btn.type = 'button'; btn.title = 'Reset view'; btn.setAttribute('aria-label', 'Reset view');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v4.5h4.5"/></svg>';
    btn.onclick = resetView; container.appendChild(btn);

    /* ---------- colouring / highlight / markers ---------- */
    let highlighted = new Set();
    function setRegionColors(map) {
      C.REGIONS.forEach(id => { const r = regions[id]; r.target = map && map[id] != null ? resolveColor(map[id]) : defaultCol.clone(); r.set = !!(map && map[id] != null); });
    }
    function setHighlighted(ids) { highlighted = new Set(ids || []); }

    const markerGroup = new T.Group(); body.add(markerGroup);
    const geos = { symptom: new T.SphereGeometry(0.034, 14, 10), env_alert: new T.OctahedronGeometry(0.05), radiation_source: new T.TorusGeometry(0.045, 0.011, 8, 24) };
    let markerMeshes = [];
    function markerPos(region, i, n) {
      const r = regions[region], c = r.data.center, rad = r.data.radius, side = region[0] === 'l' && region[1] === '_' ? 1 : region[0] === 'r' && region[1] === '_' ? -1 : 0;
      const out = BACK.includes(region) ? -1 : 1, a = n > 1 ? (i / n) * Math.PI * 2 : 0, spread = n > 1 ? 0.06 : 0;
      return new T.Vector3(c[0] + side * Math.min(rad, 0.12) * 0.8 + Math.cos(a) * spread, c[1] + Math.sin(a) * spread, c[2] + (side ? 0.0 : out * Math.min(rad, 0.34) * 0.9) + (side ? 0.1 : 0));
    }
    function setMarkers(list) {
      markerMeshes.forEach(m => { markerGroup.remove(m); m.material.dispose(); }); markerMeshes = [];
      const per = {}; (list || []).forEach(m => { per[m.region] = (per[m.region] || 0) + 1; }); const idx = {};
      (list || []).forEach(m => {
        if (!regions[m.region]) return; const type = MARKER_STYLE[m.type] ? m.type : 'symptom', i = idx[m.region] || 0;
        idx[m.region] = i + 1; const mesh = new T.Mesh(geos[type], new T.MeshBasicMaterial({ color: MARKER_STYLE[type].color, transparent: true, opacity: 0.95, depthTest: false }));
        mesh.position.copy(markerPos(m.region, i, per[m.region])); mesh.renderOrder = 10;
        mesh.userData = { type, base: 0.7 + 0.8 * Core.helpers.clamp(m.intensity == null ? 0.5 : m.intensity, 0, 1), phase: Math.random() * 6 };
        markerGroup.add(mesh); markerMeshes.push(mesh);
      });
    }

    /* ---------- optional NASA-hazard effects ---------- */
    const fx = { fluidShift: false, radiation: 0, respiratory: 0, enabled: opts.effects };
    const PN = 360, pPos = new Float32Array(PN * 3), pGeo = new T.BufferGeometry();
    for (let i = 0; i < PN; i++) { pPos[i * 3] = (Math.random() - 0.5) * 1.6; pPos[i * 3 + 1] = (Math.random() - 0.5) * 2.4; pPos[i * 3 + 2] = (Math.random() - 0.5) * 1.2; }
    pGeo.setAttribute('position', new T.BufferAttribute(pPos, 3)); pGeo.setDrawRange(0, 0);
    const particles = new T.Points(pGeo, new T.PointsMaterial({ color: 0xc9a8ff, size: 0.018, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false }));
    particles.frustumCulled = false; scene.add(particles);
    function setEffects(p) { Object.assign(fx, p); }
    function setEffectsEnabled(on) { fx.enabled = !!on; if (!on) pGeo.setDrawRange(0, 0); }

    function setAutonomous(on) { container.classList.toggle('twin--autonomous', !!on); U.uAuto.value = on ? 1 : 0; }
    function setQuality(q) { renderer.setPixelRatio(q === 'low' ? 1 : Math.min(devicePixelRatio || 1, 1.5)); if (q === 'low') setEffectsEnabled(false); resize(); container.dataset.quality = q; if (opts.onQuality) opts.onQuality(q); }

    /* ---------- resize: always follow the container ---------- */
    function resize() {
      const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
      renderer.setSize(w, h, false); camera.aspect = w / h;
      camera.fov = w / h < 0.8 ? 52 : 38;                 // portrait containers: widen so the body still fits
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize); ro.observe(container); resize();

    /* ---------- store / bus binding ---------- */
    const unsubs = [];
    if (opts.bindToStore) {
      let lastSel = Core.store.get().ui.selectedRegion;
      unsubs.push(Core.store.subscribe(s => {
        if (s.ui.selectedRegion !== lastSel) { lastSel = s.ui.selectedRegion; selectedId = lastSel; if (lastSel) focusRegion(lastSel); else resetView(); }
        const env = s.environment, lim = C.THRESHOLDS.ppCO2.max;
        fx.respiratory = Core.helpers.clamp(env.ppCO2 / lim, 0, 1.6);
        fx.radiation = Core.helpers.clamp(s.radiation.doseRate_mSv_day / 2, 0, 1);   // visual scale only — NOT a dose limit
        fx.fluidShift = s.regionStatus.cardiovascular.head.status !== 'nominal';
      }));
      unsubs.push(Core.bus.on(EV.COMMS_STATE_CHANGED, p => setAutonomous(p.state === 'offline')));
      setAutonomous(Core.store.get().comms.state === 'offline');
    }

    /* ---------- main loop ---------- */
    let t = 0, last = performance.now(), raf = null, frames = 0, acc = 0, lowStreak = 0, pickClock = 0;
    const tmp = new T.Color();
    function frame(now) {
      if (document.hidden) { raf = null; return; }
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt; U.uTime.value = t;
      // idle: slow weightless float
      if (!reduceMotion) { body.position.y = Math.sin(t * 0.55) * 0.018; body.rotation.z = Math.sin(t * 0.33) * 0.012; body.rotation.y = Math.sin(t * 0.21) * 0.025; }
      applyCamera(dt);
      // throttled hover picking
      pickClock += dt; if (needPick && pickClock > 0.08 && lastMove && !ptrs.size) { pickClock = 0; needPick = false; setHover(pick(lastMove), lastMove); }
      const fxOn = fx.enabled && !reduceMotion;
      const breathe = 0.5 + 0.5 * Math.sin(t * (1.2 + fx.respiratory * 1.6));
      C.REGIONS.forEach(id => {
        const r = regions[id]; let g = 0;
        if (id === hoverId) g = 0.38; if (id === selectedId) g = Math.max(g, 0.22);
        if (highlighted.has(id)) g = Math.max(g, 0.3 + 0.18 * Math.sin(t * 3));
        if (fxOn) {
          if (fx.fluidShift && (id === 'head' || id === 'neck')) g += 0.12 + 0.14 * Math.sin(t * 1.1);
          if (id === 'chest') g += 0.04 + 0.16 * breathe * Math.min(1, fx.respiratory);
        }
        r.glow += (g - r.glow) * 0.18; r.color.lerp(r.target, 0.2);
        const m = r.mats;
        if (m.overlay) {                                              // status colour / glow on top of the muscles
          r.ov += ((r.set ? 0.6 : 0) - r.ov) * 0.18;
          const show = r.meshes.muscle.visible && (r.ov > 0.01 || r.glow > 0.01); r.meshes.overlay.visible = show;
          if (show) { const u = m.overlay.uniforms; u.uColor.value.copy(r.color); u.uGlow.value = r.glow; u.uOpacity.value = r.ov; }
        }
        if (m.bone && r.meshes.bone.visible) { tmp.set(BASE.bone).lerp(r.color, r.set ? 0.5 : 0); m.bone.uniforms.uColor.value.copy(tmp); m.bone.uniforms.uGlow.value = r.glow * 0.6; }
        if (m.organ && r.meshes.organ.visible) { tmp.set(BASE.organ).lerp(r.color, r.set ? 0.4 : 0); m.organ.uniforms.uColor.value.copy(tmp); m.organ.uniforms.uGlow.value = r.glow * 0.6; }
      });
      markerMeshes.forEach(m => { const s = m.userData.base * (1 + 0.18 * Math.sin(t * 4 + m.userData.phase)); m.scale.setScalar(s); if (m.userData.type === 'radiation_source') m.quaternion.copy(camera.quaternion); else m.rotation.y += dt; });
      if (fxOn && fx.radiation > 0.02) {                              // radiation: particles streaming across the body
        const n = Math.floor(PN * fx.radiation), sp = 0.35 + fx.radiation * 0.8; pGeo.setDrawRange(0, n);
        for (let i = 0; i < n; i++) { pPos[i * 3] += sp * dt * 0.5; pPos[i * 3 + 1] -= sp * dt; if (pPos[i * 3 + 1] < -1.2) { pPos[i * 3 + 1] = 1.2; pPos[i * 3] = (Math.random() - 0.5) * 1.6; } if (pPos[i * 3] > 0.9) pPos[i * 3] = -0.9; }
        pGeo.attributes.position.needsUpdate = true;
      } else pGeo.setDrawRange(0, 0);
      renderer.render(scene, camera);
      // auto quality guard: drop effects + pixel ratio if frames stay slow
      if (opts.autoQuality) { acc += dt; frames++; if (frames >= 90) { const fps = frames / acc; frames = 0; acc = 0; lowStreak = fps < 28 ? lowStreak + 1 : 0; if (lowStreak >= 2 && container.dataset.quality !== 'low') setQuality('low'); } }
    }
    function onVisibilityChange() {
      if (document.hidden) { if (raf !== null) cancelAnimationFrame(raf); raf = null; }
      else if (raf === null) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (!document.hidden) raf = requestAnimationFrame(frame);
    el.style.cursor = 'grab';

    return {
      regions, setRegionColors, setHighlighted, setMarkers, setModel, setMuscleOptions, focusRegion, resetView, setEffects, setEffectsEnabled, setAutonomous, setQuality,
      getSelected: () => selectedId,
      triangleCount: () => pickables.reduce((n, m) => n + m.geometry.index.count / 3, 0),
      destroy() {
        if (raf !== null) cancelAnimationFrame(raf);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        ro.disconnect(); unsubs.forEach(f => f());
        pickables.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
        Object.values(regions).forEach(r => { if (r.mats.overlay) r.mats.overlay.dispose(); }); muscleMat.dispose();
        markerMeshes.forEach(mesh => mesh.material.dispose()); Object.values(geos).forEach(geo => geo.dispose());
        pGeo.dispose(); particles.material.dispose(); renderer.dispose(); container.innerHTML = '';
      }
    };
  }
  window.Twin = { create };
})();
