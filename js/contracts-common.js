// FORKSCAPE Contracts — helpers shared by contracts.html and sign.html.
// The API is the forkscape-contracts Worker (app repo: web/contracts-worker.js).

export const API = (() => {
  if (window.FS_CONTRACTS_API) return window.FS_CONTRACTS_API;
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return 'http://localhost:8787';
  return 'https://contracts.forkscape.com';
})();

export async function api(path, { method = 'POST', body, token, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${API}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw Object.assign(new Error('Cannot reach the contracts service. Check your connection and try again.'), { status: 0 });
  }
  if (raw && res.ok) return res;
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status}).`), { status: res.status });
  return data;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/** Markdown-lite → safe HTML. Same block rules as the PDF builder in the worker. */
export function renderDoc(md) {
  const out = [];
  let para = [];
  let list = null; // 'ul' | 'ol'
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of String(md ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    let m;
    if (!line) { flushPara(); closeList(); continue; }
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flushPara(); closeList(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if ((m = /^[-*•]\s+(.*)$/.exec(line))) {
      flushPara();
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    if ((m = /^(\d+)[.)]\s+(.*)$/.exec(line))) {
      flushPara();
      if (list !== 'ol') { closeList(); out.push(`<ol start="${Number(m[1])}">`); list = 'ol'; }
      out.push(`<li>${inline(m[2])}</li>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { flushPara(); closeList(); out.push('<hr />'); continue; }
    closeList();
    para.push(line);
  }
  flushPara();
  closeList();
  return out.join('\n');
}

export function fmtDate(iso, withTime = true) {
  if (!iso) return '—';
  const d = new Date(iso);
  return withTime
    ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function chip(status) {
  return `<span class="cx-chip cx-chip--${esc(status)}">${esc(status)}</span>`;
}

let toastTimer;
export function toast(msg, bad = false) {
  let el = document.getElementById('cx-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cx-toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.className = `cx-toast${bad ? ' cx-toast--bad' : ''}`;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, bad ? 7000 : 3500);
}

/** Runs `fn` with the button disabled and a spinner. An error shows as a toast
 *  and the call resolves to undefined. */
export async function busy(btn, fn) {
  const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="cx-spin" aria-hidden="true"></span> ${label}`; }
  try { return await fn(); }
  catch (err) { toast(err.message || String(err), true); return undefined; }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
}

export function store(kind, key, value) {
  try {
    const s = kind === 'local' ? localStorage : sessionStorage;
    if (value === undefined) return s.getItem(key);
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch { /* private mode or blocked storage */ }
  return null;
}

export async function downloadBlob(res, fallbackName) {
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
