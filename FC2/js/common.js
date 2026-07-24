// FLOWCODE — shared helpers: palette, canvas-generated textures (node cards,
// glow sprites), math utils. Matches the visual language of the FLOWCODE app:
// dark canvas, colored agent cards, glowing bezier wires.

import * as THREE from '../vendor/three.module.js';

export const PALETTE = {
  bg: 0x05070d,
  purple: '#a78bfa',
  amber: '#fbbf24',
  green: '#4ade80',
  teal: '#2dd4bf',
  blue: '#60a5fa',
  red: '#f87171',
  cyan: '#22d3ee',
  white: '#e8ecf4',
};

export const CARD_COLORS = [
  PALETTE.purple, PALETTE.amber, PALETTE.green,
  PALETTE.teal, PALETTE.blue, PALETTE.red, PALETTE.cyan,
];

// ---------------------------------------------------------------- glow sprite
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

export function makeGlowSprite(color, scale = 1) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: new THREE.Color(color),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(scale);
  return s;
}

// ------------------------------------------------------------- node card tex
// Draws a FLOWCODE-style agent card (rounded rect, colored border, header
// chip row, body lines, footer buttons) onto a canvas texture.
export function cardTexture({ title, color, badge = 'Agent', lines = 3, w = 512, h = 320 }) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const r = 26;

  const rr = (x, y, ww, hh, rad) => {
    g.beginPath();
    g.roundRect(x, y, ww, hh, rad);
  };

  // card body
  rr(6, 6, w - 12, h - 12, r);
  g.fillStyle = 'rgba(10,14,24,0.92)';
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = color;
  g.globalAlpha = 0.95;
  g.stroke();
  g.globalAlpha = 1;

  // header strip
  rr(6, 6, w - 12, 64, [r, r, 0, 0]);
  g.fillStyle = hexToRgba(color, 0.16);
  g.fill();

  // badge chip
  rr(26, 20, 108, 36, 10);
  g.fillStyle = hexToRgba(color, 0.35);
  g.fill();
  g.fillStyle = '#eef2ff';
  g.font = '600 22px "Segoe UI", system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(badge, 42, 39);

  // title
  g.fillStyle = '#f1f5fd';
  g.font = '700 26px "Segoe UI", system-ui, sans-serif';
  g.fillText(truncate(g, title, w - 190), 150, 39);

  // body placeholder lines
  g.fillStyle = 'rgba(200,212,235,0.32)';
  for (let i = 0; i < lines; i++) {
    const ly = 100 + i * 34;
    const lw = (w - 60) * (i === lines - 1 ? 0.55 : 0.88);
    rr(30, ly, lw, 14, 7);
    g.fill();
  }

  // footer buttons
  rr(30, h - 66, 118, 40, 10);
  g.fillStyle = hexToRgba(color, 0.5);
  g.fill();
  rr(160, h - 66, 118, 40, 10);
  g.fillStyle = 'rgba(120,140,180,0.22)';
  g.fill();
  g.fillStyle = '#eef2ff';
  g.font = '600 20px "Segoe UI", system-ui, sans-serif';
  g.fillText('Run', 72, h - 45);
  g.fillText('Adjust', 188, h - 45);

  // port dots
  g.fillStyle = color;
  for (const px of [0, w]) {
    g.beginPath();
    g.arc(px === 0 ? 8 : w - 8, h / 2, 9, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeCardSprite(opts, worldW = 3) {
  const tex = cardTexture(opts);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(worldW, worldW * (opts.h ?? 320) / (opts.w ?? 512), 1);
  return s;
}

// ------------------------------------------------------------------- helpers
export function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function truncate(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  while (text.length > 1 && g.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
