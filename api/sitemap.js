const { json, methodNotAllowed, siteUrl } = require("../lib/server");

const paths = [
  "/", "/love/", "/sad/", "/attitude/", "/friendship/", "/life/", "/funny/", "/whatsapp-status/",
  "/privacy/", "/terms/", "/billing/"
];

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const base = siteUrl(req);
  if (!base) return res.status(503).send("Set SITE_URL in Vercel to generate the sitemap.");
  const urls = paths.map((path) => "  <url><loc>" + base + path + "</loc><changefreq>" + (path === "/" ? "weekly" : "monthly") + "</changefreq><priority>" + (path === "/" ? "1.0" : "0.7") + "</priority></url>").join("\n");
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "\n</urlset>");
};
