const { methodNotAllowed, siteUrl } = require("../lib/server");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const base = siteUrl(req);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  return res.status(200).send("User-agent: *\nAllow: /\nDisallow: /api/\n" + (base ? "Sitemap: " + base + "/sitemap.xml\n" : ""));
};
