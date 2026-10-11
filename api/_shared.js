const crypto = require("node:crypto");
const PLANS = Object.freeze({
  pro: { id: "pro", name: "Creator Pro", amount: 490, currency: "LKR", recurrence: "1 Month", duration: "Forever" },
  plus: { id: "plus", name: "Creator Plus", amount: 990, currency: "LKR", recurrence: "1 Month", duration: "Forever" }
});
function json(res, status, payload) {
  res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(payload));
}
function text(res, status, value) {
  res.statusCode = status; res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store"); res.end(value);
}
function getBearer(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || ""); return m ? m[1] : "";
}
function envSupabase() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const anon = process.env.SUPABASE_ANON_KEY || "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !anon || !service) throw new Error("SUPABASE_NOT_CONFIGURED");
  return { url, anon, service };
}
async function authenticate(req) {
  const token = getBearer(req); if (!token) return null;
  const cfg = envSupabase();
  const r = await fetch(cfg.url + "/auth/v1/user", { headers: { apikey: cfg.anon, Authorization: "Bearer " + token } });
  if (!r.ok) return null;
  const user = await r.json(); if (!user || !user.id || !user.email) return null;
  return { user, cfg };
}
async function db(cfg, path, method = "GET", body, prefer) {
  const headers = { apikey: cfg.service, Authorization: "Bearer " + cfg.service, "Content-Type": "application/json", Accept: "application/json" };
  if (prefer) headers.Prefer = prefer;
  const init = { method, headers }; if (body !== undefined && body !== null) init.body = JSON.stringify(body);
  const r = await fetch(cfg.url + "/rest/v1/" + path, init); const raw = await r.text();
  let parsed = null; try { parsed = raw ? JSON.parse(raw) : null; } catch (_) {}
  if (!r.ok) { const err = new Error("SUPABASE_REQUEST_FAILED"); err.status = r.status; err.detail = parsed; throw err; }
  return parsed;
}
function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : typeof req.body === "string" ? req.body : "";
  if (!raw) return {};
  const type = String(req.headers["content-type"] || "");
  if (type.includes("application/json")) { try { return JSON.parse(raw); } catch (_) { return {}; } }
  return Object.fromEntries(new URLSearchParams(raw));
}
function appUrl() {
  try { const u = new URL(process.env.APP_URL || ""); if (u.protocol !== "https:" && u.hostname !== "localhost") return null; return u.origin; }
  catch (_) { return null; }
}
function originAllowed(req) {
  const origin = req.headers.origin; const expected = appUrl(); if (!origin) return true; if (!expected) return false;
  try { return new URL(origin).origin === expected; } catch (_) { return false; }
}
function md5Hex(value) { return crypto.createHash("md5").update(String(value), "utf8").digest("hex").toUpperCase(); }
function secureEqual(a, b) {
  const aa = Buffer.from(String(a || "").toUpperCase()), bb = Buffer.from(String(b || "").toUpperCase());
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function paymentHash(merchantId, orderId, amount, currency, secret) {
  return md5Hex(String(merchantId) + String(orderId) + Number(amount).toFixed(2) + String(currency) + md5Hex(secret));
}
function verifyNotification(body, merchantId, secret) {
  if (String(body.merchant_id || "") !== String(merchantId)) return false;
  const local = md5Hex(String(body.merchant_id || "") + String(body.order_id || "") +
    String(body.payhere_amount || "") + String(body.payhere_currency || "") +
    String(body.status_code || "") + md5Hex(secret));
  return secureEqual(local, body.md5sig);
}
function isConfiguredForCheckout() {
  return Boolean(process.env.PAYHERE_MERCHANT_ID && process.env.PAYHERE_MERCHANT_SECRET &&
    appUrl() && ["sandbox", "live"].includes(process.env.PAYHERE_MODE));
}
function payhereAction() {
  return process.env.PAYHERE_MODE === "live" ? "https://www.payhere.lk/pay/checkout" : "https://sandbox.payhere.lk/pay/checkout";
}
function nextBillingDate(dateString) {
  if (dateString && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const d = new Date(dateString + "T00:00:00.000Z"); if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date(Date.now() + 31 * 86400000).toISOString();
}
function cleanString(v, max = 140) { return String(v || "").trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max); }
async function getUserSubscription(cfg, userId) {
  const rows = await db(cfg, "subscriptions?select=plan_id,status,amount,currency,payhere_subscription_id,current_period_end,latest_payment_id,updated_at&user_id=eq." +
    encodeURIComponent(userId) + "&limit=1");
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
module.exports = { PLANS, json, text, getBearer, envSupabase, authenticate, db, readBody, appUrl, originAllowed,
  md5Hex, secureEqual, paymentHash, verifyNotification, isConfiguredForCheckout, payhereAction, nextBillingDate, cleanString, getUserSubscription };

module.exports.default = function handler(req, res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Not found");
};
