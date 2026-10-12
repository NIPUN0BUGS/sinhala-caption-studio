// One Vercel Function dispatches GuruPaper API routes so deployments remain
// within the Hobby plan's function-count limit. Route handlers live outside
// api/ so Vercel does not build each one as a separate Function.
const handlers = Object.freeze({
  "create-paper-checkout": require("../lib/gurupaper-handlers/create-paper-checkout"),
  "create-paper-order": require("../lib/gurupaper-handlers/create-paper-order"),
  "generate-paper": require("../lib/gurupaper-handlers/generate-paper"),
  "paper-config": require("../lib/gurupaper-handlers/paper-config"),
  "auth-config": require("../lib/gurupaper-handlers/auth-config"),
  "paper-order-status": require("../lib/gurupaper-handlers/paper-order-status"),
  "payhere-paper-notify": require("../lib/gurupaper-handlers/payhere-paper-notify"),
  "robots": require("../lib/gurupaper-handlers/robots"),
  "sitemap": require("../lib/gurupaper-handlers/sitemap")
});

module.exports = async function guruPaperApiRouter(req, res) {
  const rawUrl = String((req && (req.url || req.originalUrl)) || "/");
  const pathname = rawUrl.split("?", 1)[0].replace(/\/+$/, "") || "/";
  const match = pathname.match(/^\/api\/(.+)$/);
  const route = match ? match[1] : "";
  const handler = handlers[route];
  if (!handler) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.end(JSON.stringify({ error: "not_found" }));
  }
  return handler(req, res);
};
