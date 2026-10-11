# Sinhala Caption Studio 🇱🇰

A mobile-friendly Sinhala captions and status website with public caption collections, a caption-template maker, and an optional subscription foundation.

## What's included

- 102 public captions across love, sad, attitude, friendship, life, funny and WhatsApp status categories
- Responsive home page, category filters, live search, one-tap copy/share and browser-saved favourites
- Caption idea maker with Sinhala, Singlish and English templates (built-in templates, not a real AI model)
- Dark mode
- Seven dedicated, crawlable SEO landing pages:
  - `/love/`
  - `/sad/`
  - `/attitude/`
  - `/friendship/`
  - `/life/`
  - `/funny/`
  - `/whatsapp-status/`
- An informational caption-writing guide at `/how-to-write-sinhala-captions/`
- Sitemap and robots endpoints exposed at `/sitemap.xml` and `/robots.txt`
- Free, Creator Pro (Rs. 490/month) and Creator Plus (Rs. 990/month) plan UI
- Supabase account integration and server-side PayHere recurring subscription endpoints, kept disabled until configuration is complete
- Privacy, terms and billing-policy starter pages

## Develop locally

The public website is static HTML/CSS/JavaScript and can be opened directly by opening `index.html`. API routes under `api/` run as Vercel Node.js functions and require their environment variables for account/payment functions.

## Deploy to Vercel

1. Import `NIPUN0BUGS/sinhala-caption-studio` into Vercel.
2. Use Framework Preset **Other**, Root Directory `./`, Build Command empty, and Output Directory `.`.
3. Deploy. Pushes to the connected `main` branch should create new deployments.

## Subscription setup

Read [PAYMENTS_SETUP.md](./PAYMENTS_SETUP.md) before enabling payments. It covers PayHere merchant approval, Supabase auth/database setup, Vercel environment variables, callback configuration and sandbox testing.

Important: prices in the page are proposed plan values. Payment acceptance is **not live** until you have an approved PayHere merchant account, valid production credentials, a configured Supabase project, successful sandbox tests, and accurate business support/policy details. Never put PayHere secrets or the Supabase service-role key in browser code or Git.

Run [supabase/schema.sql](./supabase/schema.sql) in the Supabase SQL Editor after creating the project. Keep all server keys in Vercel environment variables. App ID/App Secret for the PayHere Subscription Manager API are needed for automated cancellation; they are separate from the payment merchant credentials.

## SEO and growth

Read [SEO_AND_GROWTH.md](./SEO_AND_GROWTH.md) for a practical launch checklist covering Google Search Console, sitemap submission, internal links, social sharing and content publishing.

Before launch, replace or review the policy-page starter text and add real business/support contact details. Favourites and theme preference are browser-local; there are no shared cloud favourites. Review caption content for originality and accuracy as the site grows.
