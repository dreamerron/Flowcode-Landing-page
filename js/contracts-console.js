// FORKSCAPE Contracts — the owner console (contracts.html).
// Views (hash routes): #/ list · #/new · #/c/<id> · #/settings

import { api, $, esc, renderDoc, fmtDate, chip, toast, busy, store, downloadBlob } from './contracts-common.js';

let token = store('session', 'fsc_admin');
let me = null; // { email, company, ai, email_ready, storage }

const PRESETS = {
  anthropic: { label: 'Anthropic (Claude)', format: 'anthropic', base_url: 'https://api.anthropic.com', model: 'claude-opus-5-5', hint: 'claude-opus-5-5 is the most capable; claude-sonnet-5-5 is cheaper.' },
  openai: { label: 'OpenAI', format: 'openai', base_url: 'https://api.openai.com/v1', model: '', hint: 'Use a model ID from your OpenAI account.' },
  openrouter: { label: 'OpenRouter', format: 'openai', base_url: 'https://openrouter.ai/api/v1', model: '', hint: 'Use a model ID from openrouter.ai/models.' },
  ollama: { label: 'Ollama Cloud', format: 'openai', base_url: 'https://ollama.com/v1', model: '', hint: 'Use a cloud model name from ollama.com.' },
  gemini: { label: 'Google Gemini', format: 'gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta', model: '', hint: 'Use a Gemini model ID from Google AI Studio.' },
  custom: { label: 'Other (OpenAI-compatible)', format: 'openai', base_url: '', model: '', hint: 'Any server that speaks /chat/completions.' },
};

const KINDS = ['Services agreement', 'Software development agreement', 'Consulting agreement', 'Freelance / contractor agreement', 'Statement of work', 'Maintenance and support agreement', 'Mutual NDA', 'Other'];

const TEMPLATES = {
  services: {
    label: 'Services agreement',
    body: `# Services Agreement

This Services Agreement (the **Agreement**) is between Illusion Media LLC, trading as ForkScape (**ForkScape**), and [Client legal name], [Client address] (the **Client**).

## 1. Services
ForkScape will provide the services described in this section (the **Services**):
- [Deliverable 1]
- [Deliverable 2]

## 2. Timeline
ForkScape will start on [start date] and aims to deliver by [delivery date]. Delays caused by late Client input move the dates by the same amount.

## 3. Acceptance
The Client has [5] business days after each delivery to accept it or to list specific defects. ForkScape fixes listed defects and delivers again. Silence after that period counts as acceptance.

## 4. Fees and payment
The Client pays [amount and currency]. ForkScape invoices [50%] at signing and [50%] at acceptance. Invoices are due within [14] days. Late amounts carry interest of [1%] per month.

## 5. Intellectual property
When the Client pays in full, the Client owns the deliverables made only for the Client. ForkScape keeps its pre-existing tools, code and know-how, and gives the Client a non-exclusive, perpetual licence to use them as part of the deliverables.

## 6. Confidentiality
Each party keeps the other party's confidential information secret and uses it only for this Agreement. This duty lasts [3] years after the Agreement ends.

## 7. Warranties
ForkScape will perform the Services with reasonable skill and care. Apart from this, the Services are provided "as is".

## 8. Limitation of liability
Neither party is liable for indirect or consequential loss. Each party's total liability is limited to the fees paid under this Agreement, except for breach of confidentiality or non-payment.

## 9. Termination
Either party can end this Agreement with [14] days' written notice. The Client pays for work done up to the end date.

## 10. General
ForkScape is an independent contractor. This Agreement is governed by the laws of [state / country]. It is the entire agreement between the parties and changes must be in writing.`,
  },
  nda: {
    label: 'Mutual NDA',
    body: `# Mutual Non-Disclosure Agreement

This Mutual Non-Disclosure Agreement is between Illusion Media LLC, trading as ForkScape (**ForkScape**), and [Other party legal name] (the **Other Party**).

## 1. Purpose
The parties want to share confidential information to discuss [purpose] (the **Purpose**).

## 2. Confidential information
Confidential information is any non-public information one party shares with the other, in any form, that is marked confidential or that a reasonable person would treat as confidential.

## 3. Duties
The receiving party will:
- use the information only for the Purpose;
- share it only with people who need it for the Purpose and who are bound by similar duties;
- protect it with at least reasonable care.

## 4. Exceptions
These duties do not cover information that is public through no fault of the receiving party, that the receiving party already knew, that it gets lawfully from someone else, or that it develops independently. A party may disclose information when the law requires it, after giving notice where allowed.

## 5. Term
This Agreement lasts [2] years from signing. The duties for each piece of information last [3] years after it is shared.

## 6. Return
On request, the receiving party returns or deletes the information.

## 7. General
No licence or other right is granted except as written here. This Agreement is governed by the laws of [state / country].`,
  },
  sow: {
    label: 'Statement of work',
    body: `# Statement of Work

This Statement of Work is under the agreement between Illusion Media LLC, trading as ForkScape (**ForkScape**), and [Client legal name] dated [date].

## 1. Project
[One-paragraph description of the project.]

## 2. Deliverables
1. [Deliverable] — due [date]
2. [Deliverable] — due [date]

## 3. Out of scope
- [Item]

## 4. Client responsibilities
- Provide [access, content, feedback] by [date].

## 5. Fees
[Fixed fee or hourly rate, with currency.] Payment schedule: [milestones].

## 6. Change requests
Work outside section 2 needs a written change request with its own price and dates.`,
  },
};

// ───────────────────────────────────────────────────────── session ──

function call(path, opts = {}) {
  return api(path, { ...opts, token }).catch((err) => {
    if (err.status === 401) { signOut(); }
    throw err;
  });
}
function signOut() {
  token = null;
  store('session', 'fsc_admin', null);
  showLogin();
}
function showLogin() {
  $('#v-app').hidden = true;
  $('#v-login').hidden = false;
  $('#login-form').hidden = false;
  $('#code-form').hidden = true;
}

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  busy(e.submitter, async () => {
    await api('/api/admin/login', { body: { email: $('#login-email').value } });
    $('#login-form').hidden = true;
    $('#code-form').hidden = false;
    $('#login-code').focus();
    toast('If that is the owner email, a code is on its way.');
  });
});
$('#btn-login-back').addEventListener('click', showLogin);
$('#code-form').addEventListener('submit', (e) => {
  e.preventDefault();
  busy(e.submitter, async () => {
    const r = await api('/api/admin/verify', { body: { email: $('#login-email').value, code: $('#login-code').value } });
    token = r.token;
    store('session', 'fsc_admin', token);
    $('#login-code').value = '';
    await start();
  });
});
$('#btn-logout').addEventListener('click', signOut);

async function start() {
  try {
    me = await call('/api/admin/me', { method: 'GET' });
  } catch (err) {
    if (err.status !== 401) toast(err.message, true);
    return;
  }
  $('#v-login').hidden = true;
  $('#v-app').hidden = false;
  $('#who').textContent = me.email;
  const notes = [];
  if (!me.email_ready) notes.push('Email is not set up (RESEND_KEY). Sign links cannot be sent.');
  $('#setup-notes').innerHTML = notes.map((n) => `<div class="cx-note" style="margin-bottom:12px">${esc(n)}</div>`).join('');
  route();
}

// ─────────────────────────────────────────────────────────── router ──

window.addEventListener('hashchange', () => { if (token && me) route(); });
document.querySelectorAll('.cx-tab').forEach((t) => t.addEventListener('click', () => {
  location.hash = t.dataset.tab === 'settings' ? '#/settings' : '#/';
}));

function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  const tab = h.startsWith('/settings') ? 'settings' : 'list';
  document.querySelectorAll('.cx-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
  window.scrollTo(0, 0);
  if (h === '/new') return renderEditor(null);
  const m = /^\/c\/(fsc_[a-z0-9]+)$/.exec(h);
  if (m) return openContract(m[1]);
  if (tab === 'settings') return renderSettings();
  return renderList();
}

const view = () => $('#view');

// ───────────────────────────────────────────────────────────── list ──

async function renderList() {
  view().innerHTML = '<p class="muted"><span class="cx-spin" aria-hidden="true"></span> Loading…</p>';
  let data;
  try { data = await call('/api/contracts', { method: 'GET' }); } catch (err) { view().innerHTML = `<div class="cx-note cx-note--bad">${esc(err.message)}</div>`; return; }
  const list = data.contracts;
  view().innerHTML = `
    <div class="cx-row cx-row--between" style="margin-bottom:16px">
      <p class="muted">${list.length ? `${list.length} contract${list.length === 1 ? '' : 's'}` : 'No contracts yet.'}</p>
      <a class="btn" href="#/new">New contract</a>
    </div>
    <div class="cx-list">
      ${list.map((c) => `
        <button class="cx-item" data-id="${esc(c.id)}">
          <span><b>${esc(c.title)}</b><span class="muted small">${c.signer_count ? `${c.signed_count} of ${c.signer_count} signed` : 'No signers yet'}</span></span>
          <span class="muted small cx-when">${esc(fmtDate(c.completed_at || c.sent_at || c.updated_at, false))}</span>
          ${chip(c.status)}
        </button>`).join('')}
    </div>
    ${list.length ? '' : `<div class="cx-card" style="margin-top:12px"><h2>How it works</h2>
      <ol class="muted" style="margin-left:20px;line-height:1.8">
        <li>Write the contract, start from a template, or let the AI draft it from a short brief.</li>
        <li>Add the client (and yourself, to countersign) as signers.</li>
        <li>Send. Each signer gets a personal link, confirms their email with a code, and signs.</li>
        <li>When all parties sign, everyone gets the signed PDF with a Certificate of completion.</li>
      </ol>
      <p class="muted small" style="margin-top:10px">Set your AI provider and API key under <a href="#/settings">Settings</a>.</p></div>`}`;
  view().querySelectorAll('.cx-item').forEach((b) => b.addEventListener('click', () => { location.hash = `#/c/${b.dataset.id}`; }));
}

async function openContract(id) {
  view().innerHTML = '<p class="muted"><span class="cx-spin" aria-hidden="true"></span> Loading…</p>';
  try {
    const data = await call(`/api/contracts/${id}`, { method: 'GET' });
    if (data.contract.status === 'draft') renderEditor(data);
    else renderDetail(data);
  } catch (err) {
    view().innerHTML = `<div class="cx-note cx-note--bad">${esc(err.message)}</div><p style="margin-top:12px"><a href="#/">← All contracts</a></p>`;
  }
}

// ─────────────────────────────────────────────────────────── editor ──

function renderEditor(data) {
  const c = data?.contract ?? { title: '', body: '', message: '', link_days: 30 };
  const signers = data?.signers?.map((s) => ({ name: s.name, email: s.email, role: s.role })) ?? [{ name: '', email: '', role: 'Client' }];
  let undo = null;

  view().innerHTML = `
    <p style="margin-bottom:12px"><a href="#/">← All contracts</a></p>
    <div class="cx-grid2">
      <div class="cx-stack">
        <div class="cx-card cx-stack">
          <div>
            <label for="f-title">Title</label>
            <input class="cx-input" id="f-title" maxlength="200" placeholder="Website build — Acme Bakery" />
          </div>
          <div>
            <div class="cx-row cx-row--between" style="margin-bottom:6px">
              <label style="margin:0">Signers</label>
              <span class="cx-row small">
                <button class="cx-link" id="btn-add-me" type="button">Add me to countersign</button>
                <button class="cx-link" id="btn-add-signer" type="button">Add signer</button>
              </span>
            </div>
            <div id="signers" class="cx-stack"></div>
          </div>
        </div>

        <div class="cx-card">
          <div class="cx-row cx-row--between" style="margin-bottom:10px">
            <div class="cx-row">
              <button class="btn btn--ghost cx-btn-sm" id="btn-write" aria-pressed="true">Write</button>
              <button class="btn btn--ghost cx-btn-sm" id="btn-preview" aria-pressed="false">Preview</button>
              <button class="btn btn--ghost cx-btn-sm" id="btn-undo" hidden>Undo AI change</button>
            </div>
            <select id="f-template" style="width:auto" aria-label="Start from a template">
              <option value="">Start from a template…</option>
              ${Object.entries(TEMPLATES).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join('')}
            </select>
          </div>
          <textarea class="cx-editor" id="f-body" spellcheck="true" placeholder="# Services Agreement&#10;&#10;## 1. Services&#10;…"></textarea>
          <div class="cx-paper cx-paper--scroll" id="preview" hidden></div>
          <p class="muted small" style="margin-top:8px">Format: <code># Title</code>, <code>## 1. Section</code>, <code>- list</code>, <code>**bold**</code>. Put unknown facts in [brackets] and fill them before you send.</p>
        </div>

        <div class="cx-card cx-stack">
          <div>
            <label for="f-message">Message to signers (optional, goes in the email)</label>
            <textarea id="f-message" rows="2" maxlength="2000"></textarea>
          </div>
          <div style="max-width:220px">
            <label for="f-days">Link valid for (days)</label>
            <input class="cx-input" id="f-days" type="number" min="1" max="180" />
          </div>
        </div>

        <div class="cx-row cx-row--between">
          <div>${data ? '<button class="btn btn--ghost cx-danger" id="btn-delete">Delete draft</button>' : ''}</div>
          <div class="cx-row">
            <button class="btn btn--ghost" id="btn-save">Save draft</button>
            <button class="btn" id="btn-send">Send for signature</button>
          </div>
        </div>
      </div>

      <aside class="cx-card cx-stack" id="ai-panel" style="position:sticky;top:92px">
        <h2 style="margin:0">AI assistant</h2>
        ${me.ai.configured ? `<p class="muted small">Using ${esc(me.ai.model)} via ${esc(me.ai.base_url.replace(/^https:\/\//, ''))}.</p>` : '<div class="cx-note">Add your AI provider and API key in <a href="#/settings">Settings</a> to use the assistant.</div>'}
        <div class="cx-row" role="tablist">
          <button class="btn btn--ghost cx-btn-sm" data-ai="draft" aria-pressed="true">Draft</button>
          <button class="btn btn--ghost cx-btn-sm" data-ai="review" aria-pressed="false">Review</button>
          <button class="btn btn--ghost cx-btn-sm" data-ai="revise" aria-pressed="false">Revise</button>
        </div>
        <div data-ai-pane="draft" class="cx-stack">
          <div><label for="a-kind">Contract type</label><select id="a-kind">${KINDS.map((k) => `<option>${esc(k)}</option>`).join('')}</select></div>
          <div><label for="a-client">Client name</label><input class="cx-input" id="a-client" /></div>
          <div><label for="a-company">Client company</label><input class="cx-input" id="a-company" /></div>
          <div><label for="a-fees">Fees and payment</label><input class="cx-input" id="a-fees" placeholder="$6,000 — 50% upfront, 50% on delivery" /></div>
          <div><label for="a-dates">Dates</label><input class="cx-input" id="a-dates" placeholder="Start 1 Dec, deliver by 31 Jan" /></div>
          <div><label for="a-law">Governing law</label><input class="cx-input" id="a-law" placeholder="State of Delaware, USA" /></div>
          <div><label for="a-brief">What is the work?</label><textarea id="a-brief" rows="5" placeholder="Build a 5-page website with online ordering for a bakery. Two rounds of changes. Hosting not included."></textarea></div>
          <button class="btn" id="btn-ai-draft">Write the draft</button>
        </div>
        <div data-ai-pane="review" class="cx-stack" hidden>
          <p class="muted small">The AI reads the contract text and lists risks for ForkScape, missing clauses and unclear wording.</p>
          <button class="btn" id="btn-ai-review">Review this contract</button>
          <div class="cx-paper cx-paper--md cx-paper--scroll" id="ai-review" hidden></div>
        </div>
        <div data-ai-pane="revise" class="cx-stack" hidden>
          <div><label for="a-instr">What should change?</label><textarea id="a-instr" rows="4" placeholder="Add a clause that the client gets 2 rounds of revisions. Change payment to net 30."></textarea></div>
          <button class="btn" id="btn-ai-revise">Apply the change</button>
        </div>
        <p class="muted small">AI output is a draft, not legal advice. Read every clause before you send.</p>
      </aside>
    </div>`;

  $('#f-title').value = c.title;
  $('#f-body').value = c.body;
  $('#f-message').value = c.message;
  $('#f-days').value = c.link_days;

  // ── signers
  const box = $('#signers');
  function drawSigners() {
    box.innerHTML = signers.map((s, i) => `
      <div class="cx-signer" data-i="${i}">
        <input class="cx-input" data-k="name" placeholder="Full name" aria-label="Signer ${i + 1} name" />
        <input class="cx-input" data-k="email" type="email" placeholder="Email" aria-label="Signer ${i + 1} email" />
        <input class="cx-input" data-k="role" placeholder="Role" aria-label="Signer ${i + 1} role" />
        <button class="cx-link small cx-danger" type="button" data-remove="${i}" aria-label="Remove signer ${i + 1}">Remove</button>
      </div>`).join('') || '<p class="muted small">No signers yet.</p>';
    box.querySelectorAll('.cx-signer').forEach((row) => {
      const s = signers[Number(row.dataset.i)];
      row.querySelectorAll('input').forEach((inp) => {
        inp.value = s[inp.dataset.k] ?? '';
        inp.addEventListener('input', () => { s[inp.dataset.k] = inp.value; });
      });
    });
    box.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => { signers.splice(Number(b.dataset.remove), 1); drawSigners(); }));
  }
  drawSigners();
  $('#btn-add-signer').addEventListener('click', () => { signers.push({ name: '', email: '', role: 'Client' }); drawSigners(); });
  $('#btn-add-me').addEventListener('click', () => {
    if (signers.some((s) => s.email.toLowerCase() === me.email)) { toast('You are already a signer.'); return; }
    signers.push({ name: '', email: me.email, role: 'ForkScape' });
    drawSigners();
    box.querySelector(`[data-i="${signers.length - 1}"] input`).focus();
  });

  // ── write / preview / templates
  const setMode = (preview) => {
    $('#f-body').hidden = preview;
    $('#preview').hidden = !preview;
    $('#btn-write').setAttribute('aria-pressed', String(!preview));
    $('#btn-preview').setAttribute('aria-pressed', String(preview));
    if (preview) $('#preview').innerHTML = renderDoc($('#f-body').value) || '<p style="color:#8a93a6">Nothing to preview yet.</p>';
  };
  $('#btn-write').addEventListener('click', () => setMode(false));
  $('#btn-preview').addEventListener('click', () => setMode(true));
  const replaceBody = (text, why) => {
    undo = $('#f-body').value;
    $('#f-body').value = text;
    $('#btn-undo').hidden = !undo;
    if (!$('#f-title').value.trim()) {
      const h1 = /^#\s+(.+)$/m.exec(text);
      if (h1) $('#f-title').value = h1[1].trim().slice(0, 200);
    }
    setMode(!$('#preview').hidden);
    toast(why);
  };
  $('#btn-undo').addEventListener('click', () => {
    if (undo === null) return;
    $('#f-body').value = undo;
    undo = null;
    $('#btn-undo').hidden = true;
    setMode(!$('#preview').hidden);
  });
  $('#f-template').addEventListener('change', (e) => {
    const t = TEMPLATES[e.target.value];
    e.target.value = '';
    if (!t) return;
    if ($('#f-body').value.trim() && !confirm('Replace the current text with this template?')) return;
    replaceBody(t.body, `Template "${t.label}" inserted. Fill every [bracket].`);
  });

  // ── AI
  document.querySelectorAll('[data-ai]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-ai]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    document.querySelectorAll('[data-ai-pane]').forEach((p) => { p.hidden = p.dataset.aiPane !== b.dataset.ai; });
  }));
  const firstClient = signers.find((s) => s.email && s.email.toLowerCase() !== me.email);
  if (firstClient) $('#a-client').value = firstClient.name;
  const aiReady = () => {
    if (me.ai.configured) return true;
    toast('Add your AI provider and API key in Settings first.', true);
    return false;
  };
  $('#btn-ai-draft').addEventListener('click', (e) => {
    if (!aiReady()) return;
    if ($('#f-body').value.trim() && !confirm('Replace the current text with a new AI draft? You can undo.')) return;
    busy(e.currentTarget, async () => {
      const r = await call('/api/ai', { body: {
        action: 'draft', kind: $('#a-kind').value, client_name: $('#a-client').value, client_company: $('#a-company').value,
        fees: $('#a-fees').value, dates: $('#a-dates').value, law: $('#a-law').value, brief: $('#a-brief').value,
      } });
      replaceBody(r.text, r.truncated ? 'Draft inserted, but the AI stopped early. Check the end.' : 'AI draft inserted. Read every clause and fill every [bracket].');
    });
  });
  $('#btn-ai-review').addEventListener('click', (e) => {
    if (!aiReady()) return;
    busy(e.currentTarget, async () => {
      const r = await call('/api/ai', { body: { action: 'review', body: $('#f-body').value } });
      $('#ai-review').hidden = false;
      $('#ai-review').innerHTML = renderDoc(r.text);
    });
  });
  $('#btn-ai-revise').addEventListener('click', (e) => {
    if (!aiReady()) return;
    busy(e.currentTarget, async () => {
      const r = await call('/api/ai', { body: { action: 'revise', body: $('#f-body').value, instruction: $('#a-instr').value } });
      replaceBody(r.text, r.truncated ? 'Change applied, but the AI stopped early. Check the end.' : 'Change applied. You can undo.');
    });
  });

  // ── save / send / delete
  const payload = () => ({
    title: $('#f-title').value,
    body: $('#f-body').value,
    message: $('#f-message').value,
    link_days: Number($('#f-days').value) || 30,
    signers: signers.filter((s) => s.name.trim() || s.email.trim()),
  });
  let id = data?.contract?.id ?? null;
  async function save() {
    const r = id
      ? await call(`/api/contracts/${id}`, { method: 'PUT', body: payload() })
      : await call('/api/contracts', { body: payload() });
    if (!id) {
      id = r.contract.id;
      history.replaceState(null, '', `#/c/${id}`);
    }
    return r;
  }
  $('#btn-save').addEventListener('click', (e) => busy(e.currentTarget, async () => { await save(); toast('Draft saved.'); }));
  $('#btn-send').addEventListener('click', (e) => {
    const p = payload();
    if (/\[[^\]\n]{2,60}\]/.test(p.body) && !confirm('The text still has [bracket] placeholders. Send anyway?')) return;
    if (!p.signers.length) { toast('Add at least one signer.', true); return; }
    const who = p.signers.map((s) => `• ${s.name} <${s.email}> (${s.role || 'Client'})`).join('\n');
    if (!confirm(`Send "${p.title}" for signature?\n\n${who}\n\nAfter sending, the text cannot change. To fix a mistake you void it and send a new version.`)) return;
    busy(e.currentTarget, async () => {
      await save();
      const r = await call(`/api/contracts/${id}/send`, { body: {} });
      toast(r.email_failed?.length ? `Sent, but email failed for: ${r.email_failed.join(', ')}. Use "Resend link".` : 'Sent. Each signer has a personal link.', Boolean(r.email_failed?.length));
      location.hash = `#/c/${id}`;
      if (location.hash === `#/c/${id}`) renderDetail(r);
    });
  });
  $('#btn-delete')?.addEventListener('click', (e) => {
    if (!confirm('Delete this draft? This cannot be undone.')) return;
    busy(e.currentTarget, async () => { await call(`/api/contracts/${id}`, { method: 'DELETE' }); toast('Draft deleted.'); location.hash = '#/'; });
  });
}

// ─────────────────────────────────────────────────────────── detail ──

const EVENT_LABELS = {
  created: 'Draft created', sent: 'Sent for signature', link_resent: 'Sign link sent again', viewed: 'Opened the document',
  code_sent: 'One-time code sent', email_verified: 'Email confirmed', signed: 'Signed', declined: 'Declined',
  voided: 'Voided', completed: 'Completed — PDF sent to all parties', finalize_failed: 'PDF build failed',
};

function renderDetail(data) {
  const { contract: c, signers, events } = data;
  const allSigned = signers.length && signers.every((s) => s.status === 'signed');
  const canFinalize = (c.status === 'sent' || c.status === 'finalizing') && allSigned;
  view().innerHTML = `
    <p style="margin-bottom:12px"><a href="#/">← All contracts</a></p>
    <div class="cx-row cx-row--between">
      <div>
        <h2 style="font-size:24px;margin:0">${esc(c.title)} ${chip(c.status)}</h2>
        <p class="muted small" style="margin-top:6px">${esc(c.id)} · Sent ${esc(fmtDate(c.sent_at))}${c.status === 'sent' ? ` · Links valid until ${esc(fmtDate(c.expires_at, false))}` : ''}${c.completed_at ? ` · Completed ${esc(fmtDate(c.completed_at))}` : ''}</p>
      </div>
      <div class="cx-row">
        ${c.status === 'completed' ? '<button class="btn" id="btn-pdf">Download signed PDF</button>' : ''}
        ${canFinalize ? '<button class="btn" id="btn-finalize">Build the PDF again</button>' : ''}
        <button class="btn btn--ghost" id="btn-dup">Duplicate as draft</button>
        ${c.status === 'sent' ? '<button class="btn btn--ghost cx-danger" id="btn-void">Void</button>' : ''}
      </div>
    </div>
    ${c.status === 'voided' && c.void_reason ? `<div class="cx-note cx-note--bad" style="margin-top:14px">Voided: ${esc(c.void_reason)}</div>` : ''}
    ${c.status === 'expired' ? '<div class="cx-note" style="margin-top:14px">The sign links expired. Duplicate the contract and send it again.</div>' : ''}
    <div class="cx-grid2" style="margin-top:18px">
      <div class="cx-stack">
        <div class="cx-card">
          <h2>Signers</h2>
          <div class="cx-list">
            ${signers.map((s) => `
              <div class="cx-row cx-row--between" style="padding:8px 0;border-bottom:1px solid var(--bar-border)">
                <span><b>${esc(s.name)}</b> <span class="muted small">· ${esc(s.role)} · ${esc(s.email)}</span><br />
                  <span class="muted small">${s.signed_at ? `Signed ${esc(fmtDate(s.signed_at))} as "${esc(s.sig_name)}" from ${esc(s.sig_ip || '?')}${s.sig_country ? ` (${esc(s.sig_country)})` : ''}`
                    : s.declined_at ? `Declined ${esc(fmtDate(s.declined_at))}${s.decline_reason ? `: ${esc(s.decline_reason)}` : ''}`
                    : s.viewed_at ? `Opened ${esc(fmtDate(s.viewed_at))}${s.verified_at ? ' · email confirmed' : ''}` : 'Not opened yet'}</span></span>
                <span class="cx-row">${chip(s.status)}${c.status === 'sent' && (s.status === 'pending' || s.status === 'viewed') ? `<button class="btn btn--ghost cx-btn-sm" data-resend="${esc(s.id)}">Resend link</button>` : ''}</span>
              </div>`).join('')}
          </div>
        </div>
        <article class="cx-paper cx-paper--scroll">${renderDoc(c.body)}</article>
        <p class="muted small">Document fingerprint (SHA-256): <span class="mono">${esc(c.doc_hash)}</span>${c.pdf_hash ? `<br />Signed PDF SHA-256: <span class="mono">${esc(c.pdf_hash)}</span>` : ''}</p>
      </div>
      <aside class="cx-card">
        <h2>Audit trail</h2>
        <ul class="cx-events">
          ${events.map((e) => `<li><time>${esc(fmtDate(e.at))}</time><span><b>${esc(EVENT_LABELS[e.type] || e.type)}</b> <span class="muted">· ${esc(e.actor === 'owner' ? 'you' : e.actor)}${e.ip ? ` · ${esc(e.ip)}` : ''}${e.country ? ` (${esc(e.country)})` : ''}</span>${e.detail?.error ? `<br /><span class="muted">${esc(e.detail.error)}</span>` : ''}</span></li>`).join('')}
        </ul>
      </aside>
    </div>`;

  $('#btn-pdf')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const res = await api(`/api/contracts/${c.id}/pdf`, { method: 'GET', token, raw: true });
    await downloadBlob(res, 'contract-signed.pdf');
  }));
  $('#btn-finalize')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    renderDetail(await call(`/api/contracts/${c.id}/finalize`, { body: {} }));
    toast('PDF built and sent to all parties.');
  }));
  $('#btn-dup').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const r = await call(`/api/contracts/${c.id}/duplicate`, { body: {} });
    toast('Copied to a new draft.');
    location.hash = `#/c/${r.contract.id}`;
  }));
  $('#btn-void')?.addEventListener('click', (e) => {
    const reason = prompt('Void this contract? All sign links stop working.\n\nReason (signers see it):');
    if (reason === null) return;
    busy(e.currentTarget, async () => { renderDetail(await call(`/api/contracts/${c.id}/void`, { body: { reason } })); toast('Contract voided.'); });
  });
  view().querySelectorAll('[data-resend]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    await call(`/api/contracts/${c.id}/resend`, { body: { signer_id: b.dataset.resend } });
    toast('New link sent. The old link no longer works.');
  })));
}

// ───────────────────────────────────────────────────────── settings ──

async function renderSettings() {
  let ai;
  try { ai = await call('/api/settings/ai', { method: 'GET' }); } catch (err) { view().innerHTML = `<div class="cx-note cx-note--bad">${esc(err.message)}</div>`; return; }
  const presetKey = ai.preset && PRESETS[ai.preset] ? ai.preset : (Object.entries(PRESETS).find(([, p]) => p.base_url === ai.base_url)?.[0] ?? 'custom');
  view().innerHTML = `
    <div class="cx--narrow" style="max-width:720px">
      <div class="cx-card cx-stack">
        <h2 style="margin:0">AI provider</h2>
        <p class="muted small">The assistant drafts, reviews and revises contracts with this provider. You pay the provider for usage.</p>
        <div><label for="s-preset">Provider</label>
          <select id="s-preset">${Object.entries(PRESETS).map(([k, p]) => `<option value="${k}"${k === presetKey ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select></div>
        <div><label for="s-format">API format</label>
          <select id="s-format">
            <option value="anthropic">Anthropic Messages API</option>
            <option value="openai">OpenAI-compatible (chat/completions)</option>
            <option value="gemini">Google Gemini API</option>
          </select></div>
        <div><label for="s-base">Base URL</label><input class="cx-input" id="s-base" placeholder="https://…" /></div>
        <div><label for="s-model">Model</label><input class="cx-input" id="s-model" /><p class="muted small" id="s-hint" style="margin-top:6px"></p></div>
        <div>
          <label for="s-key">API key</label>
          <input class="cx-input" id="s-key" type="password" autocomplete="off" placeholder="${ai.key_hint ? `Saved: ${esc(ai.key_hint)} — leave empty to keep it` : 'Paste the API key'}" />
          <p class="muted small" style="margin-top:6px">The key is stored encrypted on the server. It is never shown again, and the page never receives it back.</p>
        </div>
        <div class="cx-row cx-row--between">
          ${ai.key_hint ? '<button class="cx-link small cx-danger" id="s-clear" type="button">Remove the saved key</button>' : '<span></span>'}
          <div class="cx-row">
            <button class="btn btn--ghost" id="s-test"${ai.configured ? '' : ' disabled'}>Test connection</button>
            <button class="btn" id="s-save">Save</button>
          </div>
        </div>
        <div id="s-result"></div>
      </div>
      <div class="cx-card">
        <h2>Service status</h2>
        <ul class="muted small" style="margin-left:18px;line-height:1.9">
          <li>Email (sign links, codes, PDFs): ${me.email_ready ? 'ready' : '<b style="color:var(--red)">not set up</b>'}</li>
          <li>Signed PDF storage: ${me.storage === 'r2' ? 'R2 bucket' : 'database (D1)'}</li>
          <li>Owner sign-in: ${esc(me.email)}</li>
          <li>Company name on contracts: ${esc(me.company)}</li>
        </ul>
      </div>
    </div>`;
  $('#s-format').value = ai.format;
  $('#s-base').value = ai.base_url;
  $('#s-model').value = ai.model;
  const hint = () => {
    const p = PRESETS[$('#s-preset').value];
    $('#s-hint').textContent = p.hint;
    $('#s-model').placeholder = p.model || 'model ID from your provider';
  };
  hint();
  $('#s-preset').addEventListener('change', () => {
    const p = PRESETS[$('#s-preset').value];
    $('#s-format').value = p.format;
    $('#s-base').value = p.base_url;
    $('#s-model').value = p.model;
    hint();
  });
  const save = (extra = {}) => call('/api/settings/ai', { method: 'PUT', body: {
    preset: $('#s-preset').value, format: $('#s-format').value, base_url: $('#s-base').value, model: $('#s-model').value, api_key: $('#s-key').value, ...extra,
  } });
  $('#s-save').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    me.ai = await save();
    toast('AI settings saved.');
    renderSettings();
  }));
  $('#s-clear')?.addEventListener('click', (e) => {
    if (!confirm('Remove the saved API key?')) return;
    busy(e.currentTarget, async () => { me.ai = await save({ clear_key: true, api_key: '' }); toast('Key removed.'); renderSettings(); });
  });
  $('#s-test').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const out = $('#s-result');
    try {
      const r = await call('/api/ai', { body: { action: 'test' } });
      out.innerHTML = `<div class="cx-note cx-note--ok">Connected. ${esc(r.model)} answered: "${esc(r.text.slice(0, 80))}"</div>`;
    } catch (err) {
      out.innerHTML = `<div class="cx-note cx-note--bad">${esc(err.message)}</div>`;
    }
  }));
}

// ───────────────────────────────────────────────────────────── boot ──

if (token) start(); else showLogin();
