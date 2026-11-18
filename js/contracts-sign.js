// FORKSCAPE Contracts — the signer page (sign.html).
// Flow: open link → confirm email with a one-time code → consent + name +
// drawn signature → sign. Also: check that a signed PDF is unchanged.

import { api, $, esc, renderDoc, fmtDate, chip, toast, busy, store, downloadBlob } from './contracts-common.js';

// The token arrives in the fragment (#t=…). Move it to sessionStorage and
// clean the address bar, so it is not left in history or shared by accident.
const fromHash = /(?:^|[#&])t=([A-Za-z0-9_-]{30,})/.exec(location.hash)?.[1];
if (fromHash) {
  store('session', 'fsc_sign_token', fromHash);
  history.replaceState(null, '', location.pathname);
}
const TOKEN = fromHash || store('session', 'fsc_sign_token');
let session = store('session', 'fsc_sign_session');
let doc = null;

const show = (id) => {
  for (const v of ['v-loading', 'v-closed', 'v-doc']) $(`#${v}`).hidden = v !== id;
};
function closed(title, text) {
  $('#closed-title').textContent = title;
  $('#closed-text').textContent = text;
  show('v-closed');
}

async function load() {
  if (!TOKEN) {
    $('#v-loading').hidden = true;
    $('#v-verify').style.marginTop = '0';
    return;
  }
  try {
    doc = await api('/api/sign/open', { body: { token: TOKEN } });
  } catch (err) {
    if (err.status === 404) return closed('This link does not work', `${err.message} Open the newest email from the sender.`);
    return closed('We could not open the contract', err.message);
  }
  render();
}

function render() {
  const { contract: c, signer: s, parties } = doc;
  document.title = `FORKSCAPE — Sign: ${c.title}`;
  $('#doc-from').textContent = `${c.company} asks you to sign`;
  $('#doc-title').textContent = c.title;
  $('#doc-meta').textContent = `Sent ${fmtDate(c.sent_at)} · For ${s.name} (${s.role})${c.status === 'sent' ? ` · Link valid until ${fmtDate(c.expires_at, false)}` : ''}`;
  $('#doc-body').innerHTML = renderDoc(c.body);
  $('#doc-hash').textContent = c.doc_hash;
  const signed = parties.filter((p) => p.status === 'signed').length;
  $('#doc-progress').textContent = `${signed} of ${parties.length} signed`;
  $('#doc-parties').innerHTML = parties.map((p) => `
    <div class="cx-row cx-row--between" style="padding:6px 0">
      <span><b>${esc(p.name)}</b> <span class="muted small">· ${esc(p.role)}${p.you ? ' · you' : ''}</span></span>
      ${chip(p.status === 'pending' ? 'waiting' : p.status)}
    </div>`).join('');
  $('#sign-email').textContent = s.email;
  $('#consent-text').textContent = doc.consent_text;
  if (!$('#sig-name').value) $('#sig-name').value = s.name;

  const banner = $('#doc-banner');
  banner.innerHTML = '';
  $('#sign-box').hidden = true;
  $('#done-box').hidden = true;
  if (c.status === 'voided') banner.innerHTML = `<div class="cx-note cx-note--bad">The sender cancelled this contract.${c.void_reason ? ` Reason: ${esc(c.void_reason)}` : ''} You do not need to do anything.</div>`;
  else if (c.status === 'expired') banner.innerHTML = '<div class="cx-note">This link expired. Ask the sender for a new link.</div>';
  else if (c.status === 'declined') banner.innerHTML = '<div class="cx-note cx-note--bad">A party declined to sign, so this contract is closed.</div>';
  else if (c.status === 'completed') showDone(true);
  else if (s.status === 'signed') showDone(false);
  else if (s.status === 'declined') banner.innerHTML = '<div class="cx-note cx-note--bad">You declined to sign this contract.</div>';
  else {
    $('#sign-box').hidden = false;
    setStep(Boolean(session));
  }
  show('v-doc');
}

function showDone(completed) {
  const box = $('#done-box');
  box.hidden = false;
  box.innerHTML = completed
    ? `<h2>✓ All parties signed</h2>
       <p class="muted">The signed PDF went to every party by email. It ends with a Certificate of completion.</p>
       <div class="cx-row" style="margin-top:12px"><button class="btn" id="btn-pdf">Download the signed PDF</button></div>`
    : `<h2>✓ You signed</h2>
       <p class="muted">Thank you. When every party signs, we email the signed PDF to all of you. You can close this page.</p>`;
  $('#btn-pdf')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const res = await api('/api/sign/pdf', { body: { token: TOKEN }, raw: true });
    await downloadBlob(res, 'contract-signed.pdf');
  }));
}

function setStep(verified) {
  $('#step-email').classList.toggle('is-done', verified);
  $('#step-sign').classList.toggle('is-locked', !verified);
  $('#code-send-row').hidden = verified;
  $('#code-form').hidden = true;
  if (verified) requestAnimationFrame(sizePad);
}

// ── step 1: email code
async function sendCode(btn) {
  await busy(btn, async () => {
    const r = await api('/api/sign/code', { body: { token: TOKEN } });
    toast(`We sent a code to ${r.sent_to}.`);
    $('#code-send-row').hidden = true;
    $('#code-form').hidden = false;
    $('#code').focus();
  });
}
$('#btn-code').addEventListener('click', (e) => sendCode(e.currentTarget));
$('#btn-code-again').addEventListener('click', (e) => sendCode(e.currentTarget));
$('#code-form').addEventListener('submit', (e) => {
  e.preventDefault();
  busy(e.submitter, async () => {
    const r = await api('/api/sign/verify', { body: { token: TOKEN, code: $('#code').value } });
    session = r.session;
    store('session', 'fsc_sign_session', session);
    setStep(true);
    toast('Email confirmed. You can sign now.');
  });
});

// ── step 2: signature pad
const pad = $('#pad');
const ctx = pad.getContext('2d');
let drawn = false;
let drawing = false;
let last = null;

function sizePad() {
  const r = pad.getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const keep = drawn ? pad.toDataURL('image/png') : null;
  pad.width = Math.round(r.width * dpr);
  pad.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#14213d';
  if (keep) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height);
    img.src = keep;
  }
}
window.addEventListener('resize', () => { if (!$('#step-sign').classList.contains('is-locked')) sizePad(); });

const point = (e) => { const r = pad.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
pad.addEventListener('pointerdown', (e) => {
  drawing = true;
  last = point(e);
  pad.setPointerCapture(e.pointerId);
  ctx.beginPath();
  ctx.arc(last.x, last.y, 1.1, 0, Math.PI * 2);
  ctx.fillStyle = '#14213d';
  ctx.fill();
  markDrawn();
});
pad.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  const p = point(e);
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  last = p;
});
const stop = () => { drawing = false; };
pad.addEventListener('pointerup', stop);
pad.addEventListener('pointercancel', stop);
function markDrawn() { drawn = true; $('#pad-hint').hidden = true; }
function clearPad() {
  const r = pad.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);
  drawn = false;
  $('#pad-hint').hidden = false;
}
$('#btn-clear-sig').addEventListener('click', clearPad);
$('#btn-type-sig').addEventListener('click', () => {
  const name = $('#sig-name').value.trim();
  if (!name) { toast('Type your full name first.', true); $('#sig-name').focus(); return; }
  clearPad();
  const r = pad.getBoundingClientRect();
  let size = 46;
  const font = (s) => `italic ${s}px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`;
  ctx.font = font(size);
  while (ctx.measureText(name).width > r.width - 40 && size > 18) { size -= 2; ctx.font = font(size); }
  ctx.fillStyle = '#14213d';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, 20, r.height - 46);
  markDrawn();
});

/** The drawn signature as a PNG on a transparent background. */
function signaturePng() {
  return pad.toDataURL('image/png');
}

$('#btn-sign').addEventListener('click', (e) => {
  if (!$('#consent').checked) { toast('Tick the box to agree to sign electronically.', true); return; }
  if ($('#sig-name').value.trim().length < 2) { toast('Type your full name.', true); return; }
  if (!drawn) { toast('Draw your signature, or press "Use my typed name".', true); return; }
  busy(e.currentTarget, async () => {
    try {
      const r = await api('/api/sign/submit', {
        body: { token: TOKEN, session, consent: true, name: $('#sig-name').value.trim(), signature: signaturePng(), doc_hash: doc.contract.doc_hash },
      });
      store('session', 'fsc_sign_session', null);
      toast(r.completed ? 'Signed. All parties have signed.' : 'Signed. Thank you.');
      doc = await api('/api/sign/open', { body: { token: TOKEN } });
      render();
    } catch (err) {
      if (err.status === 401) { session = null; store('session', 'fsc_sign_session', null); setStep(false); }
      throw err;
    }
  });
});

// ── decline
$('#btn-decline').addEventListener('click', () => { $('#decline-form').hidden = false; $('#decline-reason').focus(); });
$('#btn-decline-cancel').addEventListener('click', () => { $('#decline-form').hidden = true; });
$('#decline-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!confirm('Decline to sign? The contract closes for every party.')) return;
  busy(e.submitter, async () => {
    await api('/api/sign/decline', { body: { token: TOKEN, session, reason: $('#decline-reason').value } });
    doc = await api('/api/sign/open', { body: { token: TOKEN } });
    render();
    toast('You declined. The sender is told.');
  });
});

// ── verify a signed PDF (hash computed in the browser)
const drop = $('#drop');
const fileInput = $('#file');
async function verifyFile(file) {
  const out = $('#verify-result');
  if (!file) return;
  out.innerHTML = '<span class="cx-spin" aria-hidden="true"></span> Checking…';
  try {
    const buf = await file.arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const r = await api('/api/verify', { body: { sha256: hash } });
    out.innerHTML = r.match
      ? `<div class="cx-note cx-note--ok"><b>✓ This PDF is the original.</b> "${esc(r.title)}" (${esc(r.id)}), signed by ${r.signers} ${r.signers === 1 ? 'party' : 'parties'}, completed ${esc(fmtDate(r.completed_at))}.<br /><span class="mono">${hash}</span></div>`
      : `<div class="cx-note cx-note--bad"><b>No match.</b> This file is not a signed ForkScape PDF, or someone changed it after signing.<br /><span class="mono">${hash}</span></div>`;
  } catch (err) {
    out.innerHTML = `<div class="cx-note cx-note--bad">${esc(err.message)}</div>`;
  }
}
drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
fileInput.addEventListener('change', () => verifyFile(fileInput.files[0]));
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); verifyFile(e.dataTransfer.files[0]); });
$('#v-verify').hidden = false;

load();
