# GuruPaper 🇱🇰

GuruPaper is a Sinhala-first question-paper studio for Sri Lankan teachers. This branch contains the GuruPaper app and its backend only.

## What is included

- A browser-based paper builder with question types, marks, preview, local draft saving, and print/export support.
- Email registration and sign-in with six-digit OTP verification, backed by Supabase Auth.
- A lesson-upload flow for PDF, PNG, and JPEG files.
- A one-time Rs. 100 paper-order flow designed for server-verified PayHere payment.
- Server-side paper generation through OpenAI after successful payment verification.
- Private Supabase Storage and a \`paper_orders\` table for order and generation state.
- Sinhala-friendly typography using Noto Sans Sinhala and Abhaya Libre.
- A Teacher Circle section with a copyable invitation message. An official community-group link has not been configured yet.

## Deploying on Vercel Hobby

The public API paths remain separate, for example \`/api/create-paper-order\` and \`/api/payhere-paper-notify\`, but a single catch-all entry point at \`api/[...path].js\` dispatches those paths to their handler modules in \`lib/gurupaper-handlers/\`. Vercel therefore builds one Serverless Function rather than one function per endpoint, keeping the deployment under the Hobby limit.

The \`vercel.json\` rewrites continue to expose \`/sitemap.xml\` and \`/robots.txt\`.

## Setup before enabling payments

1. Connect this branch to the dedicated Vercel project for GuruPaper. Set the project's production branch to \`feature/teacher-paper-studio-mvp\` unless you intentionally move the GuruPaper-only code to another branch.
2. Create a Supabase project, configure email OTP as described in [`PAYMENTS_GURUPAPER_SETUP.md`](./PAYMENTS_GURUPAPER_SETUP.md), and run [\`supabase/gurupaper-paper-orders.sql\`](./supabase/gurupaper-paper-orders.sql). Create the private storage bucket named \`guru-paper-uploads\` (or set \`SUPABASE_STORAGE_BUCKET\` to your bucket name).
3. Add the server-side environment variables from [\`.env.example\`](./.env.example) in Vercel. Never expose the Supabase service-role key, PayHere merchant secret, or OpenAI key to browser code.
4. Read [\`PAYMENTS_GURUPAPER_SETUP.md\`](./PAYMENTS_GURUPAPER_SETUP.md). Keep \`GURUPAPER_ENABLE_CHECKOUT=false\` until the database, private storage, PayHere sandbox credentials, OpenAI key and \`APP_URL\` have been checked. Test the full sandbox callback and generation flow before enabling live payments.
5. Replace placeholder business/support details in the Privacy Policy and Terms before public launch. These pages are starting points, not legal advice.

**Important:** The current source is not proof that live checkout or AI generation is operational. They stay disabled until the required services and environment variables are correctly configured and tested. Review generated papers for factual accuracy, curriculum alignment and suitability before using them with students.

## Local checks

There is no build step for the static HTML. API modules use Node.js built-ins and the platform-provided \`fetch\`. You can syntax-check JavaScript with \`node --check\` and test routing with a mocked request/response locally.
