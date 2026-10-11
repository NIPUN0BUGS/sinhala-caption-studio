const crypto = require("node:crypto");

const PLANS = Object.freeze({
  pro: { id: "pro", name: "Creator Pro", amount: 490, currency: "LKR", recurrence: "1 Month", duration: "Forever" },
  plus: { id: "plus", name: "Creator Plus", amount: 990, currency: "LKR", recurrence: "1 Month", duration: "Forever" }
});
let payHereTokenCache = { token: "", expiresAt: 0, pending: null };

function json(res, status, payload) {
  res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0"); res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}
function text(res, status, value) {
  res.statusCode = status; res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0"); res.setHeader("X-Content-Type-Options", "nosniff"); res.end(value);
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
    String(body.status_code ?? "") + md5Hex(secret));
  return secureEqual(local, body.md5sig);
}
function payhereBase() {
  return process.env.PAYHERE_MODE === "live" ? "https://www.payhere.lk" : "https://sandbox.payhere.lk";
}
function isConfiguredForCheckout() {
  // The App ID/Secret are required to independently verify received payments
  // through PayHere's API, not only to cancel a subscription.
  return Boolean(process.env.PAYHERE_MERCHANT_ID && process.env.PAYHERE_MERCHANT_SECRET &&
    process.env.PAYHERE_APP_ID && process.env.PAYHERE_APP_SECRET &&
    appUrl() && ["sandbox", "live"].includes(process.env.PAYHERE_MODE));
}
function payhereAction() {
  return process.env.PAYHERE_MODE === "live" ? "https://www.payhere.lk/pay/checkout" : "https://sandbox.payhere.lk/pay/checkout";
}
async function payhereAccessToken() {
  const appId = process.env.PAYHERE_APP_ID || "", appSecret = process.env.PAYHERE_APP_SECRET || "";
  if (!appId || !appSecret) throw new Error("PAYHERE_API_NOT_CONFIGURED");
  if (payHereTokenCache.token && payHereTokenCache.expiresAt > Date.now() + 30000) return payHereTokenCache.token;
  if (payHereTokenCache.pending) return payHereTokenCache.pending;
  payHereTokenCache.pending = (async () => {
    const response = await fetch(payhereBase() + "/merchant/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(appId + ":" + appSecret).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString()
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) throw new Error("PAYHERE_API_AUTH_FAILED");
    payHereTokenCache.token = String(data.access_token);
    payHereTokenCache.expiresAt = Date.now() + Math.max(60, Number(data.expires_in) || 600) * 1000;
    return payHereTokenCache.token;
  })();
  try { return await payHereTokenCache.pending; }
  finally { payHereTokenCache.pending = null; }
}
async function payhereGet(path) {
  const token = await payhereAccessToken();
  const response = await fetch(payhereBase() + path, {
    method: "GET", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || Number(data.status) !== 1) throw new Error("PAYHERE_API_LOOKUP_FAILED");
  return data;
}
async function verifyPayHereSubscriptionPayment({ subscriptionId, paymentId, orderId, amount, currency }) {
  if (!/^\d+$/.test(String(subscriptionId || "")) || !/^\d+$/.test(String(paymentId || ""))) return false;
  const data = await payhereGet("/merchant/v1/subscription/" + encodeURIComponent(String(subscriptionId)) + "/payments");
  const rows = Array.isArray(data.data) ? data.data : [];
  return rows.some(payment =>
    String(payment.payment_id) === String(paymentId) &&
    String(payment.order_id || "") === String(orderId) &&
    String(payment.currency || "") === String(currency) &&
    Math.abs(Number(payment.amount) - Number(amount)) < 0.005 &&
    String(payment.status || "").toUpperCase() === "RECEIVED"
  );
}
async function getPayHereSubscription(subscriptionId) {
  if (!/^\d+$/.test(String(subscriptionId || ""))) return null;
  const data = await payhereGet("/merchant/v1/subscription");
  const rows = Array.isArray(data.data) ? data.data : [];
  return rows.find(sub => String(sub.subscription_id) === String(subscriptionId)) || null;
}
async function cancelPayHereSubscription(subscriptionId) {
  if (!/^\d+$/.test(String(subscriptionId || ""))) throw new Error("INVALID_PAYHERE_SUBSCRIPTION_ID");
  const token = await payhereAccessToken();
  const response = await fetch(payhereBase() + "/merchant/v1/subscription/cancel", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ subscription_id: String(subscriptionId) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || Number(data.status) !== 1) throw new Error("PAYHERE_SUBSCRIPTION_CANCEL_FAILED");
  return true;
}
function nextBillingDate(dateString, previousEnd) {
  const previousMs = previousEnd ? Date.parse(previousEnd) : NaN;
  const baseMs = Number.isFinite(previousMs) && previousMs > Date.now() ? previousMs : Date.now();
  if (dateString && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const candidate = new Date(dateString + "T23:59:59.999Z");
    const limit = baseMs + 45 * 24 * 60 * 60 * 1000;
    if (!Number.isNaN(candidate.getTime()) && candidate.getTime() > baseMs && candidate.getTime() <= limit)
      return candidate.toISOString();
  }
  const d = new Date(baseMs); d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
}
function cleanString(v, max = 140) { return String(v || "").trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max); }
async function getUserSubscription(cfg, userId) {
  const rows = await db(cfg, "subscriptions?select=plan_id,status,amount,currency,payhere_subscription_id,current_period_end,latest_payment_id,updated_at&user_id=eq." +
    encodeURIComponent(userId) + "&limit=1");
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
module.exports = {
  PLANS, json, text, getBearer, envSupabase, authenticate, db, readBody, appUrl, originAllowed,
  md5Hex, secureEqual, paymentHash, verifyNotification, isConfiguredForCheckout, payhereAction,
  payhereBase, payhereAccessToken, verifyPayHereSubscriptionPayment, getPayHereSubscription, cancelPayHereSubscription,
  nextBillingDate, cleanString, getUserSubscription
};

module.exports.default = function handler(req, res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Not found");
};
