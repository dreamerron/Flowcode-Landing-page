# Hunch — the AI teammate in your WhatsApp Business inbox

Hunch sits on a business's WhatsApp number like a third person in the
chat. Customers keep chatting exactly like before; Hunch extracts every
order, payment, appointment, lead, task and expense into structured
records as they happen — and the owner texts the **same number** to get
reports, lists and print-ready invoices, or opens the live dashboard.
Nothing ever has to be copied out of WhatsApp.

**Stack:** one Cloudflare Worker (`src/index.js`) + Workers KV +
WhatsApp Cloud API + Claude (`claude-opus-5`, strict-schema extraction +
an owner copilot with tools). The landing page is `../hunch.html`.

> "Hunch" is a placeholder brand — search-and-replace it freely.

## Languages (India-first, code-mixed)

All three Claude calls (extraction, owner copilot, customer assist) share
one `LANGUAGE_GUIDE` in `src/index.js`:

- Understands Hinglish, Devanagari Hindi and mixes with Tamil, Telugu,
  Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Urdu and
  English, including spelling variants and SMS shorthand.
- Replies in the same language **and script** the person used last
  (Roman-letter Hinglish in → Hinglish out; Devanagari in → Devanagari out)
  and switches only when asked ("Hindi mein batao").
- Indian numerals and money: lakh/crore, "k", hazaar, sau, dedh, dhai,
  sava; INR amounts are displayed with Indian grouping (₹12,34,567).
- Hindi date words resolve to ISO dates (kal and parso by tense, agle
  somvar, "15 tarikh"); business terms (udhaar, baaki, advance, COD,
  "GPay kar diya") map to the right record types and statuses; GST slabs
  are known for invoices (`tax_percent`).
- Each extracted record stores a `language` tag; summaries are normalised
  to English while customer names and local item words stay as written.

Caveats: quality is strongest for Hindi/Hinglish and the largest
languages and will be lower for smaller ones — test with real chat
samples from your target businesses before promising a language.

## Voice notes

Claude's API doesn't accept audio, so voice notes are transcribed first
with Whisper on Workers AI (`@cf/openai/whisper-large-v3-turbo`, via the
`[ai]` binding in `wrangler.toml`: no extra API key, billed to the same
Cloudflare account at about $0.0005 per audio minute). The transcript is
tagged `[voice note]` and then follows exactly the same path as a typed
message:

- **Customer voice note** → extracted into records, owner pinged
  ("New from *Rohit (voice note)*"), replied to only in assist mode.
- **Owner voice note** → answered by the copilot, with the reply starting
  `🎙️ Heard: "…"` so the owner can spot a mis-hearing before trusting a
  number.
- **Failures** (download error, file over 5 MB, empty transcript, binding
  missing) → the owner is asked to resend or type; a customer's message is
  logged as `[voice note: could not transcribe]` and nothing is sent.

The prompts warn Claude that transcripts contain errors (especially in
names and numbers) and that Hindi speech may come back in Devanagari or
Urdu script even from someone who types Hinglish; it replies in the
script the person normally types in. Tuning: set `TRANSCRIBE_LANGUAGE`
(e.g. `"hi"`, `"ta"`) to force one language, or `TRANSCRIBE_PROMPT` to
change the vocabulary hint. Leave the language unset if customers speak
different languages.

Caveats: Whisper is weaker on heavily code-mixed speech and on smaller
Indian languages than on Hindi or English. If accuracy on real voice
notes isn't good enough, an India-specialised speech API (Sarvam AI,
Google Chirp, or similar) can replace `transcribeVoice()` without
touching the rest of the pipeline. Images (e.g. UPI payment screenshots)
are still only logged as `[image message]`; reading them with Claude's
vision is the natural next step.

## Market positioning

WhatsApp tooling today falls into two camps, and Hunch is a third:

| Camp | Examples | Job | Gap |
|---|---|---|---|
| Chat / CRM / marketing platforms | WATI, Interakt, SleekFlow, Zoko, AiSensy, respond.io | *Send* — broadcasts, shared inbox, catalogs, support bots | Orders and payments stay trapped in the chat |
| Customer-facing AI agents | Meta's AI agent for WhatsApp Business (global since June 2026) | *Answer* — product Q&A, appointment booking, lead qualification | No ledger, invoices or dashboard |
| **Hunch** | — | *Record* — passive extraction → invoices, reports, live dashboard | — |

Manual ledger apps (Khatabook, OkCredit, BukuWarung, Kippa) proved the
pain is real but required typing every sale by hand; here the chat is the
data entry. Target corridors with the strongest WhatsApp-commerce usage:
India, Indonesia, Pakistan, Brazil, Nigeria.

Caveats: this comes from vendor marketing pages and secondary sources,
not independent tests; verify before relying on it. Extraction itself is
replicable (including by Meta), so the durable moat is distribution and
becoming the system of record, not the model call.

## What it does

**Customer messages** (anyone not listed as an owner):
- Logged per conversation (last 30 messages kept for context).
- Run through a forced, strict-schema extraction call → zero or more
  records: `order · payment · appointment · task · lead · expense · note`,
  each with summary, amount, currency, due date, status, customer.
- Orders and payments trigger an instant WhatsApp heads-up to the owner.
- **Silent mode** (default): customers get no reply — they never know
  Hunch is there. **Assist mode**: Hunch also answers customers politely
  in their language, using the business profile you give it.

**Owner messages** (numbers in `OWNER_NUMBERS`) go to the copilot, which
answers in the owner's language and can:
- `query_records` — "sales this week", "who hasn't paid", "what's due
  tomorrow" → totals first, then the list.
- `create_invoice` — numbered, taxed, print-ready A4 invoice; the link
  comes back in chat (`/invoice/INV-2026-0001?key=…`).
- `add_record` — dictate expenses/tasks/notes: "add expense 50 packaging".
- `update_record_status` — "mark Jonas' order paid".
- `set_mode` — switch silent/assist.
- `web_search` — genuinely external questions (suppliers, market prices).

**Dashboard** (`/dashboard?key=<ADMIN_SECRET>`): payments this month,
open orders, unpaid invoices, upcoming dates, open tasks, a 14-day
payments chart, invoice list and the full activity table — rendered live
from KV, nothing to export.

## Setup (≈30 minutes)

### 1. WhatsApp Cloud API (Meta)
1. [developers.facebook.com](https://developers.facebook.com) → Create App →
   type **Business** → add the **WhatsApp** product.
2. Note the **Phone number ID** (API Setup page). The free test number is
   fine for development; register your real business number for launch.
3. Business Settings → System Users → create one, generate a **permanent
   token** with `whatsapp_business_messaging` + `whatsapp_business_management`.
4. App Settings → Basic → copy the **App Secret**.

### 2. Anthropic
Create an API key at [console.anthropic.com](https://console.anthropic.com).

### 3. Deploy
```bash
cd hunch
npm install
npx wrangler kv namespace create HUNCH_KV   # paste id into wrangler.toml
# edit wrangler.toml: WHATSAPP_PHONE_NUMBER_ID, OWNER_NUMBERS, BUSINESS_NAME, CURRENCY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put WHATSAPP_TOKEN
npx wrangler secret put WHATSAPP_APP_SECRET
npx wrangler secret put WEBHOOK_VERIFY_TOKEN   # any random string
npx wrangler secret put ADMIN_SECRET           # random string; guards dashboard & invoices
npx wrangler deploy
```

### 4. Point Meta at the worker
WhatsApp → Configuration → Webhook:
- Callback URL: `https://hunch-whatsapp.<your-subdomain>.workers.dev/webhook`
- Verify token: your `WEBHOOK_VERIFY_TOKEN`
- Subscribe to the **messages** field.

### 5. Try it
- From an owner number: "what can you do?" — then have a friend text the
  business number with a fake order and watch the heads-up arrive.
- Optional: store a business profile for assist mode —
  `npx wrangler kv key put --binding HUNCH_KV settings:profile "We sell …, prices …, hours …"`.
- Wire the landing page: set `WAITLIST_ENDPOINT` in `../hunch.html` to
  `https://<worker-url>/waitlist`; read signups via `GET /admin/waitlist`
  with `Authorization: Bearer <ADMIN_SECRET>`.

## Design notes & limits

- **Groups:** the WhatsApp Cloud API does not let a bot join arbitrary
  group chats as a third member. Hunch therefore lives on the business
  number itself, which is where customer conversations already are. If
  Meta opens group access, the same extraction pipeline applies.
- **Outbound replies** only ever happen inside WhatsApp's 24-hour
  customer-service window (we only reply to inbound messages), which is
  always within policy. Proactive reminders would need approved template
  messages — future work.
- The webhook ACKs Meta instantly and does Claude work in `ctx.waitUntil`,
  so slow answers never cause webhook retries. Payload signatures are
  HMAC-verified against your App Secret.
- Extraction uses a **forced strict-schema tool call**, so records always
  parse; the copilot opts into server-side refusal fallbacks.
- Every customer message costs one `claude-opus-5` extraction call. For a
  high-volume shop, change `MODEL` in `src/index.js` (e.g.
  `claude-sonnet-5`) to cut cost.
- Storage is Workers KV — perfect up to thousands of records. Past that,
  the natural upgrade is Cloudflare D1 behind the same tool interface.
- Invoices/reports are print-ready HTML (one tap → PDF). PPTX/deck export
  is a roadmap item (Anthropic's code-execution skills can generate them).
