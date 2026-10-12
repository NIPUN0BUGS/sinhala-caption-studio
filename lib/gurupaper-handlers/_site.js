function siteUrl(req) {
  const configured = String(process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "").trim();
  if (configured) {
    const withProtocol = /^https?:\/\//i.test(configured) ? configured : "https://" + configured;
    try { return new URL(withProtocol).origin; } catch (_) {}
  }
  const host = String((req && (req.headers["x-forwarded-host"] || req.headers.host)) || "").split(",")[0].trim();
  if (!host || /[^a-zA-Z0-9.:-]/.test(host)) return "";
  const proto = String((req && req.headers["x-forwarded-proto"]) || "https").split(",")[0].trim().toLowerCase();
  try { return new URL((proto === "http" ? "http://" : "https://") + host).origin; } catch (_) { return ""; }
}
module.exports = { siteUrl };
