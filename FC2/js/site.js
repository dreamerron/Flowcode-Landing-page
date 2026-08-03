// ForkScape — shared site chrome: one nav + one footer used by every page.
// mountChrome({ active, immersive }) prepends the nav; content pages also
// get the footer (immersive WebGL pages skip it).

const LINKS = [
  { href: 'index.html', label: 'Home' },
  { href: 'features.html', label: 'Features' },
  { href: 'science.html', label: 'Science' },
  { href: 'pricing.html', label: 'Pricing' },
];

const LOGO = `
  <a class="nav__logo" href="index.html" aria-label="ForkScape home">
    <img src="assets/logo.svg" alt="" width="30" height="30" />
    <span>ForkScape</span>
  </a>`;

export function mountChrome({ active = '', immersive = false } = {}) {
  const nav = document.createElement('nav');
  nav.className = 'nav' + (immersive ? '' : ' nav--solid');
  nav.innerHTML = `
    ${LOGO}
    <div class="nav__links">
      ${LINKS.map((l) => `<a href="${l.href}"${l.label === active ? ' aria-current="page" class="is-active"' : ''}>${l.label}</a>`).join('')}
      <a class="nav__cta nav__cta--ghost" href="https://try.forkscape.com" target="_blank" rel="noopener">Try ForkScape</a>
      <a class="nav__cta" href="features.html#download">Download</a>
    </div>`;
  document.body.prepend(nav);

  if (immersive) return;

  const footer = document.createElement('footer');
  footer.className = 'footer';
  footer.innerHTML = `
    <div class="footer__inner">
      <div class="footer__brand">
        ${LOGO}
        <p>AI work that branches on an infinite canvas — local-first,
        measured, and honest about what it saves you.</p>
      </div>
      <div class="footer__col">
        <h4>Product</h4>
        <a href="features.html">Features</a>
        <a href="pricing.html">Pricing</a>
        <a href="https://try.forkscape.com" target="_blank" rel="noopener">Try in browser</a>
        <a href="features.html#download">Download</a>
      </div>
      <div class="footer__col">
        <h4>Research</h4>
        <a href="science.html">Science</a>
        <a href="https://arxiv.org/abs/2505.06120" target="_blank" rel="noopener">Lost in Multi-Turn</a>
        <a href="https://arxiv.org/abs/2512.13914" target="_blank" rel="noopener">Context Branching</a>
      </div>
      <div class="footer__col">
        <h4>Experience</h4>
        <a href="index.html">The Journey</a>
        <a href="network.html">The Canvas (3D)</a>
      </div>
    </div>
    <div class="footer__legal">
      © 2026 ForkScape · Savings vary by workload — the in-app dashboard shows
      your real numbers, tokens and dollars, cache-aware.
    </div>`;
  document.body.append(footer);
}
