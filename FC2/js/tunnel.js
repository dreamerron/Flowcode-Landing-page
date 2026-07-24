// FLOWCODE — Option B "The Journey": scroll-driven 3D tunnel.
// Camera flies down a glowing tunnel; on each scroll stage a node is born,
// glows, branches to the next, and data particles flow along the wires.
// The journey ends by flattening into the 2D FLOWCODE canvas, then a phone
// rises showing the generated app — built with up to 90% fewer tokens.

import * as THREE from '../vendor/three.module.js';
import {
  PALETTE, CARD_COLORS, makeGlowSprite, makeCardSprite,
  lerp, clamp01, smoothstep,
} from './common.js';

// ------------------------------------------------------------------ scene ---
const canvas = document.getElementById('webgl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.bg);
scene.fog = new THREE.FogExp2(PALETTE.bg, 0.038);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 200);

// ------------------------------------------------------------- tunnel path --
const PATH_LEN = 90;
const pathPts = [];
for (let i = 0; i <= 12; i++) {
  const z = -i * (PATH_LEN / 12);
  pathPts.push(new THREE.Vector3(
    Math.sin(i * 0.9) * 4.2,
    Math.cos(i * 0.7) * 2.6,
    z,
  ));
}
const path = new THREE.CatmullRomCurve3(pathPts);

// tunnel rings
const ringGroup = new THREE.Group();
scene.add(ringGroup);
{
  const ringGeo = new THREE.TorusGeometry(5.2, 0.015, 8, 64);
  const frames = path.computeFrenetFrames(140, false);
  for (let i = 0; i < 140; i++) {
    const t = i / 139;
    const mat = new THREE.MeshBasicMaterial({
      color: i % 7 === 0 ? 0x2dd4bf : 0x1b2b4a,
      transparent: true,
      opacity: i % 7 === 0 ? 0.9 : 0.55,
    });
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.position.copy(path.getPointAt(t));
    ring.lookAt(ring.position.clone().add(frames.tangents[i * Math.floor(139 / 139)] ?? frames.tangents[i]));
    ringGroup.add(ring);
  }
}

// tunnel dust — points swirling around the path
{
  const N = 2600;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const cA = new THREE.Color(0x2dd4bf), cB = new THREE.Color(0x60a5fa), cC = new THREE.Color(0xfbbf24);
  for (let i = 0; i < N; i++) {
    const t = Math.random();
    const p = path.getPointAt(t);
    const a = Math.random() * Math.PI * 2;
    const r = 2.2 + Math.random() * 3.4;
    pos[i * 3] = p.x + Math.cos(a) * r;
    pos[i * 3 + 1] = p.y + Math.sin(a) * r;
    pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 2;
    const c = Math.random() < 0.08 ? cC : (Math.random() < 0.5 ? cA : cB);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.05, vertexColors: true, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  scene.add(new THREE.Points(geo, mat));
}

// --------------------------------------------------------------- the nodes --
// A spawning TREE, not a chain: the Project Manager spawns specialist
// agents, and every agent spawns its own worker nodes (parent → children).
// `parent` is an index into this list; workers render smaller.
const NODE_DEFS = [
  { title: 'Master Prompt', badge: 'You', color: '#e8ecf4', t: 0.06, parent: null },
  { title: 'Project Manager', badge: 'AI', color: CARD_COLORS[4], t: 0.16, parent: 0 },

  { title: 'Scaffold Software Engineer', badge: 'Agent', color: CARD_COLORS[0], t: 0.28, parent: 1 },
  { title: 'Vite + React setup', badge: 'Worker', color: CARD_COLORS[0], t: 0.335, parent: 2, worker: true, spin: 0.9 },
  { title: 'File writer', badge: 'Worker', color: CARD_COLORS[0], t: 0.355, parent: 2, worker: true, spin: -1.1 },

  { title: 'Backend API Agent', badge: 'Agent', color: CARD_COLORS[2], t: 0.44, parent: 1 },
  { title: 'API client + interceptors', badge: 'Worker', color: CARD_COLORS[2], t: 0.495, parent: 5, worker: true, spin: 1.2 },
  { title: 'Service layer', badge: 'Worker', color: CARD_COLORS[2], t: 0.515, parent: 5, worker: true, spin: -0.8 },

  { title: 'Auth Feature Engineer', badge: 'Agent', color: CARD_COLORS[3], t: 0.58, parent: 1 },
  { title: 'Login / register UI', badge: 'Worker', color: CARD_COLORS[3], t: 0.63, parent: 8, worker: true, spin: 1.0 },

  { title: 'Unit & Integration Tests', badge: 'Agent', color: CARD_COLORS[5], t: 0.70, parent: 1 },
  { title: 'Vitest runner', badge: 'Worker', color: CARD_COLORS[5], t: 0.745, parent: 10, worker: true, spin: -1.2 },
];

const nodes = [];
const links = [];
const nodeGroup = new THREE.Group();
scene.add(nodeGroup);

const frames = path.computeFrenetFrames(200, false);

// ------------------------------------------------- branch tunnels ----------
// When an agent spawns workers, a smaller side-tunnel forks off the main one
// and the workers live inside it. Rings fade in as the parent agent is born.
const branchByParent = new Map(); // parentIdx -> { curve, rings, count }

function openBranch(parentIdx) {
  if (branchByParent.has(parentIdx)) return branchByParent.get(parentIdx);
  const def = NODE_DEFS[parentIdx];
  const side = nodes[parentIdx].side;
  const fi = Math.floor(def.t * 199);
  const start = path.getPointAt(def.t);
  const tangent = frames.tangents[fi].clone();
  const normal = frames.normals[fi].clone();
  const curve = new THREE.QuadraticBezierCurve3(
    start,
    start.clone().add(tangent.clone().multiplyScalar(4)).add(normal.clone().multiplyScalar(side * 3.2)),
    start.clone().add(tangent.clone().multiplyScalar(9)).add(normal.clone().multiplyScalar(side * 7.2)),
  );
  const rings = [];
  const bFrames = curve.computeFrenetFrames(16, false);
  const geo = new THREE.TorusGeometry(1, 0.014, 6, 40);
  for (let i = 1; i <= 16; i++) {
    const bt = i / 16;
    const mat = new THREE.MeshBasicMaterial({
      color: i % 4 === 0 ? def.color : 0x1b2b4a,
      transparent: true, opacity: 0,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(curve.getPointAt(bt));
    ring.lookAt(ring.position.clone().add(bFrames.tangents[i - 1]));
    // branch mouth is wide, tapers toward its end
    ring.scale.setScalar(2.4 - bt * 1.1);
    ring.userData.base = i % 4 === 0 ? 0.85 : 0.5;
    scene.add(ring);
    rings.push(ring);
  }
  const b = { curve, rings, count: 0 };
  branchByParent.set(parentIdx, b);
  return b;
}

NODE_DEFS.forEach((def, i) => {
  const p = path.getPointAt(def.t);
  const fi = Math.floor(def.t * 199);
  const normal = new THREE.Vector3().copy(frames.normals[fi]);
  const binormal = new THREE.Vector3().copy(frames.binormals[fi]);
  let pos, side;
  if (def.worker) {
    // workers live inside their parent agent's branch tunnel
    side = nodes[def.parent].side;
    const branch = openBranch(def.parent);
    branch.count += 1;
    const bt = branch.count === 1 ? 0.45 : 0.75;
    const drift = binormal.clone().multiplyScalar(Math.sin(def.spin) * 0.9);
    pos = branch.curve.getPointAt(bt).add(drift);
  } else {
    // agents alternate sides of the flight line
    side = i % 2 === 0 ? 1 : -1;
    pos = p.clone().add(normal.clone().multiplyScalar(side * 2.1));
  }

  const g = new THREE.Group();
  g.position.copy(pos);

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(def.worker ? 0.14 : 0.22, 2),
    new THREE.MeshBasicMaterial({ color: def.color }),
  );
  const glow = makeGlowSprite(def.color, def.worker ? 1.5 : 2.4);
  const halo = makeGlowSprite(def.color, def.worker ? 3.4 : 6);
  halo.material.opacity = 0.35;

  const card = makeCardSprite({ title: def.title, badge: def.badge, color: def.color }, def.worker ? 1.7 : 2.6);
  card.position.set(side * (def.worker ? 1.1 : 1.7), def.worker ? 0.65 : 0.9, 0);

  g.add(core, glow, halo, card);
  g.scale.setScalar(0.001);
  nodeGroup.add(g);
  nodes.push({ def, group: g, core, glow, halo, card, born: 0, side });
});

// ------------------------------------------------------ branches + flow ----
function makeLink(a, b, color, midT) {
  // bow the wire outward toward the tunnel wall so it never crosses the
  // camera's flight line down the center of the path
  const center = path.getPointAt(midT);
  const mid = a.clone().lerp(b, 0.5);
  const dir = mid.clone().sub(center);
  if (dir.lengthSq() < 0.25) dir.set(0.7, 0.7, 0);
  mid.copy(center).add(dir.normalize().multiplyScalar(3.4));
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  const SEG = 64;
  const geo = new THREE.TubeGeometry(curve, SEG, 0.022, 6, false);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  const totalIndex = geo.index.count;
  geo.setDrawRange(0, 0);
  scene.add(mesh);

  // flow particles
  const FN = 14;
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FN * 3), 3));
  const fMat = new THREE.PointsMaterial({
    color, size: 0.14, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, map: null,
  });
  const flow = new THREE.Points(fGeo, fMat);
  scene.add(flow);

  return { curve, mesh, totalIndex, flow, fN: FN, offsets: Array.from({ length: FN }, () => Math.random()), grow: 0 };
}

// one wire per parent→child edge of the tree
NODE_DEFS.forEach((def, i) => {
  if (def.parent === null || def.parent === undefined) return;
  const L = makeLink(
    nodes[def.parent].group.position.clone(),
    nodes[i].group.position.clone(),
    def.color,
    (NODE_DEFS[def.parent].t + def.t) / 2,
  );
  L.tA = NODE_DEFS[def.parent].t;
  L.tB = def.t;
  links.push(L);
});

// ambient master glow at tunnel entrance
const masterHalo = makeGlowSprite(PALETTE.teal, 14);
masterHalo.position.copy(nodes[0].group.position);
masterHalo.material.opacity = 0.28;
scene.add(masterHalo);

// ------------------------------------------------------------- scroll state -
let scrollT = 0;      // raw
let smoothT = 0;      // eased
const scroller = document.getElementById('scroll-space');

function onScroll() {
  const max = scroller.offsetHeight - innerHeight;
  scrollT = clamp01(window.scrollY / max);
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// mouse parallax
const mouse = { x: 0, y: 0 };
addEventListener('pointermove', (e) => {
  mouse.x = (e.clientX / innerWidth - 0.5) * 2;
  mouse.y = (e.clientY / innerHeight - 0.5) * 2;
});

// ------------------------------------------------------------- HUD / DOM ----
const captions = [...document.querySelectorAll('.caption')];
const flatCanvas = document.getElementById('flat-canvas');
const phoneStage = document.getElementById('phone-stage');
const progressBar = document.getElementById('journey-progress');
const tokenEl = document.getElementById('token-count');
const hero = document.getElementById('hero');

const FLAT_START = 0.80;   // 3D → 2D canvas crossfade
const PHONE_START = 0.92;  // phone rises

// Camera path position u is reached at scroll t = scrollAt(u); nodes must be
// born well BEFORE the camera arrives so you fly toward their glow.
const scrollAt = (u) => u * FLAT_START / 0.86;

let tokenShown = 0;

// ------------------------------------------------------------------ render --
const clock = new THREE.Clock();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const et = clock.elapsedTime;
  smoothT = lerp(smoothT, scrollT, 1 - Math.pow(0.001, dt));
  const t = smoothT;

  // camera along path — stop travel as we flatten out
  const camT = Math.min(t, FLAT_START) / FLAT_START * 0.86;
  const camPos = path.getPointAt(clamp01(camT));
  const lookAt = path.getPointAt(clamp01(camT + 0.035));
  camera.position.copy(camPos);
  camera.position.x += mouse.x * 0.4;
  camera.position.y += -mouse.y * 0.3;
  camera.lookAt(lookAt);
  camera.rotation.z += Math.sin(et * 0.3) * 0.02 + mouse.x * 0.03;

  // node birth & pulse
  nodes.forEach((n, i) => {
    const s = scrollAt(n.def.t);
    const born = smoothstep(s - 0.12, s - 0.07, t);
    n.born = born;
    const pulse = 1 + Math.sin(et * 3 + i) * 0.08;
    n.group.scale.setScalar(Math.max(0.001, born) * pulse);
    n.glow.material.opacity = born * (0.75 + Math.sin(et * 2.5 + i * 1.3) * 0.2);
    n.halo.material.opacity = born * 0.3;
    n.card.material.opacity = smoothstep(s - 0.11, s - 0.06, t);
  });

  // branch tunnels open as their parent agent is born
  branchByParent.forEach((b, parentIdx) => {
    const born = nodes[parentIdx].born;
    for (const r of b.rings) r.material.opacity = born * r.userData.base;
  });

  // branch growth + data flow
  links.forEach((L, i) => {
    const sA = scrollAt(L.tA), sB = scrollAt(L.tB);
    L.grow = smoothstep(sA - 0.07, Math.max(sB - 0.08, sA - 0.02), t);
    L.mesh.geometry.setDrawRange(0, Math.floor(L.totalIndex * L.grow));
    const attr = L.flow.geometry.attributes.position;
    const active = L.grow > 0.999 ? 1 : L.grow * 0.4;
    L.flow.material.opacity = active * 0.95;
    for (let k = 0; k < L.fN; k++) {
      const ft = (L.offsets[k] + et * 0.22) % 1 * L.grow;
      const p = L.curve.getPointAt(clamp01(ft));
      attr.setXYZ(k, p.x, p.y, p.z);
    }
    attr.needsUpdate = true;
  });

  masterHalo.material.opacity = 0.28 * (1 - smoothstep(0.05, 0.2, t));

  // hero + captions
  hero.style.opacity = 1 - smoothstep(0.02, 0.09, t);
  hero.style.pointerEvents = t > 0.05 ? 'none' : 'auto';
  captions.forEach((el) => {
    const a = parseFloat(el.dataset.at);
    const vis = smoothstep(a - 0.03, a, t) * (1 - smoothstep(a + 0.07, a + 0.1, t));
    el.style.opacity = vis;
    el.style.transform = `translate(-50%, ${lerp(30, -10, vis)}px)`;
  });

  // 3D → flat 2D canvas
  const flat = smoothstep(FLAT_START, FLAT_START + 0.07, t);
  canvas.style.opacity = 1 - flat;
  flatCanvas.style.opacity = flat;
  flatCanvas.style.pointerEvents = flat > 0.5 ? 'auto' : 'none';
  flatCanvas.style.transform = `scale(${lerp(1.25, 1, flat)})`;

  // phone
  const ph = smoothstep(PHONE_START, PHONE_START + 0.06, t);
  phoneStage.style.opacity = ph;
  phoneStage.style.pointerEvents = ph > 0.5 ? 'auto' : 'none';
  phoneStage.style.transform = `translateY(${lerp(60, 0, ph)}vh)`;

  // token savings counter
  const target = Math.floor(ph * 90);
  if (target !== tokenShown) {
    tokenShown = target;
    tokenEl.textContent = tokenShown;
  }

  progressBar.style.width = `${t * 100}%`;

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  onScroll();
});
