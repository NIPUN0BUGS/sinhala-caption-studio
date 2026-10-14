# GuruPaper 🇱🇰

GuruPaper is a Sinhala-first question-paper studio for Sri Lankan teachers. This branch contains the GuruPaper app and its backend only.

## What is included

- A browser-based paper builder with question types, marks, preview, local draft saving, and print/export support.
- Google sign-in backed by Supabase Auth (no SMS fee for login), with SMS OTP retained as an optional fallback for existing phone accounts.
- A lesson-upload flow for PDF, PNG, and JPEG files.
- A one-time Rs. 100 paper-order flow designed for server-verified PayHere payment.
- Server-side lesson-grounded paper generation through Gemini Flash (free quota may be available) after successful payment verification; OpenAI remains an optional fallback.
- Private Supabase Storage and a \`paper_orders\` table for order and generation state.
- Sinhala-friendly typography using Noto Sans Sinhala and Abhaya Libre.
- A Teacher Circle section with a WhatsApp invitation link that pre-fills a message. No group link is required to invite individual teachers.

## Teacher workflow animation

The landing page explains take a photo → upload lesson notes → generate and review a paper with a lightweight animated SVG instead of a large video/GIF download.

## Deploying on Vercel Hobby

The public API paths remain separate, for example \`/api/create-paper-order\` and \`/api/payhere-paper-notify\`, but a single catch-all entry point at \`api/[...path].js\` dispatches those paths to their handler modules in \`lib/gurupaper-handlers/\`. Vercel therefore builds one Serverless Function rather than one function per endpoint, keeping the deployment under the Hobby limit.

The \`vercel.json\` rewrites continue to expose \`/sitemap.xml\` and \`/robots.txt\`.

## Free beta mode (no payment required)

The teacher paper builder currently has a separate free-beta route so you can test generation before setting up paid checkout.

- Google/Supabase sign-in is still required, but this mode does not need PayHere credentials, the paid order database table, private upload storage, or `APP_URL`.
- It sends a PDF/image (maximum 2.5 MB) from the browser to `/api/free-generate-paper`, where it is processed through the Gemini API Free Tier model `gemini-3.1-flash-lite`. The original source file is not intentionally written to GuruPaper's database or private storage. The generated paper draft can be saved in the browser editor.
- Add a key from [Google AI Studio](https://aistudio.google.com/app/apikey) as the server-side Vercel environment variable `GEMINI_API_KEY`. Never expose this key in browser code or commit it to Git.
- Google's free-tier terms may allow submitted content to be used to improve Google products. Do not upload student personal data, confidential school records, or other sensitive material. Review generated questions and answers before use.
- Free-tier quota/rate limits apply. Paid checkout stays locked with `GURUPAPER_ENABLE_CHECKOUT=false`; do not enable paid checkout until the merchant is approved and all sandbox checkout, callback, storage, and generation tests pass.

## Setup before enabling payments

1. Connect this branch to the dedicated Vercel project for GuruPaper. Set the project's production branch to \`feature/teacher-paper-studio-mvp\` unless you intentionally move the GuruPaper-only code to another branch.
2. Create a Supabase project, enable Phone Auth/SMS as described in [`PAYMENTS_GURUPAPER_SETUP.md`](./PAYMENTS_GURUPAPER_SETUP.md), and run [\`supabase/gurupaper-paper-orders.sql\`](./supabase/gurupaper-paper-orders.sql). Create the private storage bucket named \`guru-paper-uploads\` (or set \`SUPABASE_STORAGE_BUCKET\` to your bucket name).
3. Add the server-side environment variables from [\`.env.example\`](./.env.example) in Vercel. Never expose the Supabase service-role key, PayHere merchant secret, Gemini key, or OpenAI key to browser code.
4. Read [\`PAYMENTS_GURUPAPER_SETUP.md\`](./PAYMENTS_GURUPAPER_SETUP.md). Keep \`GURUPAPER_ENABLE_CHECKOUT=false\` until the database, private storage, PayHere sandbox credentials, OpenAI key and \`APP_URL\` have been checked. Test the full sandbox callback and generation flow before enabling live payments.
5. Configure Google OAuth in Supabase and allow `https://gurupaper.vercel.app/**` as an Auth redirect URL. Add your signed-in Google user's UUID to `public.gurupaper_admins` to grant yourself `/admin/` access. The Google OAuth setup steps are in `PAYMENTS_GURUPAPER_SETUP.md`.
6. Replace placeholder business/support details in the Privacy Policy and Terms before public launch. These pages are starting points, not legal advice.

**Important:** The current source is not proof that live checkout or AI generation is operational. They stay disabled until the required services and environment variables are correctly configured and tested. Review generated papers for factual accuracy, curriculum alignment and suitability before using them with students.

## Local checks

There is no build step for the static HTML. API modules use Node.js built-ins and the platform-provided \`fetch\`. You can syntax-check JavaScript with \`node --check\` and test routing with a mocked request/response locally.


## Security hardening

- Google sign-in uses Supabase Auth PKCE authorization codes. The app exchanges a short-lived code using a browser-local verifier instead of accepting access tokens from the URL fragment.
- Server API rate limits are stored in Supabase and apply across serverless instances. Only HMACs of user and client-IP identifiers are stored; the rate-limit table and function are restricted to the service role.
- To reproduce rate-limit setup in another environment, run [`supabase/gurupaper-rate-limits.sql`](./supabase/gurupaper-rate-limits.sql) after the base GuruPaper schema. Keep the service-role key server-only.
