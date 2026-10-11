# SEO and visitor growth checklist

This is a practical plan for a small Sinhala caption website with no advertising budget. Search traffic is not guaranteed; results depend on content originality, page quality, competition and time.

## 1. Confirm technical SEO after deployment

1. Open the deployed site's home page and verify that it loads over HTTPS.
2. Check these URLs in a browser:
   - `/robots.txt`
   - `/sitemap.xml`
   - `/love/`, `/sad/`, `/attitude/`, `/friendship/`, `/life/`, `/funny/`, `/whatsapp-status/`
   - `/how-to-write-sinhala-captions/`
3. Confirm each category page has a unique page title, description, H1, useful text and links to related collections.
4. Test the site on a phone. Captions should be readable and the Copy button should work.
5. Review privacy, terms and billing starter pages. Replace the marked guidance with accurate business contact/policy details before taking subscriptions.

## 2. Set up Google Search Console

1. Open https://search.google.com/search-console and add the final Vercel domain as a URL-prefix property.
2. Complete the verification method Google offers.
3. Open **Sitemaps** and submit `https://YOUR-LIVE-DOMAIN/sitemap.xml`.
4. Use URL Inspection on the homepage and two category pages. Request indexing after confirming that the pages load and the content is useful.
5. After one or two weeks, review **Performance → Search results**. Compare queries, impressions, clicks, and pages. Do not judge the site on the first day.

Use your actual deployed domain in place of the example. The sitemap endpoint derives the hostname from the incoming request/Vercel environment.

## 3. Publish useful, original content

- Add 5–10 carefully proofread, original captions each week, distributed across different moods.
- Add seasonal or occasion collections when relevant, such as birthday captions, Avurudu wishes, graduation captions, wedding captions or exam motivation. Each page should answer a real query and include more than a list of near-duplicate lines.
- Improve pages that have impressions but few clicks by making the page title and description clearer.
- Link categories to each other and to the caption maker. The current category pages and guide provide a starting internal-link structure.
- Avoid copying a competitor's entire caption collection. Make wording original and add editorial value.

## 4. Share the website where its audience already is

- Share a useful caption collection to your own Facebook page, Instagram bio, WhatsApp status and relevant communities when their rules allow links.
- Prefer a helpful post with 3–5 example captions and a link to the matching collection over repeatedly posting only a promotional link.
- Make short videos such as “5 Sinhala captions for a sunset photo” and link to the relevant category in the profile or video description.
- Ask a small number of real users which caption categories they need next. Build from their feedback.
- Use the built-in share control and caption copy buttons to make sharing easy.

## 5. A realistic 30-day launch schedule

### Week 1
Verify the live site, test all links and mobile behavior, submit sitemap, and share the site with a small trusted audience.

### Week 2
Publish one useful caption-writing tip post and add original captions to categories that users request.

### Week 3
Review Search Console data. Improve titles/descriptions on pages getting impressions. Share category-specific social posts and short videos.

### Week 4
Compare which categories earn clicks and shares. Expand the strongest ones with genuinely useful text, not keyword repetition. Make a plan for the next month.

## 6. Measure a few signals

Track weekly: search impressions, search clicks, top queries, landing pages, shares/copy usage if analytics are configured, and any reported issues. Use real measurements rather than promising a fixed number of visitors or revenue.

## Notes on subscription launch

Keep payment checkout disabled until the PayHere merchant application is approved, all server-only credentials are configured, the Supabase schema is applied and sandbox recurring billing/cancellation has been tested. Do not encourage visitors to buy a plan when checkout isn't available.
