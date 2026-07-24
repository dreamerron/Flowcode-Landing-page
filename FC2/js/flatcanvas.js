// FLOWCODE — flat 2D canvas replica of the app (final stage of the journey).
// DOM node cards + an SVG layer of glowing bezier wires with flowing pulses,
// converging on the central "Project Scaffold Software Engineer" master card.

const COLORS = {
  purple: '#a78bfa', amber: '#fbbf24', green: '#4ade80',
  teal: '#2dd4bf', blue: '#60a5fa', red: '#f87171', cyan: '#22d3ee',
};

// A parent → child tree, like the real FLOWCODE canvas: the Project Manager
// spawns specialist agents, and every agent spawns its own workers.
// x/y as % of the canvas; `parent` is the id the wire connects up to.
const CARDS = [
  { id: 'prompt', title: 'Master Prompt', badge: 'You', color: '#cbd5e1', x: 50, y: 9, w: 180, parent: null },
  { id: 'master', title: 'Project Manager — AI orchestrator', badge: 'AI', color: COLORS.blue,
    x: 50, y: 32, w: 240, master: true, parent: 'prompt' },

  { id: 'scaffold', title: 'Scaffold Software Engineer', badge: 'Agent', color: COLORS.purple, x: 13, y: 56, w: 190, parent: 'master' },
  { id: 'api',      title: 'Backend API Agent',          badge: 'Agent', color: COLORS.green,  x: 37, y: 60, w: 190, parent: 'master' },
  { id: 'auth',     title: 'Auth Feature Engineer',      badge: 'Agent', color: COLORS.teal,   x: 63, y: 60, w: 190, parent: 'master' },
  { id: 'tests',    title: 'Unit & Integration Tests',   badge: 'Agent', color: COLORS.red,    x: 87, y: 56, w: 190, parent: 'master' },

  { id: 'scaffold-w1', title: 'Vite + React setup', badge: 'Worker', color: COLORS.purple, x: 7,  y: 84, w: 150, parent: 'scaffold' },
  { id: 'scaffold-w2', title: 'File writer',        badge: 'Worker', color: COLORS.purple, x: 22, y: 87, w: 150, parent: 'scaffold' },
  { id: 'api-w1',      title: 'API client',         badge: 'Worker', color: COLORS.green,  x: 37, y: 87, w: 150, parent: 'api' },
  { id: 'auth-w1',     title: 'Login / register UI', badge: 'Worker', color: COLORS.teal,  x: 63, y: 87, w: 150, parent: 'auth' },
  { id: 'tests-w1',    title: 'Vitest runner',      badge: 'Worker', color: COLORS.red,    x: 87, y: 85, w: 150, parent: 'tests' },
];

export function buildFlatCanvas(root) {
  root.innerHTML = `
    <div class="fc-grid"></div>
    <svg class="fc-wires" preserveAspectRatio="none"></svg>
    <div class="fc-cards"></div>
    <div class="fc-toolbar">
      <span class="fc-chip">⌘ FLOWCODE Canvas</span>
      <span class="fc-chip fc-chip--accent">▶ Orchestrating…</span>
    </div>`;

  const svg = root.querySelector('.fc-wires');
  const cardsEl = root.querySelector('.fc-cards');

  for (const c of CARDS) {
    const el = document.createElement('div');
    el.className = 'fc-card' + (c.master ? ' fc-card--master' : '') + (c.badge === 'Worker' ? ' fc-card--worker' : '');
    el.id = `fc-${c.id}`;
    el.style.setProperty('--c', c.color);
    el.style.left = `${c.x}%`;
    el.style.top = `${c.y}%`;
    el.style.width = `${c.w}px`;
    el.innerHTML = `
      <div class="fc-card__head">
        <span class="fc-badge">${c.badge}</span>
        <span class="fc-title">${c.title}</span>
      </div>
      <div class="fc-card__body">
        <span class="fc-line"></span><span class="fc-line"></span><span class="fc-line fc-line--short"></span>
        ${c.master ? `<div class="fc-progress"><i></i><b>100%</b></div>` : ''}
      </div>
      <div class="fc-card__foot">
        <button class="fc-btn fc-btn--go">▶ Run</button>
        <button class="fc-btn">⚙ Adjust</button>
      </div>`;
    cardsEl.appendChild(el);
  }

  function drawWires() {
    const R = root.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${R.width} ${R.height}`);
    svg.innerHTML = '';

    for (const c of CARDS) {
      if (!c.parent) continue;
      // wire runs from the parent card's bottom edge to this card's top edge
      const pEl = root.querySelector(`#fc-${c.parent}`).getBoundingClientRect();
      const el = root.querySelector(`#fc-${c.id}`).getBoundingClientRect();
      const mx = pEl.x - R.x + pEl.width / 2;
      const my = pEl.y - R.y + pEl.height;
      const x = el.x - R.x + el.width / 2;
      const y = el.y - R.y;
      const midY = (y + my) / 2;
      const d = `M ${mx} ${my} C ${mx} ${midY}, ${x} ${midY}, ${x} ${y}`;

      const mk = (cls, extra = '') => {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        p.setAttribute('class', cls);
        p.setAttribute('style', `--c:${c.color};${extra}`);
        svg.appendChild(p);
        return p;
      };
      mk('fc-wire fc-wire--under');
      mk('fc-wire fc-wire--flow', `animation-delay:${Math.random() * -3}s`);

      // pulse dot travelling the wire
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('r', '4');
      dot.setAttribute('class', 'fc-pulse');
      dot.setAttribute('style', `--c:${c.color}`);
      const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
      anim.setAttribute('dur', `${2.4 + Math.random() * 2}s`);
      anim.setAttribute('repeatCount', 'indefinite');
      anim.setAttribute('path', d);
      dot.appendChild(anim);
      svg.appendChild(dot);
    }
  }

  drawWires();
  addEventListener('resize', drawWires);
}
