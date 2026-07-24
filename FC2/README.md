# FLOWCODE — FC2 Landing Page

A 3D interactive Three.js landing experience for the FLOWCODE app, in two options:

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
everything settles onto the flat 2D FLOWCODE canvas. On the final scroll, a
phone rises showing the generated app with an animated counter:
**up to 90% fewer tokens**.

Journey beats:
1. Hero — one master node in the tunnel mouth
2. Scaffold Engineer wakes → agents branch into existence
3. Data flows between nodes along glowing wires
4. Tunnel opens → 3D flattens into the 2D app canvas (SVG wires + node cards)
5. Phone mockup + 0→90% token-savings counter

## Run it

Any static server from the `FC2/` folder:

```bash
cd FC2
python3 -m http.server 8080
# open http://localhost:8080
```

(ES modules require http://, not file://.)

## Stack
- Three.js r160 (vendored in `vendor/three.module.js` — fully self-contained, no CDN)
- Zero other dependencies; all card/glow textures are generated at runtime on `<canvas>`
- `js/common.js` — shared palette + texture generators
- `js/tunnel.js` — scroll journey scene
- `js/flatcanvas.js` — DOM/SVG replica of the app canvas
- `js/network.js` — interactive network scene
