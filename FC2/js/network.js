// FLOWCODE — Option A "The Canvas": the product video rebuilt as a live,
// interactive 3D scene. A constellation of agent cards orbits the central
// Project Scaffold Engineer; glowing wires carry data pulses; the whole
// canvas drifts, tilts with the mouse, and nodes light up on hover.

import * as THREE from '../vendor/three.module.js';
import {
  PALETTE, makeGlowSprite, makeCardSprite, lerp, clamp01,
} from './common.js';

const canvas = document.getElementById('webgl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.bg);
scene.fog = new THREE.FogExp2(PALETTE.bg, 0.028);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 0, 16);

const world = new THREE.Group();
scene.add(world);

// ------------------------------------------------------------- background --
{
  // faint grid plane far behind, like the app canvas
  const grid = new THREE.GridHelper(120, 60, 0x14203a, 0x0c1526);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -14;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  scene.add(grid);

  // star dust
  const N = 900;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) pos[i] = (Math.random() - 0.5) * 90;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({
    color: 0x3b4d75, size: 0.06, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })));
}

// ------------------------------------------------------------------ nodes --
const DEFS = [
  { title: 'Project Scaffold Software Engineer', badge: 'AI', color: '#60a5fa', p: [0, 0, 0], master: true },
  { title: 'Master Prompt', badge: 'You', color: '#e8ecf4', p: [0, 4.6, -1] },
  { title: 'UI / Frontend Agent', badge: 'Agent', color: '#a78bfa', p: [-7.5, 3.4, -2] },
  { title: 'Component Library', badge: 'Agent', color: '#a78bfa', p: [-10.5, 0.6, -4] },
  { title: 'Backend API Agent', badge: 'Agent', color: '#4ade80', p: [7.6, 3.2, -2.5] },
  { title: 'Service Layer', badge: 'Agent', color: '#4ade80', p: [10.6, 0.4, -4.5] },
  { title: 'Database Designer', badge: 'Agent', color: '#fbbf24', p: [-8.2, -2.8, -1.5] },
  { title: 'Data Migrations', badge: 'Agent', color: '#fbbf24', p: [-5.4, -5.2, -3.5] },
  { title: 'Auth & Security', badge: 'Agent', color: '#2dd4bf', p: [8.4, -2.9, -2] },
  { title: 'Integrations & APIs', badge: 'Agent', color: '#22d3ee', p: [5.2, -5.4, -4] },
  { title: 'QA & Test Runner', badge: 'Agent', color: '#f87171', p: [-2.6, 5.8, -4] },
  { title: 'Deploy Pipeline', badge: 'Agent', color: '#f87171', p: [2.8, 6.0, -4.5] },
];

const nodes = [];
DEFS.forEach((d) => {
  const g = new THREE.Group();
  g.position.set(...d.p);

  const scale = d.master ? 4.4 : 3.0;
  const card = makeCardSprite({ title: d.title, badge: d.badge, color: d.color }, scale);
  const glow = makeGlowSprite(d.color, d.master ? 7 : 3.6);
  glow.material.opacity = d.master ? 0.5 : 0.3;
  const core = makeGlowSprite('#ffffff', 0.7);

  g.add(glow, core, card);
  world.add(g);
  nodes.push({ d, g, card, glow, base: new THREE.Vector3(...d.p), phase: Math.random() * 9 });
});

// ------------------------------------------------------------------ wires --
const wires = [];
function wire(fromIdx, toIdx, color) {
  const a = nodes[fromIdx].base, b = nodes[toIdx].base;
  const mid = a.clone().lerp(b, 0.5);
  mid.z += 1.2;
  mid.y += (Math.random() - 0.5) * 1.5;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);

  const geo = new THREE.TubeGeometry(curve, 48, 0.025, 6, false);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  world.add(new THREE.Mesh(geo, mat));

  const FN = 10;
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FN * 3), 3));
  const fm = new THREE.PointsMaterial({
    color, size: 0.16, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pts = new THREE.Points(fg, fm);
  world.add(pts);
  wires.push({ curve, pts, FN, mat, off: Array.from({ length: FN }, () => Math.random()), speed: 0.1 + Math.random() * 0.12 });
}

// every satellite connects to master (index 0); a few sibling links
for (let i = 1; i < DEFS.length; i++) wire(i, 0, DEFS[i].color);
wire(2, 3, '#a78bfa'); wire(4, 5, '#4ade80'); wire(6, 7, '#fbbf24'); wire(8, 9, '#22d3ee');

// ------------------------------------------------------------ interaction --
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-2, -2);
const mouse = { x: 0, y: 0 };
let hovered = null;
const tip = document.getElementById('tooltip');

addEventListener('pointermove', (e) => {
  mouse.x = (e.clientX / innerWidth - 0.5) * 2;
  mouse.y = (e.clientY / innerHeight - 0.5) * 2;
  pointer.set(mouse.x, -mouse.y);
  tip.style.left = `${e.clientX + 16}px`;
  tip.style.top = `${e.clientY + 12}px`;
});

let zoom = 16;
addEventListener('wheel', (e) => {
  zoom = Math.min(26, Math.max(9, zoom + e.deltaY * 0.01));
}, { passive: true });

// -------------------------------------------------------------------- loop -
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const et = clock.elapsedTime;

  // gentle drift + mouse tilt
  world.rotation.y = lerp(world.rotation.y, mouse.x * 0.22 + Math.sin(et * 0.08) * 0.06, 0.04);
  world.rotation.x = lerp(world.rotation.x, -mouse.y * 0.14, 0.04);
  camera.position.z = lerp(camera.position.z, zoom, 0.06);

  // float nodes
  nodes.forEach((n) => {
    n.g.position.y = n.base.y + Math.sin(et * 0.7 + n.phase) * 0.18;
    n.g.position.x = n.base.x + Math.cos(et * 0.5 + n.phase) * 0.1;
    const target = (hovered === n) ? 1.14 : 1;
    n.g.scale.setScalar(lerp(n.g.scale.x, target, 0.12));
    n.glow.material.opacity = (n.d.master ? 0.5 : 0.3) + Math.sin(et * 2 + n.phase) * 0.08 + (hovered === n ? 0.25 : 0);
  });

  // flow pulses
  wires.forEach((w) => {
    const attr = w.pts.geometry.attributes.position;
    for (let k = 0; k < w.FN; k++) {
      const t = (w.off[k] + et * w.speed) % 1;
      const p = w.curve.getPointAt(t);
      attr.setXYZ(k, p.x, p.y, p.z);
    }
    attr.needsUpdate = true;
  });

  // hover raycast against cards
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(nodes.map((n) => n.card));
  const hit = hits[0] ? nodes.find((n) => n.card === hits[0].object) : null;
  if (hit !== hovered) {
    hovered = hit;
    document.body.style.cursor = hit ? 'pointer' : 'default';
    tip.style.opacity = hit ? 1 : 0;
    if (hit) {
      tip.innerHTML = `<b style="color:${hit.d.color}">${hit.d.badge}</b> ${hit.d.title}`;
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
