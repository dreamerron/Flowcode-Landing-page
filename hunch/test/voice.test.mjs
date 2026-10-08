// End-to-end check of the voice-note path with every external service mocked.
import assert from "node:assert/strict";
import crypto from "node:crypto";

const sent = [];        // WhatsApp messages the worker sent
const claudeCalls = []; // request bodies sent to Anthropic
const aiCalls = [];     // Workers AI inputs
const audioBytes = new Uint8Array(70000).map((_, i) => (i * 37 + 11) % 256); // > 0x8000 to hit chunking

globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

  if (url.startsWith("https://graph.facebook.com/v21.0/MEDIA_OK")) {
    assert.equal(init.headers.Authorization, "Bearer wa-token");
    return json({ url: "https://lookaside.fbsbx.com/media/abc", mime_type: "audio/ogg; codecs=opus", file_size: audioBytes.length });
  }
  if (url.startsWith("https://graph.facebook.com/v21.0/MEDIA_BAD")) return json({ error: "nope" }, 404);
  if (url === "https://lookaside.fbsbx.com/media/abc") {
    assert.equal(init.headers.Authorization, "Bearer wa-token");
    return new Response(audioBytes);
  }
  if (url.startsWith("https://graph.facebook.com/v21.0/PHONE_ID/messages")) {
    const body = JSON.parse(init.body);
    if (body.type === "text") sent.push(body);
    return json({ messages: [{ id: "wamid.x" }] });
  }
  if (url.startsWith("https://api.anthropic.com/v1/messages")) {
    const body = JSON.parse(init.body);
    claudeCalls.push(body);
    const isExtract = body.tools?.some((t) => t.name === "record_business_data");
    const content = isExtract
      ? [{ type: "tool_use", id: "tu_1", name: "record_business_data", input: { records: [
          { type: "order", summary: "2 kg kaju katli", amount: 2400, currency: "INR", due: "2026-10-09", status: "open", language: "Hinglish" },
        ] } }]
      : [{ type: "text", text: "Is hafte ₹18,500 baaki hai." }];
    return json({
      id: "msg_1", type: "message", role: "assistant", model: body.model, content,
      stop_reason: isExtract ? "tool_use" : "end_turn", stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    });
  }
  throw new Error("unexpected fetch " + url);
};

const kv = new Map();
const env = {
  HUNCH_KV: {
    get: async (k) => kv.get(k) ?? null,
    put: async (k, v) => void kv.set(k, v),
    delete: async (k) => void kv.delete(k),
    list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
  },
  AI: { run: async (model, input) => { aiCalls.push({ model, input }); return { text: aiCalls.length === 1 ? "bhaiya kal tak do kilo kaju katli chahiye" : "is hafte ka udhaar kitna hai" }; } },
  ANTHROPIC_API_KEY: "sk-test", WHATSAPP_TOKEN: "wa-token", WHATSAPP_APP_SECRET: "app-secret",
  WHATSAPP_PHONE_NUMBER_ID: "PHONE_ID", OWNER_NUMBERS: "919800000001", BUSINESS_NAME: "Mithai Ghar",
  CURRENCY: "INR", ADMIN_SECRET: "admin",
};

const { default: worker, toBase64 } = await import(new URL("../src/index.js", import.meta.url));

async function deliver(message, name = "Rohit") {
  const raw = JSON.stringify({ entry: [{ changes: [{ value: { contacts: [{ profile: { name } }], messages: [message] } }] }] });
  const sig = "sha256=" + crypto.createHmac("sha256", "app-secret").update(raw).digest("hex");
  const pending = [];
  const res = await worker.fetch(
    new Request("https://hunch.example/webhook", { method: "POST", body: raw, headers: { "X-Hub-Signature-256": sig } }),
    env, { waitUntil: (p) => pending.push(p) });
  assert.equal(res.status, 200);
  await Promise.all(pending);
}

// 1. Base64 helper matches Node's encoder across the chunk boundary.
assert.equal(toBase64(audioBytes), Buffer.from(audioBytes).toString("base64"));

// 2. Customer voice order → transcribed, extracted, owner pinged, chat logged.
await deliver({ from: "919811111111", id: "m1", type: "audio", audio: { id: "MEDIA_OK", voice: true } });
assert.equal(aiCalls[0].model, "@cf/openai/whisper-large-v3-turbo");
assert.equal(aiCalls[0].input.audio, Buffer.from(audioBytes).toString("base64"));
assert.equal(aiCalls[0].input.vad_filter, true);
assert.ok(!("language" in aiCalls[0].input), "language unset → auto-detect");
assert.match(JSON.stringify(claudeCalls[0].messages), /\[voice note\] bhaiya kal tak do kilo kaju katli chahiye/);
const chat = JSON.parse(kv.get("chat:919811111111"));
assert.match(chat.messages.at(-1).text, /^\[voice note\] bhaiya/);
const ping = sent.find((m) => m.to === "919800000001");
assert.match(ping.text.body, /New from \*Rohit \(voice note\)\*/);
assert.match(ping.text.body, /₹2,400/);
assert.equal(sent.filter((m) => m.to === "919811111111").length, 0, "silent mode: customer gets no reply");

// 3. Owner voice question → copilot answers, prefixed with what was heard.
sent.length = 0;
await deliver({ from: "919800000001", id: "m2", type: "audio", audio: { id: "MEDIA_OK", voice: true } }, "Owner");
assert.equal(sent.length, 1);
assert.match(sent[0].text.body, /^🎙️ Heard: "is hafte ka udhaar kitna hai"\n\nIs hafte ₹18,500 baaki hai\./);

// 4. Failed download → owner asked to resend; customer failure only logged.
sent.length = 0;
await deliver({ from: "919800000001", id: "m3", type: "audio", audio: { id: "MEDIA_BAD" } }, "Owner");
assert.match(sent[0].text.body, /couldn't make out that voice note/);
sent.length = 0;
await deliver({ from: "919822222222", id: "m4", type: "audio", audio: { id: "MEDIA_BAD" } }, "Priya");
assert.equal(sent.length, 0);
assert.match(JSON.parse(kv.get("chat:919822222222")).messages.at(-1).text, /could not transcribe/);

// 5. Missing AI binding is a handled failure, not a crash.
const savedAI = env.AI; delete env.AI; sent.length = 0;
await deliver({ from: "919800000001", id: "m5", type: "audio", audio: { id: "MEDIA_OK" } }, "Owner");
assert.match(sent[0].text.body, /couldn't make out/);
env.AI = savedAI;

// 6. Typed text still works unchanged.
sent.length = 0;
await deliver({ from: "919800000001", id: "m6", type: "text", text: { body: "aaj ki bikri?" } }, "Owner");
assert.equal(sent[0].text.body, "Is hafte ₹18,500 baaki hai.");

console.log("ALL VOICE TESTS PASSED");
