# Payment implementation and deployment guide

This repository now includes:
- Free, Creator Pro (Rs. 490/month) and Creator Plus (Rs. 990/month) pricing UI
- Supabase email/password signup and sign-in
- Server-side PayHere Recurring API checkout hash generation
- A PayHere notification endpoint that verifies the documented MD5 signature and independently confirms successful payment IDs, amounts, currency and order against PayHere's authenticated Subscription Manager API before granting premium access
- Server-side protected premium captions
- Subscription status refresh and a self-service cancel endpoint using PayHere's Subscription Manager API
- Supabase tables with Row Level Security enabled and no browser access policies

**Payments are intentionally not active until you configure the backend and PayHere account.** Do not set live credentials until the merchant is approved and sandbox checkout has been tested.

## 1. Apply for PayHere (first external step)

1. Sign up at https://www.payhere.lk/ and verify your email.
2. Sign in and complete the merchant activation form.
3. PayHere's published requirements include a valid business and a local bank account. Freelance and home-based businesses may apply using the proof of business described by PayHere; approval is not automatic. Ask PayHere if your exact setup qualifies before spending money.
4. Before submitting, make sure the live site is complete and clearly shows your business name, business phone, business email, postal address, Terms, Privacy Policy and a Return/Refund Policy. Replace all draft/template language and placeholders with your real business details. PayHere says missing policies or contact details can lead to rejection.
5. After approval, go to **Integrations** and obtain the Merchant ID. Add the exact production Vercel domain as a domain/app and request approval for it. PayHere creates a Merchant Secret for each approved integrating domain; keep it private.
6. Create a PayHere API key under **Settings → API Keys**, whitelist the production domain and grant **Automated Charging API** permission. Save the App ID and App Secret separately from the Merchant ID/Secret. The app credentials are required for server-to-server verification of successful payments and self-service cancellation.

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
| PAYHERE_APP_ID | App ID from PayHere Settings → API Keys (required for receipt verification) |
| PAYHERE_APP_SECRET | App Secret from that PayHere API key (required for receipt verification) |

After changing environment variables, redeploy the Vercel project. Never prefix secrets with NEXT_PUBLIC_ or place them in index.html.

## 4. PayHere domain and callback URLs

Once the Vercel URL is stable:
- Ask PayHere to approve that domain in **Integrations** and use the domain-specific Merchant Secret it provides.
- Use this notification URL: https://YOUR-PRODUCTION-DOMAIN/api/payhere-notify
- The checkout return and cancel URLs are built from APP_URL.
- The PayHere API-key app used for receipt verification/cancellation must whitelist the production domain.

The site uses PayHere's recurring form POST endpoint; the server creates the hash. The browser never receives the Merchant Secret or App Secret. A return URL is not treated as proof of payment: the server requires the valid callback checksum and independently confirms the payment record through PayHere's authenticated API.

## 5. Test before going live

1. Start with PAYHERE_MODE=sandbox and sandbox credentials/details provided by PayHere.
2. Visit https://YOUR-PRODUCTION-DOMAIN/api/config. It should return authReady: true; after all checkout secrets are set it should also return paymentsReady: true.
3. Create an account, verify your email if prompted, then sign in.
4. Select a plan, complete the billing information and explicitly accept the recurring monthly charge, then test a sandbox checkout.
5. Return to the site and click **Refresh status**. Premium should unlock only after the callback checksum passes and PayHere's authenticated API confirms the payment ID, amount, currency and order.
6. Test failed/cancelled checkout, member sign-out/sign-in, renewal callbacks, duplicate/replayed callbacks, and cancellation before enabling live billing.
7. Review your pricing, terms, privacy notice, return/refund policy, contact details and customer support process before requesting/using live payment acceptance.

If the callback returns a 400/500, review Vercel function logs for api/payhere-notify. Never log or paste card details, Supabase service role keys, PayHere secrets, or passwords into issues/chat.

## Current limitations

- Monthly prices are set on the server as LKR 490 (Pro) and LKR 990 (Plus); browser form values cannot set the payment amount.
- Premium content is served from a protected API route rather than embedded in public HTML.
- The current member model supports one current PayHere subscription per account.
- Successful callbacks are independently confirmed through PayHere's Subscription Manager API. The same App ID/Secret are used for self-service cancellation; keep them server-side only.
- This is a starter integration. Test thoroughly in PayHere sandbox and confirm the provider's current account/application requirements before taking real money.
