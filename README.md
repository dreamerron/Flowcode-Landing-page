# FORKSCAPE — FC2 Landing Page

A 3D interactive Three.js landing experience for the FORKSCAPE app, in two options:

## Option 1 — `network.html` · "The Living Canvas"
The product video rebuilt as a live, interactive 3D scene: the central
**Project Scaffold Software Engineer** node surrounded by specialist agent
cards (UI, backend, database, auth, QA…), connected by glowing bezier wires
with data pulses flowing along them.

- Move the mouse → the whole canvas tilts (parallax)
- Scroll → zoom in/out
- Hover a node → it lights up with a tooltip

## Option 2 — `index.html` · "The Journey" (flagship)
A scroll-driven cinematic: the camera flies into a glowing tunnel starting
from one **master node**. As you scroll, agent nodes are born one by one —
glow, branch, and stream data to each other — until the tunnel opens and
everything settles onto the flat 2D FORKSCAPE canvas. On the final scroll, a
phone rises showing the generated app with an animated counter:
**up to 90% fewer tokens**.

Journey beats:
1. Hero — one master node in the tunnel mouth
2. Scaffold Engineer wakes → agents branch into existence
3. Data flows between nodes along glowing wires
4. Tunnel opens → 3D flattens into the 2D app canvas (SVG wires + node cards)
5. Phone mockup + 0→90% token-savings counter

## Pages

```
index.html      the scroll-driven journey (flagship)
features.html   feature grid + live canvas demo + download CTA
science.html    the research receipts
pricing.html    Free / Pro $15 / Enterprise — mirrors the app's in-app plan matrix
download.html   platform downloads + "try it in your browser" playground CTA
help.html       the full Help Center (generated in the app repo: docs/help-center/build.py — copy the output here on doc updates)
network.html    the 3D living-canvas scene
```

## Run it

Any static server from the repo root:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

(ES modules require http://, not file://.)

## Deploy to forkscape.com (Cloudflare Pages, free)

1. Cloudflare dashboard → **Workers & Pages → Create → Pages →
   Connect to Git** → pick `dreamerron/Flowcode-Landing-page`.
2. Build settings: framework **None**, build command **(empty)**, output
   directory **/** — it's plain static files.
3. **Custom domains** → add `forkscape.com` (and `www.forkscape.com`). If the
   domain isn't on Cloudflare yet, Pages walks you through pointing the
   nameservers and creates the DNS records automatically.
4. Done — every push to `main` redeploys in ~30 seconds.

Pages serves clean URLs automatically: `forkscape.com/pricing` →
`pricing.html` and `forkscape.com/download` → `download.html`. The desktop
app links to exactly those two paths (its Upgrade and Download dialogs), so
keep those filenames stable.

## The browser playground (try.forkscape.com)

"Try in browser" links point at `https://try.forkscape.com` — the web build
of the app itself. It lives in the app repo, not here: see
`docs/web-playground.md` in Flowcode-TS for the setup (deploy the capped
playground proxy Worker, then `npm run build:web` with `VITE_PLAYGROUND_URL`
set and publish `dist/` as a second Pages project on the `try` subdomain).

## Things to update at launch

- `download.html`: the three platform buttons point at the app repo's GitHub
  Releases page — swap in direct installer links once builds are published.
- The `https://try.forkscape.com` links (site.js nav/footer, index,
  features, download) if you choose a different subdomain.
- `pricing.html`: Pro's CTA is a sales mailto until checkout goes live.

## Stack
- Three.js r160 (vendored in `vendor/three.module.js` — fully self-contained, no CDN)
- Zero other dependencies; all card/glow textures are generated at runtime on `<canvas>`
- `js/common.js` — shared palette + texture generators
- `js/tunnel.js` — scroll journey scene
- `js/flatcanvas.js` — DOM/SVG replica of the app canvas
- `js/network.js` — interactive network scene
