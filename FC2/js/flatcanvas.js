// FLOWCODE — flat 2D canvas replica of the app (final stage of the journey).
// DOM node cards + an SVG layer of glowing bezier wires with flowing pulses,
// converging on the central "Project Scaffold Software Engineer" master card.

const COLORS = {
  purple: '#a78bfa', amber: '#fbbf24', green: '#4ade80',
  teal: '#2dd4bf', blue: '#60a5fa', red: '#f87171', cyan: '#22d3ee',
};

// x/y as % of the canvas; side: which port the wire leaves from
const CARDS = [
  { id: 'master', title: 'Project Scaffold Software Engineer', badge: 'AI', color: COLORS.blue,
    x: 50, y: 46, w: 240, master: true },
  { id: 'ui',    title: 'UI / Frontend Agent',   badge: 'Agent', color: COLORS.purple, x: 16, y: 14, w: 190 },
  { id: 'api',   title: 'Backend API Agent',    badge: 'Agent', color: COLORS.green,  x: 82, y: 15, w: 190 },
  { id: 'db',    title: 'Database Designer',    badge: 'Agent', color: COLORS.amber,  x: 13, y: 48, w: 190 },
  { id: 'auth',  title: 'Auth & Security',      badge: 'Agent', color: COLORS.teal,   x: 85, y: 48, w: 190 },
  { id: 'integ', title: 'Integrations & APIs',  badge: 'Agent', color: COLORS.cyan,   x: 18, y: 82, w: 190 },
  { id: 'qa',    title: 'QA & Deploy',          badge: 'Agent', color: COLORS.red,    x: 81, y: 83, w: 190 },
  { id: 'prompt', title: 'Master Prompt', badge: 'You', color: '#cbd5e1', x: 50, y: 9, w: 180 },
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
    el.className = 'fc-card' + (c.master ? ' fc-card--master' : '');
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
    const master = root.querySelector('#fc-master').getBoundingClientRect();
    const mx = master.x - R.x + master.width / 2;
    const my = master.y - R.y + master.height / 2;

    for (const c of CARDS) {
      if (c.master) continue;
      const el = root.querySelector(`#fc-${c.id}`).getBoundingClientRect();
      const x = el.x - R.x + el.width / 2;
      const y = el.y - R.y + el.height / 2;
      const midX = (x + mx) / 2;
      const d = `M ${x} ${y} C ${midX} ${y}, ${midX} ${my}, ${mx} ${my}`;

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
