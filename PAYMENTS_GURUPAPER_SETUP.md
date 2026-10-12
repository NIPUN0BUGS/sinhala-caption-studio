# GuruPaper: Rs.100 per-paper payment and generation flow

This is a backend starter. It is intentionally **not live** until every service is configured, PayHere approves the merchant/domain, the database and private bucket exist, and sandbox tests pass.

## What this implements

1. Teacher selects one lesson PDF, PNG or JPG/JPEG file (maximum 15 MB).
2. Vercel creates a random order and a short-lived signed upload URL. Source uploads go into a private Supabase Storage bucket.
3. Server creates a fixed Rs.100 LKR PayHere Checkout form. The price comes from the server; the browser cannot set it.
4. PayHere posts to /api/payhere-paper-notify. The server checks the provider's documented MD5 notification signature, merchant ID, order, amount and currency before changing an order from pending_payment to paid.
5. Only the /api/generate-paper server route may call the AI provider, and it refuses to run until the stored order status is paid. A browser redirect or a client-side success message does not unlock generation.
6. After successful generation, the AI provider's temporary uploaded PDF is deleted and the original lesson file is deleted from Supabase Storage. The generated question/answer JSON is stored privately in paper_orders.
7. If generation fails after verified payment, the order returns to paid so the customer can retry without paying again.

The free/manual paper editor remains a separate tool. It does not generate questions from uploaded lessons. The per-paper fee applies to the lesson-to-question AI generation flow only.

## 1. Create Supabase resources

1. Create a Supabase project at https://supabase.com/dashboard.
2. Open SQL Editor, paste/run supabase/gurupaper-paper-orders.sql.
3. In Project Settings → API (or API Keys), copy the Project URL, the public anon/publishable key, and the service_role key. Add both keys to Vercel: `SUPABASE_ANON_KEY` is safe for browser authentication, while `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be placed in HTML or shared.
4. The SQL creates a private bucket named guru-paper-uploads, restricted to PDF/PNG/JPEG and 15 MB. No public read or anonymous storage policies are created.

## 2. Configure PayHere (sandbox first)

1. Sign up/activate at https://www.payhere.lk/ and confirm that your business category and personal bank account are eligible with PayHere.
2. In Integrations, create/approve an entry for the exact GuruPaper domain. Copy its Merchant ID and domain-specific Merchant Secret.
3. Set PAYHERE_MODE to sandbox initially. Obtain/use PayHere sandbox credentials and confirm the sandbox merchant setup with PayHere Support.
4. GuruPaper sends this notification URL: https://YOUR-GURUPAPER-DOMAIN/api/payhere-paper-notify
5. Do not switch PAYHERE_MODE to live until PayHere merchant/domain approval and sandbox tests are complete. Never paste a Merchant Secret into chat or client code.

Official references:
- Checkout API / hash / payment notification validation: https://support.payhere.lk/api-&-mobile-sdk/checkout-api
- PayHere application process and business-proof requirements: https://support.payhere.lk/application-process
- PayHere LITE payment limits and fees: https://support.payhere.lk/limits-and-fees

## 3. Configure Vercel environment variables

In Vercel → project → Settings → Environment Variables, add these for the correct preview or production environment:

| Variable | Purpose |
| --- | --- |
| APP_URL | https://gurupaper.vercel.app (or your stable HTTPS domain, no path/trailing slash); must match the origin teachers visit |
| SUPABASE_URL | Supabase project URL |
| SUPABASE_ANON_KEY | Public anon/publishable key for browser phone OTP authentication |
| SUPABASE_SERVICE_ROLE_KEY | Supabase server-only service role key |
| SUPABASE_STORAGE_BUCKET | Optional; defaults to guru-paper-uploads |
| PAYHERE_MODE | sandbox while testing; live only after approval |
| PAYHERE_MERCHANT_ID | PayHere merchant ID |
| PAYHERE_MERCHANT_SECRET | Merchant Secret for the exact domain |
| GEMINI_API_KEY | Recommended: server-side Gemini API key. Free-tier access may be available under quota; free-tier data may be used to improve Google products. Do not upload sensitive student/private records. |
| GEMINI_MODEL | Optional; defaults to `gemini-3.8-flash` |
| OPENAI_API_KEY | Optional OpenAI fallback; can incur usage charges |
| GURUPAPER_ENABLE_CHECKOUT | Keep `false` or omitted until credentials and services are configured and you are ready to test. Set to `true` while deliberately running sandbox tests; leave `PAYHERE_MODE=sandbox` during those tests. Only switch to `live` after sandbox checkout, callback verification, AI output and PayHere merchant/domain approval are confirmed. |
| OPENAI_MODEL | Optional; defaults to gpt-4.1-mini |

After changing environment variables, redeploy. Do not commit real credentials or put any secret in index.html. Do not use an unrelated project URL as APP_URL for GuruPaper. Use https://gurupaper.vercel.app as the production origin, or the exact stable HTTPS domain you configure. The configured hostname must be the one teachers visit; otherwise same-origin checks keep the flow disabled.

## 4. Configuration status and activation gate

Open /api/paper-config on the GuruPaper deployment. It should report databaseReady, privateStorageReady, payhereCredentialsConfigured, aiCredentialConfigured, domainConfigured, and readyToAcceptPayment as true.

If any check is false, the UI disables the payment flow. The `GURUPAPER_ENABLE_CHECKOUT` switch is an explicit operator gate. Leave it false/omitted until you are ready to test. Set it to true for sandbox testing while `PAYHERE_MODE=sandbox`; after the end-to-end tests pass and PayHere approves your merchant/domain, deliberately switch `PAYHERE_MODE=live` to accept real payments. The readiness endpoint verifies credential presence and table/bucket reachability but cannot validate a successful charge or AI quota.


## 5. Mobile registration and OTP authentication

1. Add SUPABASE_URL and SUPABASE_ANON_KEY (the public anon/publishable key) to Vercel. Do not place SUPABASE_SERVICE_ROLE_KEY in browser code.
2. In Supabase Authentication → Sign In / Providers, enable Phone and configure a supported SMS provider such as Twilio, Vonage or MessageBird. Real SMS is not guaranteed to be free; provider rates and delivery limits apply. Configure rate limits and CAPTCHA before public launch.
3. Test a Sri Lankan number in E.164 format (for example +94771234567). GuruPaper also normalizes a local 077... number to +94....
4. Register with a mobile number, enter the SMS OTP, then sign in with the same verified number. Wrong or expired OTPs do not create a usable session. Order creation, checkout, generation, order status and admin data all verify the Supabase session on the server.
5. The SQL creates public.gurupaper_admins. To make your own verified account an admin, copy its UUID from Supabase Authentication → Users and insert that UUID into the allowlist as described in the Admin dashboard section below. Do not grant admin based only on a phone number submitted by the browser.

## 6. Free-tier LLM and RAG choice

GuruPaper prefers Google Gemini Flash (GEMINI_API_KEY, default model gemini-3.8-flash) for PDF/photo understanding and structured question-paper generation. A Gemini free tier may be available subject to project/model quota and rate limits. Google notes free-tier content may be used to improve its products; avoid uploading student personal records, confidential documents or other sensitive information. Keep the API key server-side.

RAG/vector search is intentionally not enabled in the first version: each generation request contains one source lesson, so direct source-grounded processing is simpler and avoids extra embedding/vector-database dependencies. Add RAG if teachers later need to search across many lesson files, shared syllabuses or past papers.


## 7. Expected customer journey

- Select PDF/PNG/JPG notes and set grade, subject, medium, question count, difficulty, marks and paper title.
- Fill the customer details PayHere requires.
- Press the Rs.100 button. The source file uploads to private storage and the browser redirects to PayHere Checkout.
- PayHere returns the browser to GuruPaper, but the return URL does not unlock anything.
- The interface polls order status using a random access token held only in the current browser tab's sessionStorage.
- When the signed server notification confirms the Rs.100 LKR payment, the Generate full paper button appears.
- Generated paper loads into the existing editor, where the teacher can review and print/save as PDF or download the Word-compatible export.

## Admin dashboard

Visit `/admin/` and sign in using the phone number already registered in Supabase Auth. If the dashboard returns 403, the account is not in the administrator allowlist. To bootstrap the first admin, run a query like `insert into public.gurupaper_admins (user_id) values ('YOUR-VERIFIED-SUPABASE-AUTH-UUID') on conflict do nothing;` using the verified user UUID found in Authentication → Users. Do not grant admin access based only on a submitted phone number.

## Privacy and limitations

- The lesson file is sent to the configured Gemini API (preferred) or optional OpenAI API only after payment has been verified.
- The upload is private. The source is deleted from Supabase after successful generation. On generation errors, the source stays private so a paid order can retry; abandoned and failed records/files need a future scheduled cleanup job.
- For Gemini, the uploaded PDF/image is passed to the model request. For the optional OpenAI PDF fallback, its temporary file is deleted after the generation call.
- Generated answers are suggested marking guidance and must be teacher-reviewed for correctness and syllabus fit.
- Orders are tied to a confirmed Supabase Auth user ID as well as a random 256-bit order access token. Users must sign in to the same account to check status or generate a paper. Losing the order token may still require support to recover access.
- No live merchant or AI credentials are provided by this code; no payments or AI generation run until you configure them. Live acceptance requires current PayHere approval and sandbox tests.
- Add actual Terms, Privacy, Refund/Return policy and business contact details before requesting PayHere activation. Do not use placeholder identity or contact information.
