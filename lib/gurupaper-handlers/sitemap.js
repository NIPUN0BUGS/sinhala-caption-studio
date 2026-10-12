const { siteUrl } = require("./_site");
const paths = ["/", "/privacy/", "/terms/"];
module.exports = async function sitemapHandler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.statusCode = 405;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Method not allowed");
  }
  const base = siteUrl(req);
  if (!base) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Set APP_URL or the production site URL in Vercel to generate the sitemap.");
  }
  const urls = paths.map((path) => {
    const priority = path === "/" ? "1.0" : "0.4";
    const changefreq = path === "/" ? "weekly" : "yearly";
    return "  <url><loc>" + base + path + "</loc><changefreq>" + changefreq + "</changefreq><priority>" + priority + "</priority></url>";
  }).join("\n");
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  return res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "\n</urlset>");
};
