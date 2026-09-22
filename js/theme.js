// FORKSCAPE — landing-page colour themes.
// One theme is active per page load: `?theme=<id>` on the URL (preview) or a
// `data-theme` attribute on <html> (the shipped default). No attribute means
// the original dark neon look. Every colour the WebGL tunnel, the flat canvas
// and the stylesheet need lives here, so a theme is one object, not a hunt
// through three files.

const THEMES = {
  // The original look: near-black, neon teal / blue / purple, additive glow.
  current: {
    id: 'current', light: false,
    bg: 0x05070d, transparentBg: false,
    fog: { color: 0x05070d, density: 0.038 },
    blending: 'additive',
    ring: { base: 0x1b2b4a, accent: 0x2dd4bf, baseOpacity: 0.55, accentOpacity: 0.9 },
    dust: { colors: [0x2dd4bf, 0x60a5fa, 0xfbbf24], opacity: 0.75, size: 0.05, count: 2600 },
    clouds: null,
    glow: 1,
    accent: '#2dd4bf',
    card: { fill: 'rgba(10,14,24,0.92)', text: '#f1f5fd', line: 'rgba(200,212,235,0.32)', btn: 'rgba(120,140,180,0.22)' },
    colors: { purple: '#a78bfa', amber: '#fbbf24', green: '#4ade80', teal: '#2dd4bf', blue: '#60a5fa', red: '#f87171', cyan: '#22d3ee', white: '#e8ecf4' },
  },

  // Daylight: a blue sky, the tunnel drawn in mist, smoky white clouds along
  // the walls. Node colours are deep and saturated so they hold on a light ground.
  sky: {
    id: 'sky', light: true,
    bg: 0xbcd8f2, transparentBg: true,
    fog: { color: 0xd9e8f7, density: 0.05 },
    blending: 'normal',
    ring: { base: 0xffffff, accent: 0x1f4fd6, baseOpacity: 0.42, accentOpacity: 0.55 },
    dust: { colors: [0xffffff, 0xffffff, 0x1f4fd6], opacity: 0.55, size: 0.045, count: 1200 },
    clouds: { color: 0xffffff, tint: 0xeaf3fc, count: 380, opacity: 0.34 },
    glow: 0.45,
    accent: '#1f4fd6',
    card: { fill: 'rgba(255,255,255,0.94)', text: '#0f2340', line: 'rgba(15,35,64,0.18)', btn: 'rgba(15,35,64,0.10)' },
    colors: { purple: '#6c4ab6', amber: '#d98c07', green: '#1f8a5b', teal: '#0e8f9e', blue: '#1f4fd6', red: '#d9483b', cyan: '#1a8ab8', white: '#0f2340' },
  },

  // Golden hour: the same cloud tunnel at dusk. Indigo overhead, peach at the
  // horizon, warm smoke, pale pastel nodes.
  dusk: {
    id: 'dusk', light: false,
    bg: 0x3a3762, transparentBg: true,
    fog: { color: 0x8c6a86, density: 0.045 },
    blending: 'normal',
    ring: { base: 0xffd9c4, accent: 0xffb86b, baseOpacity: 0.28, accentOpacity: 0.7 },
    dust: { colors: [0xffe3cf, 0xffb86b, 0xffffff], opacity: 0.6, size: 0.05, count: 1400 },
    clouds: { color: 0xf3c4ad, tint: 0x8a6f9a, count: 340, opacity: 0.32 },
    glow: 0.7,
    accent: '#ffb86b',
    card: { fill: 'rgba(30,26,52,0.88)', text: '#fff4ea', line: 'rgba(255,244,234,0.30)', btn: 'rgba(255,244,234,0.16)' },
    colors: { purple: '#c3a6ff', amber: '#ffb86b', green: '#8fe3c4', teal: '#7dd8d0', blue: '#8ec5ff', red: '#ff7a90', cyan: '#9ad8ff', white: '#fff1d6' },
  },

  // Ink on paper: warm off-white, graphite tunnel lines, one vermilion accent.
  // No glow at all; the wires read like drafting ink.
  paper: {
    id: 'paper', light: true,
    bg: 0xf3efe7, transparentBg: false,
    fog: { color: 0xf3efe7, density: 0.045 },
    blending: 'normal',
    ring: { base: 0x1d1f24, accent: 0xd84a2b, baseOpacity: 0.16, accentOpacity: 0.7 },
    dust: { colors: [0x1d1f24, 0x1d1f24, 0xd84a2b], opacity: 0.5, size: 0.035, count: 900 },
    clouds: null,
    glow: 0.18,
    accent: '#d84a2b',
    card: { fill: 'rgba(255,253,249,0.97)', text: '#16181d', line: 'rgba(22,24,29,0.16)', btn: 'rgba(22,24,29,0.08)' },
    colors: { purple: '#7a3b8c', amber: '#b8860b', green: '#2e6b4a', teal: '#1b7f86', blue: '#2646b8', red: '#d84a2b', cyan: '#1f6f9e', white: '#16181d' },
  },

  // Signal: dark, but monochrome with a single brand accent (Signal Green).
  // Everything that is not the accent is a grey; no gradients anywhere.
  signal: {
    id: 'signal', light: false,
    bg: 0x0b0d10, transparentBg: false,
    fog: { color: 0x0b0d10, density: 0.04 },
    blending: 'additive',
    ring: { base: 0x262b33, accent: 0x00d1b2, baseOpacity: 0.6, accentOpacity: 0.85 },
    dust: { colors: [0xc8d0dc, 0x8a919c, 0x00d1b2], opacity: 0.55, size: 0.045, count: 1800 },
    clouds: null,
    glow: 0.6,
    accent: '#00d1b2',
    card: { fill: 'rgba(16,18,22,0.94)', text: '#f2f4f7', line: 'rgba(200,208,220,0.26)', btn: 'rgba(138,145,156,0.22)' },
    colors: { purple: '#c8d0dc', amber: '#00d1b2', green: '#7ee8d6', teal: '#00d1b2', blue: '#f2f4f7', red: '#8a919c', cyan: '#5fbfb0', white: '#f2f4f7' },
  },
};

export function activeThemeId() {
  const q = new URLSearchParams(location.search).get('theme');
  const id = q || document.documentElement.dataset.theme || 'current';
  return THEMES[id] ? id : 'current';
}

export const THEME = THEMES[activeThemeId()];
export const THEME_IDS = Object.keys(THEMES);
