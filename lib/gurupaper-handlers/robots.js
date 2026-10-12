const { siteUrl } = require("./_site");
module.exports = async function robotsHandler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.statusCode = 405;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Method not allowed");
  }
  const base = siteUrl(req);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  return res.end("User-agent: *\nAllow: /\nDisallow: /api/\n" + (base ? "Sitemap: " + base + "/sitemap.xml\n" : ""));
};
