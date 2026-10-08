/**
 * Hunch — the AI teammate inside your WhatsApp Business inbox.
 *
 * It sits on the business's WhatsApp number as a third participant:
 * every customer conversation flows through it, it extracts structured
 * records (orders, payments, appointments, leads, tasks, expenses) as
 * they happen, and the owner texts the same number to get reports,
 * invoices, lists — or opens the live dashboard. Nothing ever has to be
 * copied out of WhatsApp.
 *
 * Cloudflare Worker routes:
 *   GET  /webhook            Meta webhook verification handshake
 *   POST /webhook            WhatsApp message events (HMAC-verified)
 *   GET  /dashboard?key=     live business dashboard (ADMIN_SECRET)
 *   GET  /invoice/{no}?key=  print-ready A4 invoice (ADMIN_SECRET)
 *   POST /waitlist           landing-page waitlist {email, country?}
 *   GET  /admin/waitlist     list waitlist signups (Bearer ADMIN_SECRET)
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5";
const GRAPH = "https://graph.facebook.com/v21.0";
const CHAT_LIMIT = 30; // stored messages per conversation
const WA_CHUNK = 3800; // WhatsApp caps text messages at 4096 chars
const RECORD_SCAN = 1000; // max records scanned for queries/dashboard

// Shared by the extractor, the owner copilot and customer assist mode.
const LANGUAGE_GUIDE = `Language rules (India-first, but work for every language):
- People freely mix languages and scripts inside one message: Hinglish (Hindi in Roman letters mixed with English), Devanagari, Tanglish, Benglish, plus Marathi, Gujarati, Punjabi, Tamil, Telugu, Kannada, Malayalam, Bengali, Odia, Urdu, often with English nouns and SMS-style spelling ("kal", "bhej do", "paisa mil gaya", "advance de diya"). Understand all of it, including spelling variants.
- Reply in the same language AND script the person used most recently: Hinglish in -> Hinglish (Roman letters) out; Devanagari in -> Devanagari out; English in -> English out. Mirror their register and never switch to formal Hindi or pure English on your own. If they ask for a language ("Hindi mein batao", "Tamil-la sollu"), switch to it.
- Indian money and numbers: Rs, rupees, INR; lakh = 1,00,000 and crore = 1,00,00,000; "k" = thousand, "hazaar" = 1000, "sau" = 100, "paanch sau" = 500; "dedh" = 1.5, "dhai" = 2.5, "sava" = 1.25, "sadhe" = plus a half. Write INR amounts with Indian digit grouping (1,23,456).
- Dates: aaj = today; kal = tomorrow OR yesterday, decided by tense ("kal bhej dunga" = tomorrow, "kal aaya tha" = yesterday); parso = day after tomorrow or day before yesterday by tense; agle hafte = next week; somvar, mangalvar, budhvar, guruvar, shukravar, shanivar, ravivar = Monday..Sunday; "15 tarikh" = the 15th; "mahine ke end" = end of month.
- Business words: udhaar / baaki = owed on credit; advance / bayana = deposit; pakka / confirm = confirmed; COD = cash on delivery; "GPay / PhonePe / Paytm / UPI kar diya" = a payment was made; "screenshot bhej diya" = payment proof sent; GST slabs are 5, 12, 18 and 28 percent.`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/webhook" && request.method === "GET") return verifyWebhook(url, env);
    if (path === "/webhook" && request.method === "POST") return receiveWebhook(request, env, ctx);
    if (path === "/dashboard" && request.method === "GET") {
      return pageGuard(url, env) ?? dashboardPage(env, url.origin);
    }
    if (path.startsWith("/invoice/") && request.method === "GET") {
      return pageGuard(url, env) ?? invoicePage(env, decodeURIComponent(path.slice("/invoice/".length)));
    }
    if (path === "/waitlist" && request.method === "POST") return joinWaitlist(request, env);
    if (path === "/waitlist" && request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
    if (path === "/admin/waitlist" && request.method === "GET") {
      return adminGuard(request, env) ?? listWaitlist(env);
    }
    return new Response("Hunch is running.", { status: 200 });
  },
};

/* ------------------------------------------------------------ webhook -- */

function verifyWebhook(url, env) {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === env.WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

async function receiveWebhook(request, env, ctx) {
  const raw = await request.text();
  const signature = request.headers.get("X-Hub-Signature-256") || "";
  if (!(await validSignature(raw, signature, env.WHATSAPP_APP_SECRET))) {
    return new Response("Bad signature", { status: 401 });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  // Ack immediately (Meta retries slow webhooks); do the real work after.
  ctx.waitUntil(handleEvents(body, env, new URL(request.url).origin));
  return new Response("OK", { status: 200 });
}

async function validSignature(raw, header, secret) {
  if (!header.startsWith("sha256=") || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expected = header.slice("sha256=".length).toLowerCase();
  if (hex.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function handleEvents(body, env, origin) {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const message of value.messages ?? []) {
        const profileName = value.contacts?.[0]?.profile?.name ?? "";
        try {
          await handleMessage(message, profileName, env, origin);
        } catch (err) {
          console.error("handleMessage failed", err);
          if (isOwner(message.from, env)) {
            await sendText(env, message.from, "⚠️ Something went wrong on my side — try that again in a moment.").catch(() => {});
          }
        }
      }
    }
  }
}

/* ----------------------------------------------------- message routing -- */

function isOwner(waId, env) {
  return (env.OWNER_NUMBERS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^\+/, ""))
    .filter(Boolean)
    .includes(waId.replace(/^\+/, ""));
}

async function handleMessage(message, profileName, env, origin) {
  const from = message.from;
  if (message.type !== "text") {
    // Log non-text customer messages so the transcript stays coherent.
    if (!isOwner(from, env)) await appendChat(env, from, profileName, "customer", `[${message.type} message]`);
    return;
  }
  const text = (message.text?.body ?? "").trim();
  if (!text) return;

  if (isOwner(from, env)) {
    await markRead(env, message.id, true);
    const reply = await ownerCopilot(env, from, text, origin);
    for (const chunk of chunkText(reply, WA_CHUNK)) await sendText(env, from, chunk);
    return;
  }

  // Customer message: always log + extract; reply only in assist mode.
  await markRead(env, message.id, false);
  const history = await appendChat(env, from, profileName, "customer", text);
  const extracted = await extractRecords(env, from, profileName, history, text);

  const mode = (await env.HUNCH_KV.get("settings:mode")) || "silent";
  if (mode === "assist") {
    await markRead(env, message.id, true);
    const reply = await assistCustomer(env, from, profileName, history, text);
    if (reply) {
      for (const chunk of chunkText(reply, WA_CHUNK)) await sendText(env, from, chunk);
      await appendChat(env, from, profileName, "assistant", reply);
    }
  }

  // Heads-up to owners for high-signal records (orders & payments).
  const notable = extracted.filter((r) => r.type === "order" || r.type === "payment");
  if (notable.length) {
    const who = profileName || from;
    const lines = notable.map((r) => `• ${r.type.toUpperCase()}: ${r.summary}${r.amount ? ` — ${fmtMoney(r.amount, r.currency)}` : ""}`);
    for (const owner of ownerList(env)) {
      await sendText(env, owner, `📥 New from *${who}*:\n${lines.join("\n")}`).catch(() => {});
    }
  }
}

function ownerList(env) {
  return (env.OWNER_NUMBERS ?? "").split(",").map((s) => s.trim().replace(/^\+/, "")).filter(Boolean);
}

/* ------------------------------------------------- customer chat store -- */

async function appendChat(env, waId, name, role, text) {
  const key = `chat:${waId}`;
  const chat = (await getJSON(env, key)) ?? { name: "", messages: [] };
  if (name) chat.name = name;
  chat.messages.push({ role, text: text.slice(0, 2000), at: new Date().toISOString() });
  chat.messages = chat.messages.slice(-CHAT_LIMIT);
  await putJSON(env, key, chat);
  return chat;
}

/* ----------------------------------------------------- data extraction -- */

const RECORD_TYPES = ["order", "payment", "appointment", "task", "lead", "expense", "note"];

const EXTRACT_TOOL = {
  name: "record_business_data",
  description: "Record structured business data found in a WhatsApp customer message.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      records: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: RECORD_TYPES },
            summary: { type: "string", description: "One line, e.g. '2x blue dress size M, delivery Friday'" },
            amount: { type: "number", description: "Monetary amount, 0 if none mentioned" },
            currency: { type: "string", description: "ISO code like EUR, IDR, NGN; '' if none" },
            due: { type: "string", description: "ISO date YYYY-MM-DD if a date/deadline applies, else ''" },
            status: { type: "string", enum: ["open", "confirmed", "paid", "done", "cancelled"] },
            language: { type: "string", description: "Language/script of the customer's message, e.g. 'Hinglish'" },
          },
          required: ["type", "summary", "amount", "currency", "due", "status", "language"],
          additionalProperties: false,
        },
      },
    },
    required: ["records"],
    additionalProperties: false,
  },
};

async function extractRecords(env, waId, name, chat, newText) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const context = chat.messages.slice(-10, -1).map((m) => `${m.role}: ${m.text}`).join("\n");
  const today = new Date().toISOString().slice(0, 10);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    tool_choice: { type: "tool", name: "record_business_data" },
    tools: [EXTRACT_TOOL],
    system: [{
      type: "text",
      cache_control: { type: "ephemeral" },
      text: `You extract business records from WhatsApp messages received by "${env.BUSINESS_NAME || "a small business"}". Today is ${today}. Default currency: ${env.CURRENCY || "USD"}.

Extract ONLY what the NEW message adds — never re-record things already covered by earlier context. An order is a concrete purchase intent (items/quantity). A payment is money sent or confirmed. An appointment is an agreed date/time. A lead is a new prospect showing interest with no order yet. A task is something the business must do. Record nothing for greetings and small talk — an empty records list is the normal case. Resolve relative dates ("Friday", "tomorrow", "kal", "agle somvar") to ISO dates. Write each summary in plain English but keep customer names, product names and local item words (e.g. "kaju katli") exactly as the customer wrote them. Set "language" to the language/script mix of the message, e.g. "Hinglish", "Hindi (Devanagari)", "Tamil", "English".

${LANGUAGE_GUIDE}`,
    }],
    messages: [{
      role: "user",
      content: `Customer: ${name || waId}\nEarlier context:\n${context || "(none)"}\n\nNEW message:\n${newText}`,
    }],
  });

  const call = response.content.find((b) => b.type === "tool_use" && b.name === "record_business_data");
  const records = Array.isArray(call?.input?.records) ? call.input.records : [];
  const saved = [];
  for (const r of records.slice(0, 10)) {
    if (!RECORD_TYPES.includes(r.type) || !r.summary) continue;
    const rec = {
      id: newId(),
      at: new Date().toISOString(),
      type: r.type,
      summary: String(r.summary).slice(0, 300),
      amount: Number.isFinite(r.amount) ? r.amount : 0,
      currency: r.currency || env.CURRENCY || "USD",
      due: r.due || "",
      status: r.status || "open",
      language: String(r.language || "").slice(0, 40),
      customer: { waId, name: name || "" },
      source: "auto",
    };
    await putJSON(env, recordKey(rec), rec);
    saved.push(rec);
  }
  return saved;
}

function recordKey(rec) {
  return `record:${rec.at}:${rec.id}`;
}
function newId() {
  return [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function listRecords(env, { type = "", since = "", until = "", status = "" } = {}) {
  const out = [];
  let cursor;
  do {
    const page = await env.HUNCH_KV.list({ prefix: "record:", cursor, limit: 1000 });
    for (const k of page.keys) out.push(k.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && out.length < RECORD_SCAN);
  out.sort().reverse(); // keys embed ISO timestamps → newest first
  const picked = [];
  for (const keyName of out) {
    const ts = keyName.slice("record:".length, "record:".length + 10); // YYYY-MM-DD
    if (since && ts < since) continue;
    if (until && ts > until) continue;
    const rec = await getJSON(env, keyName);
    if (!rec) continue;
    if (type && rec.type !== type) continue;
    if (status && rec.status !== status) continue;
    picked.push(rec);
    if (picked.length >= 200) break;
  }
  return picked;
}

/* ------------------------------------------------------- owner copilot -- */

function copilotTools() {
  return [
    { type: "web_search_20260209", name: "web_search", max_uses: 3 },
    {
      name: "query_records",
      description: "Query the business records extracted from WhatsApp chats. Returns newest-first JSON.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["", ...RECORD_TYPES, "invoice"] },
          since: { type: "string", description: "ISO date YYYY-MM-DD lower bound, '' for none" },
          until: { type: "string", description: "ISO date YYYY-MM-DD upper bound, '' for none" },
          status: { type: "string", enum: ["", "open", "confirmed", "paid", "done", "cancelled", "unpaid"] },
        },
        required: ["type", "since", "until", "status"],
        additionalProperties: false,
      },
    },
    {
      name: "add_record",
      description: "Add a business record the owner dictates (an expense, task, note, manual order...).",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: RECORD_TYPES },
          summary: { type: "string" },
          amount: { type: "number" },
          currency: { type: "string" },
          due: { type: "string" },
          customer_name: { type: "string" },
        },
        required: ["type", "summary", "amount", "currency", "due", "customer_name"],
        additionalProperties: false,
      },
    },
    {
      name: "update_record_status",
      description: "Set a record's status (e.g. mark an order paid/done, cancel it). Use the record id from query_records.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["open", "confirmed", "paid", "done", "cancelled"] },
        },
        required: ["id", "status"],
        additionalProperties: false,
      },
    },
    {
      name: "create_invoice",
      description: "Create an invoice and get its shareable print-ready link. Use for 'make an invoice for X'.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          customer_name: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                quantity: { type: "number" },
                unit_price: { type: "number" },
              },
              required: ["description", "quantity", "unit_price"],
              additionalProperties: false,
            },
          },
          currency: { type: "string" },
          tax_percent: { type: "number" },
          notes: { type: "string" },
        },
        required: ["customer_name", "items", "currency", "tax_percent", "notes"],
        additionalProperties: false,
      },
    },
    {
      name: "set_mode",
      description: "Switch how Hunch treats customer chats: 'silent' (observe & extract only) or 'assist' (also auto-reply to customers).",
      strict: true,
      input_schema: {
        type: "object",
        properties: { mode: { type: "string", enum: ["silent", "assist"] } },
        required: ["mode"],
        additionalProperties: false,
      },
    },
  ];
}

async function runCopilotTool(env, origin, name, input) {
  if (name === "query_records") {
    if (input.type === "invoice") {
      const invoices = await listInvoices(env);
      const filtered = input.status === "unpaid" ? invoices.filter((i) => i.status !== "paid") : invoices;
      return JSON.stringify(filtered.slice(0, 100));
    }
    const status = input.status === "unpaid" ? "" : input.status;
    let rows = await listRecords(env, { ...input, status });
    if (input.status === "unpaid") rows = rows.filter((r) => r.status !== "paid" && r.status !== "cancelled" && r.status !== "done");
    return JSON.stringify(rows.map(({ customer, ...r }) => ({ ...r, customer: customer?.name || customer?.waId || "" })));
  }
  if (name === "add_record") {
    const rec = {
      id: newId(), at: new Date().toISOString(),
      type: input.type, summary: String(input.summary).slice(0, 300),
      amount: Number.isFinite(input.amount) ? input.amount : 0,
      currency: input.currency || env.CURRENCY || "USD",
      due: input.due || "", status: "open",
      customer: { waId: "", name: input.customer_name || "" }, source: "owner",
    };
    await putJSON(env, recordKey(rec), rec);
    return `Saved record ${rec.id}.`;
  }
  if (name === "update_record_status") {
    let cursor, found = null;
    do {
      const page = await env.HUNCH_KV.list({ prefix: "record:", cursor, limit: 1000 });
      found = page.keys.find((k) => k.name.endsWith(`:${input.id}`))?.name ?? null;
      cursor = page.list_complete || found ? undefined : page.cursor;
    } while (cursor);
    if (!found) return `No record with id ${input.id}.`;
    const rec = await getJSON(env, found);
    rec.status = input.status;
    await putJSON(env, found, rec);
    return `Record ${input.id} → ${input.status}.`;
  }
  if (name === "create_invoice") {
    const inv = await createInvoice(env, input);
    return JSON.stringify({ number: inv.number, total: inv.total, currency: inv.currency, link: invoiceLink(env, origin, inv.number) });
  }
  if (name === "set_mode") {
    await env.HUNCH_KV.put("settings:mode", input.mode);
    return `Mode set to ${input.mode}.`;
  }
  return "Unknown tool.";
}

async function ownerCopilot(env, from, text, origin) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const historyKey = `chat:owner:${from}`;
  const history = (await getJSON(env, historyKey)) ?? [];
  const mode = (await env.HUNCH_KV.get("settings:mode")) || "silent";
  const today = new Date().toISOString().slice(0, 10);

  const system = [{
    type: "text",
    cache_control: { type: "ephemeral" },
    text: `You are Hunch, the AI teammate inside the WhatsApp Business inbox of "${env.BUSINESS_NAME || "this business"}". You talk to the OWNER. Today is ${today}. Default currency: ${env.CURRENCY || "USD"}.

Everything customers write to this number is automatically extracted into records (orders, payments, appointments, leads, tasks, expenses, notes) which you query with query_records. The owner never has to take data out of WhatsApp: you produce lists, totals, summaries and reports right here in chat, create print-ready invoices with create_invoice, and share the live dashboard link when a visual overview is the better answer.

Dashboard link: ${dashboardLink(env, origin)}
Current customer-chat mode: ${mode} (silent = observe & extract only; assist = also auto-reply to customers; change with set_mode when asked).

Rules:
- ${LANGUAGE_GUIDE.replaceAll("\n", "\n  ")}
- Amounts you read back must follow the record's currency; INR uses Indian grouping (lakh/crore style).
- This is WhatsApp: short, scannable answers. Formatting: *bold*, _italic_, "- " lists; never Markdown headers or tables; paste links bare.
- For report-style asks ("sales this week", "who hasn't paid", "what's due tomorrow"): query the records, then give totals first, then the list. State the date range you used.
- For invoices: pull the details from records when they exist (query first), confirm nothing — just build it sensibly — and send back the number, total and link.
- Amounts: use the record's currency; be precise, never invent numbers. If records are empty, say so plainly.
- Use web_search only for genuinely external questions (market prices, suppliers, news).`,
  }];

  const tools = copilotTools();
  let messages = [...history, { role: "user", content: text }];
  let response;

  for (let turn = 0; turn < 10; turn++) {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system, tools, messages,
    });

    if (response.stop_reason === "refusal") return "I can't help with that one.";
    if (response.stop_reason === "pause_turn") {
      messages = [...messages, { role: "assistant", content: response.content }];
      continue;
    }
    if (response.stop_reason === "tool_use") {
      const results = [];
      for (const block of response.content) {
        if (block.type !== "tool_use" || block.name === "web_search") continue;
        let out;
        try {
          out = await runCopilotTool(env, origin, block.name, block.input ?? {});
        } catch (err) {
          results.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${err.message}`, is_error: true });
          continue;
        }
        results.push({ type: "tool_result", tool_use_id: block.id, content: out });
      }
      if (!results.length) break;
      messages = [...messages, { role: "assistant", content: response.content }, { role: "user", content: results }];
      continue;
    }
    break; // end_turn / max_tokens
  }

  const reply = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim()
    || "Hmm, I came up empty — try rephrasing that?";

  const newHistory = [...history, { role: "user", content: text }, { role: "assistant", content: reply }].slice(-24);
  await putJSON(env, historyKey, newHistory);
  return reply;
}

/* --------------------------------------------- customer assist (opt-in) -- */

async function assistCustomer(env, waId, name, chat, text) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const profile = (await env.HUNCH_KV.get("settings:profile")) || "";
  const history = chat.messages.slice(-12, -1).map((m) => ({
    role: m.role === "customer" ? "user" : "assistant",
    content: m.text,
  }));

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 1500,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{
      type: "text",
      cache_control: { type: "ephemeral" },
      text: `You are the WhatsApp assistant of "${env.BUSINESS_NAME || "this business"}". Reply to the customer briefly, warmly and helpfully, mirroring exactly how they write. WhatsApp formatting only (*bold*, _italic_). Confirm orders and appointments clearly; if you don't know something (price, stock), say the team will confirm shortly — never invent facts.

${LANGUAGE_GUIDE}${profile ? `\n\nBusiness info:\n${profile}` : ""}`,
    }],
    messages: [...history, { role: "user", content: text }],
  });
  if (response.stop_reason === "refusal") return "";
  return response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

/* ------------------------------------------------------------ invoices -- */

async function createInvoice(env, input) {
  const seq = parseInt((await env.HUNCH_KV.get("settings:invoiceseq")) || "0", 10) + 1;
  await env.HUNCH_KV.put("settings:invoiceseq", String(seq));
  const number = `INV-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`;
  const items = (input.items ?? []).slice(0, 30).map((i) => ({
    description: String(i.description).slice(0, 200),
    quantity: Number.isFinite(i.quantity) ? i.quantity : 1,
    unit_price: Number.isFinite(i.unit_price) ? i.unit_price : 0,
  }));
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const tax = subtotal * ((Number.isFinite(input.tax_percent) ? input.tax_percent : 0) / 100);
  const inv = {
    number,
    at: new Date().toISOString(),
    customer_name: input.customer_name || "",
    items,
    currency: input.currency || env.CURRENCY || "USD",
    tax_percent: Number.isFinite(input.tax_percent) ? input.tax_percent : 0,
    subtotal, tax, total: subtotal + tax,
    notes: (input.notes || "").slice(0, 500),
    status: "unpaid",
  };
  await putJSON(env, `invoice:${number}`, inv);
  return inv;
}

async function listInvoices(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.HUNCH_KV.list({ prefix: "invoice:", cursor, limit: 1000 });
    for (const k of page.keys) out.push(k.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  out.sort().reverse();
  const invoices = [];
  for (const k of out.slice(0, 100)) {
    const inv = await getJSON(env, k);
    if (inv) invoices.push(inv);
  }
  invoices.sort((a, b) => (a.at < b.at ? 1 : -1));
  return invoices;
}

function dashboardLink(env, origin) {
  return `${origin}/dashboard?key=${env.ADMIN_SECRET}`;
}
function invoiceLink(env, origin, number) {
  return `${origin}/invoice/${number}?key=${env.ADMIN_SECRET}`;
}

/* ----------------------------------------------------------- HTML pages -- */

function pageGuard(url, env) {
  if (!env.ADMIN_SECRET || url.searchParams.get("key") !== env.ADMIN_SECRET) {
    return new Response("Unauthorized — append ?key=<ADMIN_SECRET>", { status: 401 });
  }
  return null;
}

export function renderDashboard({ business, currency, records, invoices, days }) {
  const now = new Date();
  const monthStart = now.toISOString().slice(0, 8) + "01";
  const inMonth = (r) => r.at.slice(0, 10) >= monthStart;
  const active = (s) => s !== "cancelled";

  const orders = records.filter((r) => r.type === "order" && active(r.status));
  const payments = records.filter((r) => r.type === "payment" && active(r.status));
  const revenueMonth = payments.filter(inMonth).reduce((s, r) => s + r.amount, 0);
  const ordersMonth = orders.filter(inMonth).length;
  const openOrders = orders.filter((r) => r.status === "open" || r.status === "confirmed");
  const unpaidInv = invoices.filter((i) => i.status !== "paid");
  const unpaidTotal = unpaidInv.reduce((s, i) => s + i.total, 0);
  const today = now.toISOString().slice(0, 10);
  const upcoming = records.filter((r) => (r.type === "appointment" || r.due) && active(r.status) && r.status !== "done" && (r.due || r.at.slice(0, 10)) >= today);
  const openTasks = records.filter((r) => r.type === "task" && (r.status === "open" || r.status === "confirmed"));
  const leads = records.filter((r) => r.type === "lead").slice(0, 8);

  const fmt = (n) => fmtMoney(n, currency);
  const esc = escapeHtml;

  // 14-day payments bar chart (single series, brand hue, direct labels on max)
  const barMax = Math.max(...days.map((d) => d.total), 1);
  const bars = days.map((d) => {
    const h = Math.round((d.total / barMax) * 100);
    const label = d.total === barMax && d.total > 0 ? `<i>${esc(fmt(d.total))}</i>` : "";
    return `<div class="bar" title="${esc(d.date)}: ${esc(fmt(d.total))}">${label}<b style="height:${Math.max(h, 2)}%"></b><s>${esc(d.date.slice(8))}</s></div>`;
  }).join("");

  const row = (r) => `<tr><td>${esc(r.at.slice(0, 10))}</td><td><span class="tag tag--${esc(r.type)}">${esc(r.type)}</span></td><td>${esc(r.customer?.name || r.customer?.waId || "—")}</td><td>${esc(r.summary)}</td><td class="num">${r.amount ? esc(fmtMoney(r.amount, r.currency)) : "—"}</td><td>${esc(r.due || "—")}</td><td>${esc(r.status)}</td></tr>`;
  const invRow = (i) => `<tr><td>${esc(i.at.slice(0, 10))}</td><td><a href="/invoice/${encodeURIComponent(i.number)}?key=KEY" class="lnk">${esc(i.number)}</a></td><td>${esc(i.customer_name || "—")}</td><td class="num">${esc(fmtMoney(i.total, i.currency))}</td><td>${esc(i.status)}</td></tr>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(business)} — Hunch Dashboard</title><meta name="robots" content="noindex">
<style>
:root{--bg:#05070d;--panel:#0c111c;--line:rgba(232,236,244,.09);--ink:#e8ecf4;--dim:#8b96ad;--acc:#25d366;--amber:#fbbf24;--blue:#60a5fa;--purple:#a78bfa;--red:#f87171}
*{margin:0;padding:0;box-sizing:border-box}body{background:var(--bg);color:var(--ink);font:14px/1.5 "Segoe UI","Nirmala UI","Noto Sans","Noto Sans Devanagari","Noto Sans Tamil","Noto Sans Bengali",system-ui,sans-serif;padding:26px 16px 60px}
.wrap{max-width:1060px;margin:0 auto}h1{font-size:21px;display:flex;align-items:center;gap:10px}h1 i{width:11px;height:11px;border-radius:50%;background:var(--acc);box-shadow:0 0 10px var(--acc)}
.sub{color:var(--dim);font-size:13px;margin:4px 0 24px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:22px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}
.tile b{display:block;font-size:24px;font-weight:700;letter-spacing:-.02em}.tile span{color:var(--dim);font-size:12.5px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:18px}
.panel h2{font-size:14px;margin-bottom:12px;color:var(--ink)}
.chart{display:flex;gap:4px;align-items:flex-end;height:120px}
.bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;position:relative;cursor:default}
.bar b{width:100%;max-width:34px;background:var(--acc);border-radius:4px 4px 0 0;min-height:2px}
.bar s{text-decoration:none;color:var(--dim);font-size:10px;margin-top:5px}
.bar i{font-style:normal;color:var(--ink);font-size:10.5px;margin-bottom:3px}
.bar:hover b{background:#4ae084}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:var(--dim);font-weight:600;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;padding:6px 8px;border-bottom:1px solid var(--line)}
td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:none}.num{text-align:right;white-space:nowrap}
.tag{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--dim)}
.tag--order{color:var(--acc);border-color:rgba(37,211,102,.4)}.tag--payment{color:var(--blue);border-color:rgba(96,165,250,.4)}
.tag--appointment{color:var(--purple);border-color:rgba(167,139,250,.4)}.tag--task{color:var(--amber);border-color:rgba(251,191,36,.4)}
.tag--lead{color:#f0abfc;border-color:rgba(240,171,252,.4)}.tag--expense{color:var(--red);border-color:rgba(248,113,113,.4)}
.lnk{color:var(--acc)}.empty{color:var(--dim);padding:14px 8px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}@media(max-width:760px){.cols{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<h1><i></i>${esc(business)} — live from WhatsApp</h1>
<div class="sub">Everything below was extracted automatically from your WhatsApp Business chats · ${esc(now.toISOString().slice(0, 16).replace("T", " "))} UTC</div>
<div class="tiles">
<div class="tile"><b>${esc(fmt(revenueMonth))}</b><span>payments this month</span></div>
<div class="tile"><b>${ordersMonth}</b><span>orders this month</span></div>
<div class="tile"><b>${openOrders.length}</b><span>open orders</span></div>
<div class="tile"><b>${esc(fmt(unpaidTotal))}</b><span>unpaid invoices (${unpaidInv.length})</span></div>
<div class="tile"><b>${upcoming.length}</b><span>upcoming dates</span></div>
<div class="tile"><b>${openTasks.length}</b><span>open tasks</span></div>
</div>
<div class="panel"><h2>Payments — last 14 days</h2><div class="chart">${bars}</div></div>
<div class="cols">
<div class="panel"><h2>Open orders</h2><table><tr><th>Date</th><th>Customer</th><th>Order</th><th class="num">Amount</th></tr>
${openOrders.slice(0, 10).map((r) => `<tr><td>${esc(r.at.slice(0, 10))}</td><td>${esc(r.customer?.name || "—")}</td><td>${esc(r.summary)}</td><td class="num">${r.amount ? esc(fmtMoney(r.amount, r.currency)) : "—"}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">No open orders</td></tr>`}</table></div>
<div class="panel"><h2>Invoices</h2><table><tr><th>Date</th><th>No.</th><th>Customer</th><th class="num">Total</th><th>Status</th></tr>
${invoices.slice(0, 10).map(invRow).join("") || `<tr><td colspan="5" class="empty">No invoices yet — ask Hunch in WhatsApp: "make an invoice for …"</td></tr>`}</table></div>
</div>
<div class="panel"><h2>Upcoming — appointments &amp; due dates</h2><table><tr><th>When</th><th>Type</th><th>Customer</th><th>What</th></tr>
${upcoming.slice(0, 10).map((r) => `<tr><td>${esc(r.due || r.at.slice(0, 10))}</td><td><span class="tag tag--${esc(r.type)}">${esc(r.type)}</span></td><td>${esc(r.customer?.name || "—")}</td><td>${esc(r.summary)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">Nothing scheduled</td></tr>`}</table></div>
${leads.length ? `<div class="panel"><h2>Recent leads</h2><table><tr><th>Date</th><th>Who</th><th>Interest</th></tr>${leads.map((r) => `<tr><td>${esc(r.at.slice(0, 10))}</td><td>${esc(r.customer?.name || r.customer?.waId || "—")}</td><td>${esc(r.summary)}</td></tr>`).join("")}</table></div>` : ""}
<div class="panel"><h2>All recent activity</h2><table><tr><th>Date</th><th>Type</th><th>Customer</th><th>Summary</th><th class="num">Amount</th><th>Due</th><th>Status</th></tr>
${records.slice(0, 40).map(row).join("") || `<tr><td colspan="7" class="empty">No records yet — they appear here as customers write to you.</td></tr>`}</table></div>
</div></body></html>`;
}

async function dashboardPage(env, origin) {
  const [records, invoices] = await Promise.all([listRecords(env), listInvoices(env)]);
  const days = lastNDays(14).map((date) => ({
    date,
    total: records.filter((r) => r.type === "payment" && r.status !== "cancelled" && r.at.slice(0, 10) === date).reduce((s, r) => s + r.amount, 0),
  }));
  let html = renderDashboard({
    business: env.BUSINESS_NAME || "Your business",
    currency: env.CURRENCY || "USD",
    records, invoices, days,
  });
  html = html.replaceAll("?key=KEY", `?key=${encodeURIComponent(env.ADMIN_SECRET)}`);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export function renderInvoice(inv, business) {
  const esc = escapeHtml;
  const fmt = (n) => fmtMoney(n, inv.currency);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(inv.number)} — ${esc(business)}</title><meta name="robots" content="noindex">
<style>
body{font:14px/1.55 "Segoe UI","Nirmala UI","Noto Sans","Noto Sans Devanagari","Noto Sans Tamil","Noto Sans Bengali",system-ui,sans-serif;color:#15181e;background:#f3f4f7;margin:0;padding:30px 12px}
.sheet{max-width:760px;margin:0 auto;background:#fff;border-radius:10px;padding:48px 52px;box-shadow:0 10px 40px rgba(0,0,0,.08)}
.top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:38px}
.brand{font-size:22px;font-weight:700}.brand i{display:inline-block;width:10px;height:10px;border-radius:50%;background:#25d366;margin-right:8px}
.meta{text-align:right;color:#5b6472;font-size:13px}.meta b{display:block;color:#15181e;font-size:17px;margin-bottom:2px}
.bill{margin-bottom:30px;color:#5b6472;font-size:13px}.bill b{display:block;color:#15181e;font-size:15px}
table{width:100%;border-collapse:collapse;margin-bottom:26px}th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:#8a93a3;padding:8px 6px;border-bottom:2px solid #e6e9ef}
td{padding:10px 6px;border-bottom:1px solid #eef0f4}.num{text-align:right;white-space:nowrap}
.totals{margin-left:auto;width:260px;font-size:14px}.totals div{display:flex;justify-content:space-between;padding:5px 6px}
.totals .grand{border-top:2px solid #15181e;font-weight:700;font-size:16px;margin-top:4px;padding-top:9px}
.notes{color:#5b6472;font-size:13px;margin-top:26px;border-top:1px solid #eef0f4;padding-top:16px}
.badge{display:inline-block;padding:3px 12px;border-radius:999px;font-size:12px;font-weight:600;background:#fff7e6;color:#b45309;border:1px solid #fcd34d}
.badge.paid{background:#e8faee;color:#15803d;border-color:#86efac}
.print{position:fixed;top:14px;right:14px;padding:9px 18px;border-radius:999px;border:none;background:#25d366;color:#04140b;font-weight:700;cursor:pointer}
@media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0;max-width:none}.print{display:none}}
</style></head><body>
<button class="print" onclick="print()">Print / Save PDF</button>
<div class="sheet">
<div class="top">
<div class="brand"><i></i>${esc(business)}</div>
<div class="meta"><b>INVOICE</b>${esc(inv.number)}<br>${esc(inv.at.slice(0, 10))}<br><span class="badge ${inv.status === "paid" ? "paid" : ""}">${esc(inv.status.toUpperCase())}</span></div>
</div>
<div class="bill">Billed to<b>${esc(inv.customer_name || "—")}</b></div>
<table><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr>
${inv.items.map((i) => `<tr><td>${esc(i.description)}</td><td class="num">${i.quantity}</td><td class="num">${esc(fmt(i.unit_price))}</td><td class="num">${esc(fmt(i.quantity * i.unit_price))}</td></tr>`).join("")}
</table>
<div class="totals">
<div><span>Subtotal</span><span>${esc(fmt(inv.subtotal))}</span></div>
${inv.tax_percent ? `<div><span>Tax (${inv.tax_percent}%)</span><span>${esc(fmt(inv.tax))}</span></div>` : ""}
<div class="grand"><span>Total</span><span>${esc(fmt(inv.total))}</span></div>
</div>
${inv.notes ? `<div class="notes">${esc(inv.notes)}</div>` : ""}
<div class="notes">Generated by Hunch from WhatsApp · ${esc(inv.number)}</div>
</div></body></html>`;
}

async function invoicePage(env, numberWithQuery) {
  const number = numberWithQuery.split("?")[0];
  const inv = await getJSON(env, `invoice:${number}`);
  if (!inv) return new Response("Invoice not found", { status: 404 });
  return new Response(renderInvoice(inv, env.BUSINESS_NAME || "Your business"), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/* ------------------------------------------------------------ WhatsApp -- */

async function waPost(env, payload) {
  const res = await fetch(`${GRAPH}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) console.error("WhatsApp API error", res.status, await res.text());
  return res;
}

function sendText(env, to, body) {
  return waPost(env, { messaging_product: "whatsapp", to, type: "text", text: { body, preview_url: true } });
}

function markRead(env, messageId, typing = false) {
  const payload = { messaging_product: "whatsapp", status: "read", message_id: messageId };
  if (typing) payload.typing_indicator = { type: "text" };
  return waPost(env, payload).catch(() => {});
}

function chunkText(text, size) {
  if (text.length <= size) return [text];
  const chunks = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n", size);
    if (cut < size / 2) cut = rest.lastIndexOf(" ", size);
    if (cut < size / 2) cut = size;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/* ------------------------------------------------------------ waitlist -- */

async function joinWaitlist(request, env) {
  const data = await request.json().catch(() => null);
  const email = (data?.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return Response.json({ ok: false, error: "invalid_email" }, { status: 400, headers: corsHeaders() });
  }
  const country = String(data?.country ?? "").slice(0, 60);
  await putJSON(env, `waitlist:${email}`, { email, country, at: new Date().toISOString() });
  return Response.json({ ok: true }, { headers: corsHeaders() });
}

function adminGuard(request, env) {
  const auth = request.headers.get("Authorization") ?? "";
  if (!env.ADMIN_SECRET || auth !== `Bearer ${env.ADMIN_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

async function listWaitlist(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.HUNCH_KV.list({ prefix: "waitlist:", cursor });
    for (const k of page.keys) out.push(k.name.slice("waitlist:".length));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return Response.json({ count: out.length, emails: out });
}

/* --------------------------------------------------------------- utils -- */

function lastNDays(n) {
  const days = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getTime() - i * 86400000);
    days.push(x.toISOString().slice(0, 10));
  }
  return days;
}

export function fmtMoney(n, currency) {
  try {
    const locale = currency === "INR" ? "en-IN" : "en"; // en-IN groups as 1,23,456
    return new Intl.NumberFormat(locale, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency || ""} ${Math.round(n * 100) / 100}`.trim();
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

async function getJSON(env, key) {
  const raw = await env.HUNCH_KV.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function putJSON(env, key, value) {
  return env.HUNCH_KV.put(key, JSON.stringify(value));
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
