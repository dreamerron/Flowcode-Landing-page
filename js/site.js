// FORKSCAPE — shared site chrome: one nav + one footer used by every page.
// mountChrome({ active, immersive }) prepends the nav; content pages also
// get the footer (immersive WebGL pages skip it).

const LINKS = [
  { href: 'index.html', label: 'Home' },
  { href: 'get-started.html', label: 'Get started' },
  { href: 'features.html', label: 'Features' },
  { href: 'research.html', label: 'Research' },
  { href: 'pricing.html', label: 'Pricing' },
  { href: 'blog.html', label: 'Blog' },
];

export function mountChrome({ active = '', immersive = false } = {}) {
  const nav = document.createElement('nav');
  nav.className = 'nav' + (immersive ? '' : ' nav--solid');
  nav.innerHTML = `
    <a class="nav__logo" href="index.html"><svg viewBox="0 0 420 420" aria-hidden="true"><g transform="translate(-45 2)" fill="#00D1B2" stroke="#00D1B2" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><path d="M178 130L231 180"/><path d="M178 287L231 236"/><path d="M260 85L332 149"/><path d="M332 149L370 187"/><path d="M301.5 208H362.5"/><path d="M260 333L332 267"/><path d="M332 267L370 229"/><g stroke="none"><circle cx="260" cy="208" r="41"/><circle cx="125" cy="208" r="29"/><circle cx="178" cy="130" r="28"/><circle cx="178" cy="287" r="29"/><circle cx="260" cy="85" r="29"/><circle cx="332" cy="149" r="29"/><circle cx="391" cy="208" r="29"/><circle cx="332" cy="267" r="29"/><circle cx="260" cy="333" r="29"/></g></g></svg><span>Fork<b>Scape</b></span></a>
    <div class="nav__links">
      ${LINKS.map((l) => `<a href="${l.href}"${l.label === active ? ' aria-current="page" class="is-active"' : ''}>${l.label}</a>`).join('')}
      <a href="https://try.forkscape.com">Try in browser</a>
      <a class="nav__cta" href="download.html"${active === 'Download' ? ' aria-current="page"' : ''}>Download</a>
    </div>`;
  document.body.prepend(nav);

  if (immersive) return;

  const footer = document.createElement('footer');
  footer.className = 'footer';
  footer.innerHTML = `
    <div class="footer__inner">
      <div class="footer__brand">
        <a class="nav__logo" href="index.html"><svg viewBox="0 0 420 420" aria-hidden="true"><g transform="translate(-45 2)" fill="#00D1B2" stroke="#00D1B2" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><path d="M178 130L231 180"/><path d="M178 287L231 236"/><path d="M260 85L332 149"/><path d="M332 149L370 187"/><path d="M301.5 208H362.5"/><path d="M260 333L332 267"/><path d="M332 267L370 229"/><g stroke="none"><circle cx="260" cy="208" r="41"/><circle cx="125" cy="208" r="29"/><circle cx="178" cy="130" r="28"/><circle cx="178" cy="287" r="29"/><circle cx="260" cy="85" r="29"/><circle cx="332" cy="149" r="29"/><circle cx="391" cy="208" r="29"/><circle cx="332" cy="267" r="29"/><circle cx="260" cy="333" r="29"/></g></g></svg><span>Fork<b>Scape</b></span></a>
        <p>AI work that branches on an infinite canvas — local-first,
        measured, and honest about what it saves you.</p>
      </div>
      <div class="footer__col">
        <h4>Product</h4>
        <a href="get-started.html">Get started</a>
        <a href="features.html">Features</a>
        <a href="pricing.html">Pricing</a>
        <a href="download.html">Download</a>
        <a href="https://try.forkscape.com">Try in browser</a>
        <a href="help.html">Help Center</a>
        <a href="blog.html">Blog</a>
      </div>
      <div class="footer__col">
        <h4>Research</h4>
        <a href="research.html">Research</a>
        <a href="https://arxiv.org/abs/2505.06120" target="_blank" rel="noopener">Lost in Multi-Turn</a>
        <a href="https://arxiv.org/abs/2512.13914" target="_blank" rel="noopener">Context Branching</a>
      </div>
      <div class="footer__col">
        <h4>Experience</h4>
        <a href="index.html">The Journey</a>
        <a href="network.html">The Canvas (3D)</a>
      </div>
      <div class="footer__col">
        <h4>Company</h4>
        <a href="mailto:support@forkscape.com">Contact — support@forkscape.com</a>
        <a href="terms.html">Terms of Service</a>
        <a href="privacy.html">Privacy Policy</a>
        <a href="refunds.html">Refunds &amp; Cancellation</a>
        <a href="licenses.html">Open-source licenses</a>
      </div>
    </div>
    <div class="footer__legal">
      © 2026 FORKSCAPE · Savings vary by workload — the in-app dashboard shows
      your real numbers, tokens and dollars, cache-aware.
    </div>`;
  document.body.append(footer);
}
