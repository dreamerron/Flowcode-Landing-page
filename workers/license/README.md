# Connecting payments (Paddle → license keys)

The app already validates offline license keys; this worker mints them when
Paddle takes a payment. One-time setup, ~30 minutes:

## 0. THE SIGNING KEY (do this first)
The worker signs with `business-docs/license-signing-key.pem` from the app
repo — gitignored, so it exists ONLY where you backed it up.
- Have it → step 1.
- Lost it → in the app repo run `node scripts/license-admin.mjs init --force`?
  No — init refuses to overwrite; delete the old entry first ONLY if truly
  lost. It patches the new PUBLIC key into src/lib/license.ts; commit, tag
  v1.0.1 so builds ship the new key. Old builds can't activate new keys.
  BACK THE NEW PEM UP (password manager) before anything else.

## 1. Paddle (paddle.com → sign up as a seller)
- Catalog → Product "ForkScape Pro" → Price: $144/year (or your call).
- Checkout settings → default success URL:
  `https://forkscape.com/thanks?txn={transaction_id}`
- Developer Tools → Notifications → add destination:
  `https://license.forkscape.com/paddle/webhook`, event `transaction.completed`.
  Copy the webhook secret.

## 2. This worker (Cloudflare dashboard, same Git flow as try.forkscape.com)
- Workers → Create → import this repo, root directory `workers/license`.
- Storage & Databases → KV → create `forkscape-licenses`; bind as `LICENSES`
  (paste the namespace id into wrangler.toml, or bind via dashboard).
- Settings → Domains → add `license.forkscape.com`.
- Settings → Variables → secrets:
    LICENSE_SIGNING_KEY_PEM  = full contents of the .pem
    PADDLE_WEBHOOK_SECRET    = from step 1
    PADDLE_API_KEY           = (optional; lets the worker look up buyer email)
  Vars: PLAN_BY_PRICE = {"<your pri_… id>":"pro"}
- Verify: `curl https://license.forkscape.com/health` → {"ok":true}

## 3. Point "Get Pro" at Paddle
In `pricing.html`, replace the mailto link with your Paddle checkout link
(Paddle → Checkout → Payment Links → the $144/yr price). Push = deployed.

## 4. Test end-to-end (Paddle sandbox first)
Sandbox checkout → thanks page shows a key → paste into the app
(Settings → Plan) → Pro activates. `node test-compat.mjs` proves key
compatibility locally any time.

Renewals: Paddle re-bills yearly and fires transaction.completed again → a
fresh key is minted; the receipt links the thanks page. (Automatic in-app
renewal is a later feature — the app is offline by design.)
