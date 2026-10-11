# Payment implementation and deployment guide

This repository now includes:
- Free, Creator Pro (Rs. 490/month) and Creator Plus (Rs. 990/month) pricing UI
- Supabase email/password signup and sign-in
- Server-side PayHere Recurring API checkout hash generation
- A signed PayHere notification endpoint that verifies the MD5 signature before granting premium access
- Server-side protected premium captions
- Subscription status refresh and a self-service cancel endpoint using PayHere's Subscription Manager API
- Supabase tables with Row Level Security enabled and no browser access policies

**Payments are intentionally not active until you configure the backend and PayHere account.** Do not set live credentials until the merchant is approved and sandbox checkout has been tested.

## 1. Apply for PayHere (first external step)

1. Sign up at https://www.payhere.lk/ and verify your email.
2. Sign in and complete the merchant activation form.
3. PayHere's published application requirements say you need a valid business and a local bank account. Approval follows review by a partner bank and may take a few days. If you are unsure whether your current business setup qualifies, ask PayHere before spending money.
4. After approval, go to **Integrations** and obtain the Merchant ID. Add the production Vercel domain as a domain/app and request approval for it. PayHere creates a Merchant Secret for each approved integrating domain; keep it private.
5. For cancellation from the member dashboard, create a PayHere API key under **Settings → API Keys**, grant the documented **Automated Charging API** permission, whitelist your production domain, and save the App ID and App Secret. These are separate from the Merchant ID/Secret.

References:
- Application process: https://support.payhere.lk/application-process
- Recurring API and callback signature: https://support.payhere.lk/api-&-mobile-sdk/recurring-api
- Subscription Manager API / cancellation: https://support.payhere.lk/api-&-mobile-sdk/subscription-manager-api

## 2. Create a Supabase project

1. Create a project at https://supabase.com/dashboard.
2. In **SQL Editor**, open the file supabase/schema.sql from this repository, paste it and run it once.
3. In **Project Settings → API** (or API Keys), copy the Project URL and public anon/publishable key.
4. Copy the server-side service_role key. It is privileged and must only be stored as a Vercel environment variable; never put it in HTML or share it.
5. In **Authentication → URL Configuration**, set the Site URL to the production Vercel URL (example https://your-project.vercel.app) and add the same URL to Redirect URLs. If email confirmation is enabled, users must confirm the email before signing in.

The database tables use RLS with no direct client policies. All subscription/payment reads and writes are made by the Vercel API routes after validating the user's Supabase session.

## 3. Add Vercel environment variables

In Vercel, open the project → **Settings → Environment Variables** and add these for **Production**:

| Variable | Value |
| --- | --- |
| APP_URL | Exact production origin, e.g. https://your-project.vercel.app (no trailing slash) |
| SUPABASE_URL | Supabase Project URL |
| SUPABASE_ANON_KEY | Supabase public anon/publishable key |
| SUPABASE_SERVICE_ROLE_KEY | Supabase server-only service_role key |
| PAYHERE_MODE | sandbox while testing; change to live only after approval and testing |
| PAYHERE_MERCHANT_ID | Merchant ID from PayHere |
| PAYHERE_MERCHANT_SECRET | Merchant Secret approved for the exact APP_URL domain |

For self-service cancellation, also add these server-only variables:

| Variable | Value |
| --- | --- |
| PAYHERE_APP_ID | App ID from PayHere Settings → API Keys |
| PAYHERE_APP_SECRET | App Secret from that PayHere API key |

After changing environment variables, redeploy the Vercel project. Never prefix secrets with NEXT_PUBLIC_ or place them in index.html.

## 4. PayHere domain and callback URLs

Once the Vercel URL is stable:
- Ask PayHere to approve that domain in **Integrations** and use the domain-specific Merchant Secret it provides.
- Use this notification URL: https://YOUR-PRODUCTION-DOMAIN/api/payhere-notify
- The checkout return and cancel URLs are built from APP_URL.
- The PayHere API-key app used for cancellation must also whitelist the production domain.

The site uses PayHere's recurring form POST endpoint; the server creates the hash. The browser never receives the Merchant Secret. A return URL is not treated as proof of payment; only a valid signed notification updates the database.

## 5. Test before going live

1. Start with PAYHERE_MODE=sandbox and sandbox credentials/details provided by PayHere.
2. Visit https://YOUR-PRODUCTION-DOMAIN/api/config. It should return authReady: true; after all checkout secrets are set it should also return paymentsReady: true.
3. Create an account, verify your email if prompted, then sign in.
4. Select a plan, complete the billing information and recurring billing consent, then test a sandbox checkout.
5. Return to the site and click **Refresh status**. Premium should unlock only after the signed notification is received and verified.
6. Test failed/cancelled checkout, member sign-out/sign-in, and cancellation before enabling live billing.
7. Review your pricing, terms, privacy notice, cancellation/refund policy, contact details and customer support process before requesting/using live payment acceptance.

If the callback returns a 400/500, review Vercel function logs for api/payhere-notify. Never log or paste card details, Supabase service role keys, PayHere secrets, or passwords into issues/chat.

## Current limitations

- Monthly prices are set on the server as LKR 490 (Pro) and LKR 990 (Plus); browser form values cannot set the payment amount.
- Premium content is served from a protected API route rather than embedded in public HTML.
- The current member model supports one current PayHere subscription per account.
- Plan cancellation uses the PayHere Subscription Manager API and therefore requires the separate PayHere App ID/Secret.
- This is a starter integration. Test thoroughly in PayHere sandbox and confirm the provider's current account/application requirements before taking real money.
