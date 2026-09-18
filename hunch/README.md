# Hunch — your personal AI on WhatsApp

An invite-only personal AI assistant (in the spirit of Instinct, but built
WhatsApp-first for a worldwide, non-US audience). Members text it like a
friend; it plans trips, researches live prices and schedules, drafts
messages, and remembers each user — replying in whatever language the user
writes in.

**Stack:** one Cloudflare Worker (`src/index.js`) + Workers KV +
WhatsApp Cloud API + Claude (`claude-opus-5` with live web search).
The landing page is `../hunch.html`, served by the existing static site.

> "Hunch" is a placeholder brand — search-and-replace it freely. Do **not**
> ship it under the name "Instinct": that's an existing company
> (instinct.co) and impersonating it invites legal trouble.

## How the product works

- **Invite-only.** A non-member's first message must be an invite code
  (`HUNCH-XXXXXX`). Valid code → activated, welcomed, granted 3 invites.
  No code → polite "invite only" message pointing at the waitlist.
- **Member commands:** `/invite` mints a code for a friend (decrements
  their allowance) · `/forget` (or `/reset`) wipes their conversation history.
- **Everything else** goes to Claude with: the user's stored memory + last
  40 turns of history, a live `web_search` server tool, and a `save_memory`
  tool. Replies are chunked to WhatsApp's 4096-char limit.
- **Global-first:** the system prompt mandates replying in the user's
  language, metric units, 24h time, local currency — never assuming the US.

## Setup (≈30 minutes)

### 1. WhatsApp Cloud API (Meta)

1. [developers.facebook.com](https://developers.facebook.com) → Create App →
   type **Business** → add the **WhatsApp** product.
2. Note the **Phone number ID** (API Setup page). The free test number works
   for development; for launch, register a real business number there.
3. Business Settings → System Users → create one, generate a **permanent
   token** with `whatsapp_business_messaging` + `whatsapp_business_management`.
4. App Settings → Basic → copy the **App Secret**.

### 2. Anthropic

Create an API key at [console.anthropic.com](https://console.anthropic.com).

### 3. Deploy the worker

```bash
cd hunch
npm install
npx wrangler kv namespace create HUNCH_KV   # paste id into wrangler.toml
# edit wrangler.toml: WHATSAPP_PHONE_NUMBER_ID
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put WHATSAPP_TOKEN
npx wrangler secret put WHATSAPP_APP_SECRET
npx wrangler secret put WEBHOOK_VERIFY_TOKEN   # any random string
npx wrangler secret put ADMIN_SECRET           # any random string
npx wrangler deploy
```

### 4. Point Meta at the worker

WhatsApp → Configuration → Webhook:
- Callback URL: `https://hunch-whatsapp.<your-subdomain>.workers.dev/webhook`
- Verify token: the `WEBHOOK_VERIFY_TOKEN` you set
- Subscribe to the **messages** field.

### 5. Mint your first invite codes

```bash
curl -X POST https://<worker-url>/admin/invites \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" -d '{"count": 5}'
```

Send one code to your own WhatsApp → you're member #1. From there growth is
viral: members send `/invite`.

### 6. Wire up the landing page

In `../hunch.html` set `WAITLIST_ENDPOINT` to `https://<worker-url>/waitlist`
and `WHATSAPP_NUMBER` to your bot's number. Read signups back with
`GET /admin/waitlist` (same Bearer auth).

## Notes

- The webhook ACKs Meta instantly and does the Claude work in
  `ctx.waitUntil`, so slow answers never cause webhook retries.
- Webhook payloads are HMAC-verified (`X-Hub-Signature-256`) — requests not
  signed with your App Secret are rejected.
- The Claude call opts into server-side refusal fallbacks
  (`fallbacks: "default"`), so a safety decline on the primary model
  automatically retries on a fallback model in the same request.
- Costs scale with usage; each answer is one `claude-opus-5` call (with
  prompt caching on the system prompt). Swap `MODEL` in `src/index.js` to
  `claude-sonnet-5` for a cheaper tier if needed.
- WhatsApp requires 24-hour customer-service windows: the bot only ever
  replies to inbound messages, which is always within policy. Proactive
  outbound (reminders) would need approved template messages — future work.
