const crypto = require("crypto");

function env(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}
function supabaseUrl() {
  return env("SUPABASE_URL").replace(/\/+$/, "");
}
function supabaseAnonKey() {
  return env("SUPABASE_ANON_KEY", env("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
}
function supabaseServiceKey() {
  return env("SUPABASE_SERVICE_ROLE_KEY");
}
function authReady() {
  return Boolean(supabaseUrl() && supabaseAnonKey() && supabaseServiceKey());
}
function siteUrl(req) {
  const configured = env("SITE_URL", env("VERCEL_PROJECT_PRODUCTION_URL", env("VERCEL_URL")));
  if (configured) {
    const withProtocol = /^https?:\/\//i.test(configured) ? configured : "https://" + configured;
    try { return new URL(withProtocol).origin; } catch (_) {}
  }
  const host = String((req && (req.headers["x-forwarded-host"] || req.headers.host)) || "").split(",")[0].trim();
  if (!host || /[^a-zA-Z0-9.:-]/.test(host)) return "";
  const proto = String((req && req.headers["x-forwarded-proto"]) || "https").split(",")[0].trim();
  try { return new URL((proto === "http" ? "http://" : "https://") + host).origin; } catch (_) { return ""; }
}
function payhereBase() {
  return env("PAYHERE_ENV", "sandbox").toLowerCase() === "live"
    ? "https://www.payhere.lk"
    : "https://sandbox.payhere.lk";
}
function paymentReady() {
  return Boolean(
    authReady() &&
    env("SITE_URL") &&
    env("PAYHERE_MERCHANT_ID") &&
    env("PAYHERE_MERCHANT_SECRET") &&
    env("PAYHERE_APP_ID") &&
    env("PAYHERE_APP_SECRET")
  );
}
function json(res, status, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  return res.status(status).json(payload);
}
function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  return json(res, 405, { error: "Method not allowed." });
}
function bearer(req) {
  const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ""));
  return m ? m[1].trim() : "";
}
async function authenticate(req) {
  const token = bearer(req);
  if (!token) return { error: "Please sign in to continue.", status: 401 };
  if (!supabaseUrl() || !supabaseAnonKey()) return { error: "Authentication is not configured.", status: 503 };
  let response;
  try {
    response = await fetch(supabaseUrl() + "/auth/v1/user", {
      headers: { apikey: supabaseAnonKey(), Authorization: "Bearer " + token }
    });
  } catch (_) {
    return { error: "Authentication service is temporarily unavailable.", status: 503 };
  }
  if (!response.ok) return { error: "Your session is invalid or expired. Please sign in again.", status: 401 };
  const user = await response.json().catch(() => null);
  if (!user || !user.id || !user.email) return { error: "A verified account email is required.", status: 401 };
  return { user: { id: user.id, email: user.email, metadata: user.user_metadata || {} }, token };
}
async function dbRequest(path, options = {}) {
  if (!supabaseUrl() || !supabaseServiceKey()) {
    const error = new Error("The subscription database is not configured.");
    error.status = 503;
    throw error;
  }
  const headers = {
    apikey: supabaseServiceKey(),
    Authorization: "Bearer " + supabaseServiceKey(),
    "Content-Type": "application/json",
    Prefer: options.prefer || "return=representation"
  };
  let response;
  try {
    response = await fetch(supabaseUrl() + "/rest/v1/" + path, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch (_) {
    const error = new Error("The subscription database is temporarily unavailable.");
    error.status = 503;
    throw error;
  }
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = raw; }
  if (!response.ok) {
    const error = new Error("Subscription database request failed.");
    error.status = response.status >= 500 ? 503 : 400;
    error.details = data;
    throw error;
  }
  return data;
}
async function getSubscription(userId) {
  const rows = await dbRequest(
    "subscriptions?select=user_id,plan_id,status,current_period_end,payhere_subscription_id,payhere_order_id,payhere_payment_id,updated_at&user_id=eq." +
    encodeURIComponent(userId) + "&limit=1"
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}
async function getOrder(orderId) {
  const rows = await dbRequest(
    "subscription_orders?select=order_id,user_id,plan_id,amount,currency,status,payhere_payment_id,payhere_subscription_id&order_id=eq." +
    encodeURIComponent(orderId) + "&limit=1"
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}
async function upsertSubscription(row) {
  const rows = await dbRequest("subscriptions?on_conflict=user_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: row
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}
async function updateOrder(orderId, patch) {
  return dbRequest("subscription_orders?order_id=eq." + encodeURIComponent(orderId), {
    method: "PATCH",
    prefer: "return=minimal",
    body: Object.assign({}, patch, { updated_at: new Date().toISOString() })
  });
}
function md5(value) {
  return crypto.createHash("md5").update(String(value), "utf8").digest("hex").toUpperCase();
}
function timingSafeEqualText(a, b) {
  const aa = Buffer.from(String(a || "").toUpperCase());
  const bb = Buffer.from(String(b || "").toUpperCase());
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    const type = String(req.headers["content-type"] || "");
    if (type.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(req.body));
    try { return JSON.parse(req.body); } catch (_) {}
  }
  return {};
}
function premiumNow(subscription) {
  if (!subscription) return false;
  if (!["active", "past_due", "cancelled"].includes(subscription.status)) return false;
  if (!subscription.current_period_end) return false;
  return Date.parse(subscription.current_period_end) > Date.now();
}
function toPeriodEnd(dateValue, previousValue) {
  if (dateValue && /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue))) {
    const d = new Date(String(dateValue) + "T23:59:59.999Z");
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (dateValue) {
    const d = new Date(dateValue);
    if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) return d.toISOString();
  }
  const base = previousValue && Date.parse(previousValue) > Date.now() ? new Date(previousValue) : new Date();
  base.setUTCMonth(base.getUTCMonth() + 1);
  return base.toISOString();
}
module.exports = {
  env, supabaseUrl, supabaseAnonKey, authReady, siteUrl, payhereBase, paymentReady,
  json, methodNotAllowed, authenticate, dbRequest, getSubscription, getOrder,
  upsertSubscription, updateOrder, md5, timingSafeEqualText, parseBody, premiumNow, toPeriodEnd
};
