/**
 * Hunch — a personal AI assistant that lives in WhatsApp.
 * Invite-only. Worldwide. Text it like a friend; it gets things done.
 *
 * Cloudflare Worker: WhatsApp Cloud API webhook → Claude → WhatsApp reply.
 *
 * Routes:
 *   GET  /webhook          Meta webhook verification handshake
 *   POST /webhook          WhatsApp message events (HMAC-verified)
 *   POST /waitlist         landing-page waitlist signups {email, country?}
 *   POST /admin/invites    mint invite codes {count} (Bearer ADMIN_SECRET)
 *   GET  /admin/waitlist   list waitlist signups     (Bearer ADMIN_SECRET)
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5";
const GRAPH = "https://graph.facebook.com/v21.0";
const HISTORY_LIMIT = 40; // stored turns per user (user+assistant entries)
const WA_CHUNK = 3800; // WhatsApp caps text messages at 4096 chars

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/webhook" && request.method === "GET") {
      return verifyWebhook(url, env);
    }
    if (url.pathname === "/webhook" && request.method === "POST") {
      return receiveWebhook(request, env, ctx);
    }
    if (url.pathname === "/waitlist" && request.method === "POST") {
      return joinWaitlist(request, env);
    }
    if (url.pathname === "/waitlist" && request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (url.pathname === "/admin/invites" && request.method === "POST") {
      return adminGuard(request, env) ?? mintInvites(request, env);
    }
    if (url.pathname === "/admin/waitlist" && request.method === "GET") {
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
  ctx.waitUntil(handleEvents(body, env));
  return new Response("OK", { status: 200 });
}

async function validSignature(raw, header, secret) {
  if (!header.startsWith("sha256=") || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expected = header.slice("sha256=".length).toLowerCase();
  if (hex.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function handleEvents(body, env) {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const message of value.messages ?? []) {
        const profileName = value.contacts?.[0]?.profile?.name ?? "";
        try {
          await handleMessage(message, profileName, env);
        } catch (err) {
          console.error("handleMessage failed", err);
          await sendText(
            env,
            message.from,
            "Sorry — something went wrong on my side. Please try that again in a moment.",
          ).catch(() => {});
        }
      }
    }
  }
}

/* ----------------------------------------------------- message handling -- */

async function handleMessage(message, profileName, env) {
  const from = message.from; // wa_id, e.g. "4915123456789"
  if (message.type !== "text") {
    await markRead(env, message.id);
    await sendText(env, from, "For now I only understand text messages — voice, photos and documents are coming soon. Type what you need!");
    return;
  }
  const text = (message.text?.body ?? "").trim();
  if (!text) return;

  await markRead(env, message.id, true);

  const userKey = `user:${from}`;
  let user = await getJSON(env, userKey);

  // Not yet a member: the only accepted message is an invite code.
  if (!user?.activated) {
    const code = text.toUpperCase().replace(/\s+/g, "");
    const inviteKey = `invite:${code}`;
    const invite = await getJSON(env, inviteKey);
    if (invite && !invite.usedBy) {
      invite.usedBy = from;
      invite.usedAt = new Date().toISOString();
      await putJSON(env, inviteKey, invite);
      user = {
        activated: true,
        name: profileName,
        invitesLeft: parseInt(env.INVITES_PER_USER || "3", 10),
        activatedAt: new Date().toISOString(),
        invitedBy: invite.createdBy ?? "admin",
      };
      await putJSON(env, userKey, user);
      await sendText(
        env,
        from,
        "*Welcome to Hunch!* 🎉\n\nI'm your personal assistant. Text me like a friend, in *any language* — I'll answer in yours.\n\nI can plan trips, compare prices, research anything, draft messages, do the math, and remember what matters to you.\n\nYou have *" +
          user.invitesLeft +
          " invites* for friends — send */invite* any time to get a code.\n\nSo — what can I take off your plate?",
      );
      return;
    }
    await sendText(
      env,
      from,
      "Hunch is *invite-only* for now. 🔒\n\nIf you have an invite code, just send it here.\nNo code yet? Join the waitlist and we'll text you when a spot opens.",
    );
    return;
  }

  // Member commands
  if (/^\/invite\b/i.test(text)) {
    if ((user.invitesLeft ?? 0) <= 0) {
      await sendText(env, from, "You've used all your invites — you'll earn more as Hunch grows. 🌱");
      return;
    }
    const code = await createInvite(env, from);
    user.invitesLeft -= 1;
    await putJSON(env, userKey, user);
    await sendText(
      env,
      from,
      `Here's an invite for a friend 🎟️\n\nCode: *${code}*\n\nThey just message me and send the code as their first message. ${user.invitesLeft} invite${user.invitesLeft === 1 ? "" : "s"} left.`,
    );
    return;
  }
  if (/^\/(reset|forget)\b/i.test(text)) {
    await env.HUNCH_KV.delete(`history:${from}`);
    await sendText(env, from, "Done — I've cleared our conversation history. Fresh start. ✨");
    return;
  }

  const reply = await askClaude(env, from, user, text);
  for (const chunk of chunkText(reply, WA_CHUNK)) {
    await sendText(env, from, chunk);
  }
}

/* -------------------------------------------------------------- Claude -- */

function systemPrompt(user, memory) {
  return (
    `You are Hunch, a personal AI assistant that lives in WhatsApp. You are warm, sharp, and genuinely useful — like a hyper-competent friend, never like a call center.

Core rules:
- ALWAYS reply in the language the user writes in. Match their tone and formality.
- Your users are all over the world (mostly outside the US). Default to metric units, 24-hour time, DD/MM dates, and the user's local currency and conventions once you know their country. Never assume the US.
- This is WhatsApp: keep replies short and scannable. Use WhatsApp formatting only — *bold*, _italic_, ~strikethrough~, \`\`\`monospace\`\`\`, and "- " lists. Never use Markdown headers, tables, or [link](url) syntax; paste URLs bare.
- Get things DONE. Use web search for anything live: prices, schedules, availability, news, places, weather. Give a concrete recommendation, not a list of options with no opinion.
- You cannot yet place bookings or payments yourself — when a task ends in a purchase, do all the legwork (find the exact option, price, and direct link) and hand over the final step.
- Use the save_memory tool whenever you learn something durable about the user (name, city, preferences, family, work, dietary needs, ongoing plans). Don't announce that you saved it.
- If a message is ambiguous, make the most reasonable assumption and say what you assumed, rather than answering with a question when you could act.` +
    (user?.name ? `\n\nThe user's WhatsApp profile name is "${user.name}".` : "") +
    (memory ? `\n\nWhat you remember about this user:\n${memory}` : "")
  );
}

async function askClaude(env, from, user, text) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const historyKey = `history:${from}`;
  const memoryKey = `memory:${from}`;
  const [history, memory] = await Promise.all([
    getJSON(env, historyKey).then((h) => h ?? []),
    env.HUNCH_KV.get(memoryKey),
  ]);

  const tools = [
    { type: "web_search_20260209", name: "web_search", max_uses: 5 },
    {
      name: "save_memory",
      description:
        "Save a short durable fact about the user (preferences, city, family, work, ongoing plans) so future conversations remember it.",
      input_schema: {
        type: "object",
        properties: {
          fact: { type: "string", description: "One concise fact, in English, e.g. 'Lives in Jakarta' or 'Vegetarian'." },
        },
        required: ["fact"],
        additionalProperties: false,
      },
      strict: true,
    },
  ];

  let messages = [...history, { role: "user", content: text }];
  let response;

  // Agentic loop: continue through server-tool pauses and save_memory calls.
  for (let turn = 0; turn < 8; turn++) {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000, // WhatsApp replies are short; hard cap is 4096 chars/message
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: systemPrompt(user, memory), cache_control: { type: "ephemeral" } }],
      tools,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return "I can't help with that one — but I'm happy to help with almost anything else.";
    }
    if (response.stop_reason === "pause_turn") {
      messages = [...messages, { role: "assistant", content: response.content }];
      continue;
    }
    if (response.stop_reason === "tool_use") {
      const results = [];
      for (const block of response.content) {
        if (block.type === "tool_use" && block.name === "save_memory") {
          const fact = typeof block.input?.fact === "string" ? block.input.fact.slice(0, 300) : "";
          if (fact) {
            const updated = memoryAppend(memory ?? "", fact);
            await env.HUNCH_KV.put(memoryKey, updated);
          }
          results.push({ type: "tool_result", tool_use_id: block.id, content: "Saved." });
        }
      }
      if (results.length === 0) break; // unknown client tool — bail out safely
      messages = [
        ...messages,
        { role: "assistant", content: response.content },
        { role: "user", content: results },
      ];
      continue;
    }
    break; // end_turn or max_tokens
  }

  const reply =
    response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim() || "Hmm, I came up empty — try rephrasing that?";

  // Persist plain-text history (tool/thinking blocks are per-turn scaffolding).
  const newHistory = [
    ...history,
    { role: "user", content: text },
    { role: "assistant", content: reply },
  ].slice(-HISTORY_LIMIT);
  await putJSON(env, historyKey, newHistory);

  return reply;
}

function memoryAppend(memory, fact) {
  const lines = memory.split("\n").filter(Boolean);
  if (!lines.includes(`- ${fact}`)) lines.push(`- ${fact}`);
  return lines.slice(-50).join("\n"); // keep memory bounded
}

/* ------------------------------------------------------------ WhatsApp -- */

async function waPost(env, payload) {
  const res = await fetch(`${GRAPH}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error("WhatsApp API error", res.status, await res.text());
  }
  return res;
}

function sendText(env, to, body) {
  return waPost(env, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body, preview_url: true },
  });
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

/* ----------------------------------------------------- invites & admin -- */

async function createInvite(env, createdBy) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no lookalikes
  let code;
  do {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    code = "HUNCH-" + [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  } while (await env.HUNCH_KV.get(`invite:${code}`));
  await putJSON(env, `invite:${code}`, { createdBy, createdAt: new Date().toISOString() });
  return code;
}

function adminGuard(request, env) {
  const auth = request.headers.get("Authorization") ?? "";
  if (!env.ADMIN_SECRET || auth !== `Bearer ${env.ADMIN_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

async function mintInvites(request, env) {
  const { count = 1 } = await request.json().catch(() => ({}));
  const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 100);
  const codes = [];
  for (let i = 0; i < n; i++) codes.push(await createInvite(env, "admin"));
  return Response.json({ codes });
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

async function getJSON(env, key) {
  const raw = await env.HUNCH_KV.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
