// ForkScape — WebGL explainer stages for scenes 01 and 02.
// One custom element: <fs-stage3d scene="linear|branch|muddy|clean">
// Words stay in HTML above the canvas; only the motion lives here.
import * as THREE from '../vendor/three.module.js';

const C = { teal: 0x00d1b2, amber: 0xfbbf24, ink: 0xe8ecf4, dim: 0x5b6478, blue: 0x60a5fa };
const TAU = Math.PI * 2;
const cl = (v) => Math.max(0, Math.min(1, v));
const ease = (t) => t * t * (3 - 2 * t);
const seg = (p, a, b) => cl((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;

function mat(color, emi = 0.7) {
  return new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: emi,
    roughness: 0.62, metalness: 0.04, transparent: true
  });
}
function slab(w, h, d, color, emi) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 1, 1, 1), mat(color, emi));
  m.geometry.name = 'slab';
  return m;
}
function orb(r, color, emi) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 40, 28), mat(color, emi));
}
function rod(from, to, thick, color, emi = 0.5) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(thick, thick, len, 10);
  g.translate(0, len / 2, 0);             // origin at the "from" end → scale.y draws it
  const m = new THREE.Mesh(g, mat(color, emi));
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.userData.len = len;
  return m;
}
function bar(width, color) {
  const g = new THREE.BoxGeometry(width, 0.26, 0.26);
  g.translate(width / 2, 0, 0);           // origin at left edge
  return new THREE.Mesh(g, mat(color, 0.8));
}
function track(width) {
  const g = new THREE.BoxGeometry(width, 0.26, 0.24);
  g.translate(width / 2, 0, 0);
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: 0x1b2232, emissive: 0x0b1018, roughness: .9, transparent: true, opacity: .9
  }));
}
function flyer(color) {
  const m = orb(0.19, color, 1.4);
  m.visible = false;
  return m;
}
// straight hop with a small arc, so travel reads as travel
function place(mesh, a, b, t) {
  mesh.position.set(lerp(a[0], b[0], t), lerp(a[1], b[1], t) + Math.sin(Math.PI * t) * 0.55, lerp(a[2] || 0, b[2] || 0, t));
}

/* ── scene 01 · left: one long chat ───────────────────────────── */
function buildLinear() {
  const g = new THREE.Group();
  const TURNS = [0.10, 0.36, 0.62];       // three turns per loop
  const slabs = [];
  for (let i = 0; i < 5; i++) {
    const s = slab(3.6, 0.52, 0.72, i < 2 ? C.dim : C.amber, 0.35);
    s.position.set(-2.2, -2.0 + i * 0.82, 0);
    slabs.push(s); g.add(s);
  }
  const model = orb(1.0, C.amber, 0.35);
  model.position.set(3.0, 0.2, 0);
  g.add(model);
  const tr = track(8.6); tr.position.set(-4.3, -3.1, 0); g.add(tr);
  const fill = bar(8.6, C.amber); fill.position.set(-4.3, -3.1, 0.02); g.add(fill);

  const pool = [];
  for (let i = 0; i < 5; i++) { const f = flyer(C.amber); pool.push(f); g.add(f); }

  return {
    group: g,
    update(p) {
      const stack = 2 + TURNS.filter((t) => p > t).length;      // how many exist now
      slabs.forEach((s, i) => {
        const born = i < 2 ? 0 : TURNS[i - 2];
        const a = ease(seg(p, born, born + 0.05));
        s.visible = p > born - 0.001;
        s.scale.setScalar(lerp(0.55, 1, a));
        s.material.opacity = a;
        s.material.emissiveIntensity = 0.3;
      });
      // the whole stack re-fires on every turn — that is the point
      let sending = -1, k = 0;
      TURNS.forEach((t, i) => { if (p > t + 0.05 && p < t + 0.22) { sending = i; k = seg(p, t + 0.05, t + 0.22); } });
      if (sending >= 0) {
        const pulse = Math.sin(Math.PI * k);
        for (let i = 0; i < stack; i++) slabs[i].material.emissiveIntensity = 0.3 + pulse * 1.5;
        model.material.emissiveIntensity = 0.3 + pulse * 0.9;
      } else {
        model.material.emissiveIntensity = 0.3;
      }
      pool.forEach((f, i) => {
        const on = sending >= 0 && i < stack;
        f.visible = on;
        if (on) {
          const t = cl(k * 1.25 - i * 0.06);
          place(f, [-0.4, slabs[i].position.y], [3.0, 0.2], ease(t));
          f.material.opacity = Math.sin(Math.PI * cl(t)) * 1.2;
        }
      });
      const grown = TURNS.reduce((a, t) => a + (p > t + 0.05 ? 1 : 0), 0);
      const target = [0.22, 0.5, 0.75, 1][grown];
      fill.scale.x = Math.max(0.001, lerp(fill.scale.x || 0.22, target, 0.12));
      g.rotation.y = Math.sin(p * TAU) * 0.06;
    }
  };
}

/* ── scene 01 · right: forkscape branches ─────────────────────── */
function buildBranch() {
  const g = new THREE.Group();
  const TURNS = [0.10, 0.36, 0.62];
  const root = slab(1.9, 1.0, 0.8, C.teal, 0.5);
  root.position.set(-3.6, 0, 0); g.add(root);
  const trunk = rod([-2.6, 1.7, 0], [-2.6, -1.7, 0], 0.075, C.teal, 0.5); g.add(trunk);
  g.add(rod([-3.6, 0, 0], [-2.6, 0, 0], 0.075, C.teal, 0.5));

  const ys = [1.7, 0, -1.7], arms = [], tips = [], flyers = [];
  ys.forEach((y) => {
    const arm = rod([-2.6, y, 0], [0.7, y, 0], 0.075, C.teal, 0.5);
    arms.push(arm); g.add(arm);
    const tip = slab(1.1, 0.52, 0.6, C.teal, 0.5);
    tip.position.set(1.25, y, 0); tips.push(tip); g.add(tip);
    const f = flyer(C.teal); flyers.push(f); g.add(f);
  });
  const model = orb(1.0, C.teal, 0.35);
  model.position.set(3.3, 0, 0); g.add(model);
  const tr = track(8.6); tr.position.set(-4.3, -3.1, 0); g.add(tr);
  const fill = bar(8.6, C.teal); fill.position.set(-4.3, -3.1, 0.02); g.add(fill);

  return {
    group: g,
    update(p) {
      let sending = -1, k = 0;
      TURNS.forEach((t, i) => { if (p > t + 0.05 && p < t + 0.22) { sending = i; k = seg(p, t + 0.05, t + 0.22); } });
      arms.forEach((arm, i) => {
        const a = ease(seg(p, TURNS[i], TURNS[i] + 0.05));
        arm.scale.y = Math.max(0.001, a);
        arm.material.opacity = a;
        tips[i].visible = a > 0.9;
        tips[i].scale.setScalar(lerp(0.5, 1, ease(seg(p, TURNS[i] + 0.03, TURNS[i] + 0.08))));
        tips[i].material.emissiveIntensity = 0.4 + (sending === i ? Math.sin(Math.PI * k) * 1.4 : 0);
      });
      flyers.forEach((f, i) => {
        const on = sending === i;
        f.visible = on;
        if (on) {
          place(f, [1.9, ys[i]], [3.3, 0], ease(k));
          f.material.opacity = Math.sin(Math.PI * cl(k)) * 1.2;
        }
      });
      model.material.emissiveIntensity = 0.3 + (sending >= 0 ? Math.sin(Math.PI * k) * 0.9 : 0);
      const grown = TURNS.reduce((a, t) => a + (p > t + 0.05 ? 1 : 0), 0);
      const target = [0.04, 0.07, 0.10, 0.13][grown];
      fill.scale.x = Math.max(0.001, lerp(fill.scale.x || 0.04, target, 0.12));
      g.rotation.y = Math.sin(p * TAU) * 0.06;
    }
  };
}

/* ── scene 02 · left: context goes muddy ──────────────────────── */
function buildMuddy() {
  const g = new THREE.Group();
  const slabs = [];
  for (let i = 0; i < 7; i++) {
    const s = slab(3.4, 0.44, 0.7, C.amber, 0.4);
    s.position.set(-2.0, 2.1 - i * 0.66, 0);
    slabs.push(s); g.add(s);
  }
  const answer = orb(1.05, C.amber, 1.3);
  answer.position.set(2.9, 0.4, 0); g.add(answer);
  const tr = track(8.6); tr.position.set(-4.3, -3.1, 0); g.add(tr);
  const fill = bar(8.6, C.amber); fill.position.set(-4.3, -3.1, 0.02); g.add(fill);
  return {
    group: g,
    update(p) {
      const a = ease(seg(p, 0.12, 0.62));
      slabs.forEach((s, i) => {
        const age = i / (slabs.length - 1);          // 0 = newest at top
        const lost = cl(a * 1.5 - age * 0.55);
        s.material.opacity = lerp(1, 0.12, lost);
        s.material.emissiveIntensity = lerp(0.4, 0.02, lost);
        s.scale.set(1, lerp(1, 0.7, lost), 1);
      });
      answer.material.emissiveIntensity = lerp(1.3, 0.12, a);
      answer.material.opacity = lerp(1, 0.55, a);
      fill.scale.x = Math.max(0.001, ease(seg(p, 0.1, 0.7)));
      g.rotation.y = Math.sin(p * TAU) * 0.05;
    }
  };
}

/* ── scene 02 · right: context stays clean ────────────────────── */
function buildClean() {
  const g = new THREE.Group();
  const slabs = [];
  for (let i = 0; i < 2; i++) {
    const s = slab(3.4, 0.44, 0.7, C.teal, 0.5);
    s.position.set(-2.0, 1.0 - i * 0.8, 0);
    slabs.push(s); g.add(s);
  }
  const answer = orb(1.05, C.teal, 0.3);
  answer.position.set(2.9, 0.4, 0); g.add(answer);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 22),
    new THREE.MeshBasicMaterial({ color: C.teal, transparent: true, opacity: 0.06 }));
  halo.position.copy(answer.position); g.add(halo);
  const tr = track(8.6); tr.position.set(-4.3, -3.1, 0); g.add(tr);
  const fill = bar(8.6, C.teal); fill.position.set(-4.3, -3.1, 0.02); g.add(fill);
  return {
    group: g,
    update(p) {
      const a = ease(seg(p, 0.12, 0.62));
      slabs.forEach((s, i) => {
        const b = ease(seg(p, 0.05 + i * 0.06, 0.18 + i * 0.06));
        s.material.opacity = b;
        s.scale.setScalar(lerp(0.7, 1, b));
        s.material.emissiveIntensity = 0.55;
      });
      answer.material.emissiveIntensity = lerp(0.3, 1.6, a);
      halo.material.opacity = lerp(0.03, 0.14, a);
      halo.scale.setScalar(lerp(0.9, 1.12, Math.sin(p * TAU * 2) * 0.5 + 0.5) * lerp(0.9, 1, a));
      fill.scale.x = Math.max(0.001, ease(seg(p, 0.1, 0.7)) * 0.1);
      g.rotation.y = Math.sin(p * TAU) * 0.05;
    }
  };
}

const BUILDERS = { linear: buildLinear, branch: buildBranch, muddy: buildMuddy, clean: buildClean };

class FSStage3D extends HTMLElement {
  connectedCallback() {
    if (this._on) return;
    this._on = true;
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>:host{display:block;position:absolute;inset:0}canvas{display:block;width:100%;height:100%}</style>';
    const build = BUILDERS[this.getAttribute('scene')] || buildLinear;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    root.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0x9fb0cc, 0.42));
    const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(3, 6, 8); scene.add(key);
    const rim = new THREE.DirectionalLight(0x7aa2ff, 0.45); rim.position.set(-6, -2, -4); scene.add(rim);

    const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    const built = build();
    scene.add(built.group);

    const fit = () => {
      const w = this.clientWidth || 1, h = this.clientHeight || 1;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      // fit the full 10.6 x 7.2 composition whatever the pane shape
      const tan = Math.tan((cam.fov * Math.PI / 180) / 2);
      const dist = Math.max(3.7 / tan, 5.3 / (tan * cam.aspect)) * 1.06;
      cam.position.set(0, 0.55, dist);
      cam.lookAt(0, -0.25, 0);
      cam.updateProjectionMatrix();
    };
    fit();
    new ResizeObserver(fit).observe(this);

    const dur = () => {
      const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur'));
      return v > 0 ? v : 9;
    };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const frame = (p) => { built.update(p); renderer.render(scene, cam); };

    if (reduced.matches) { frame(0.88); return; }

    let raf = 0, t0 = performance.now(), visible = false, D = dur(), tick = 0;
    const loop = (now) => {
      if (!visible) { raf = 0; return; }
      if (++tick % 60 === 0) D = dur();
      frame(((now - t0) / 1000 / D) % 1);
      raf = requestAnimationFrame(loop);
    };
    new IntersectionObserver((es) => {
      es.forEach((e) => {
        visible = e.isIntersecting;
        if (visible && !raf) { t0 = performance.now(); raf = requestAnimationFrame(loop); }
      });
    }, { rootMargin: '10% 0px' }).observe(this);
    frame(0);
  }
}
if (!customElements.get('fs-stage3d')) customElements.define('fs-stage3d', FSStage3D);
