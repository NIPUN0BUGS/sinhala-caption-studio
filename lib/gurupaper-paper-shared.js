const crypto = require("node:crypto");
const PRICE_LKR = 100;
const CURRENCY = "LKR";
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "guru-paper-uploads";
const ALLOWED_TYPES = Object.freeze({
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"]
});
function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(JSON.stringify(payload));
}
function text(res, status, value) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(value);
}
function readJson(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_) { return {}; }
}
async function readForm(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  let raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
  if (!raw && req && typeof req[Symbol.asyncIterator] === "function") {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 32768) throw new Error("REQUEST_TOO_LARGE");
      chunks.push(Buffer.from(chunk));
    }
    raw = Buffer.concat(chunks).toString("utf8");
  }
  const out = {};
  for (const [key, value] of new URLSearchParams(raw)) out[key] = value;
  return out;
}
function envSupabase() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !service) throw new Error("SUPABASE_NOT_CONFIGURED");
  return { url, service };
}
function appUrl() {
  const raw = String(process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return "";
    if (url.pathname !== "/" || url.search || url.hash) return "";
    return url.origin;
  } catch (_) { return ""; }
}
function sameAppOrigin(req) {
  const app = appUrl();
  if (!app) return false;
  const origin = String(req.headers.origin || "");
  if (origin) return origin === app;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  try { return host === new URL(app).host; } catch (_) { return false; }
}
function originAllowed(req) { return sameAppOrigin(req); }
function paymentEnvironmentReady() {
  return Boolean(
    appUrl() &&
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.PAYHERE_MERCHANT_ID &&
    process.env.PAYHERE_MERCHANT_SECRET &&
    ["sandbox", "live"].includes(String(process.env.PAYHERE_MODE || "").toLowerCase())
  );
}
function allGenerationServicesConfigured() {
  // Deliberate operator switch: configuration presence alone must not accept money.
  // Enable only after sandbox checkout + callback + AI output have been tested.
  return String(process.env.GURUPAPER_ENABLE_CHECKOUT || "").toLowerCase() === "true" &&
    paymentEnvironmentReady() && Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
}
function payhereAction() {
  return String(process.env.PAYHERE_MODE || "").toLowerCase() === "live"
    ? "https://www.payhere.lk/pay/checkout"
    : "https://sandbox.payhere.lk/pay/checkout";
}
function md5(value) { return crypto.createHash("md5").update(String(value), "utf8").digest("hex").toUpperCase(); }
function sha256(value) { return crypto.createHash("sha256").update(String(value), "utf8").digest("hex"); }
function secureEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function paymentHash(merchantId, orderId, amount, currency, secret) {
  return md5(String(merchantId) + String(orderId) + Number(amount).toFixed(2) + String(currency) + md5(secret));
}
function notificationHash(merchantId, orderId, amount, currency, statusCode, secret) {
  return md5(String(merchantId) + String(orderId) + String(amount) + String(currency) + String(statusCode) + md5(secret));
}
function cleanString(value, max) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max || 200);
}
function emailValid(value) {
  const email = String(value || "").trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function allowedFileType(name, type) {
  const ext = String(name || "").toLowerCase().match(/\.[a-z0-9]+$/);
  return Boolean(ext && ALLOWED_TYPES[String(type || "").toLowerCase()] && ALLOWED_TYPES[String(type || "").toLowerCase()].includes(ext[0]));
}
function encodeStoragePath(path) {
  return String(path).split("/").map(encodeURIComponent).join("/");
}
async function db(cfg, path, method, payload, prefer) {
  const headers = { apikey: cfg.service, Authorization: "Bearer " + cfg.service };
  const init = { method: method || "GET", headers };
  if (payload !== undefined && payload !== null) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(payload);
  }
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(cfg.url + "/rest/v1/" + path, init);
  const body = await response.text();
  if (!response.ok) {
    const error = new Error("SUPABASE_DB_ERROR");
    error.status = response.status;
    error.detail = body.slice(0, 600);
    throw error;
  }
  if (!body) return null;
  try { return JSON.parse(body); } catch (_) { return body; }
}
async function getOrder(cfg, orderId) {
  const rows = await db(cfg, "paper_orders?select=*&order_id=eq." + encodeURIComponent(orderId) + "&limit=1");
  return Array.isArray(rows) ? (rows[0] || null) : null;
}
async function patchOrder(cfg, orderId, payload, extraFilter) {
  let path = "paper_orders?order_id=eq." + encodeURIComponent(orderId);
  if (extraFilter) path += "&" + extraFilter;
  return db(cfg, path, "PATCH", payload, "return=representation");
}
function accessTokenMatches(order, token) {
  if (!order || !/^[a-f0-9]{64}$/i.test(String(token || ""))) return false;
  return secureEqual(order.access_token_hash, sha256(token));
}
async function createSignedUploadUrl(cfg, path) {
  const storageBase = cfg.url + "/storage/v1";
  const endpoint = storageBase + "/object/upload/sign/" + BUCKET + "/" + encodeStoragePath(path);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { apikey: cfg.service, Authorization: "Bearer " + cfg.service, "Content-Type": "application/json" },
    body: JSON.stringify({ upsert: false })
  });
  const raw = await response.text();
  if (!response.ok) {
    const error = new Error("SUPABASE_SIGNED_UPLOAD_FAILED");
    error.status = response.status;
    error.detail = raw.slice(0, 500);
    throw error;
  }
  let data;
  try { data = JSON.parse(raw); } catch (_) { throw new Error("SUPABASE_BAD_UPLOAD_RESPONSE"); }
  const urlPart = data.signedUrl || data.signedURL || data.url;
  if (!urlPart) throw new Error("SUPABASE_BAD_UPLOAD_RESPONSE");
  let uploadUrl = String(urlPart);
  if (!/^https?:\/\//i.test(uploadUrl)) {
    if (uploadUrl.startsWith("/storage/v1/")) uploadUrl = cfg.url + uploadUrl;
    else if (uploadUrl.startsWith("/")) uploadUrl = storageBase + uploadUrl;
    else uploadUrl = storageBase + "/" + uploadUrl;
  }
  const parsed = new URL(uploadUrl);
  if (parsed.origin !== new URL(cfg.url).origin) throw new Error("SUPABASE_BAD_UPLOAD_RESPONSE");
  const token = String(data.token || parsed.searchParams.get("token") || "");
  if (!token) throw new Error("SUPABASE_BAD_UPLOAD_RESPONSE");
  // Some Supabase Storage versions return the path and token as separate fields.
  if (!parsed.searchParams.has("token")) parsed.searchParams.set("token", token);
  return { uploadUrl: parsed.toString(), token };
}
async function storageDownload(cfg, path) {
  const url = cfg.url + "/storage/v1/object/" + BUCKET + "/" + encodeStoragePath(path);
  const response = await fetch(url, { headers: { apikey: cfg.service, Authorization: "Bearer " + cfg.service } });
  if (!response.ok) {
    const error = new Error("SOURCE_FILE_UNAVAILABLE");
    error.status = response.status;
    throw error;
  }
  const advertised = Number(response.headers.get("content-length") || 0);
  if (advertised > MAX_FILE_SIZE) throw new Error("SOURCE_FILE_TOO_LARGE");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_FILE_SIZE) throw new Error("SOURCE_FILE_TOO_LARGE");
  return { buffer, contentType: (response.headers.get("content-type") || "").split(";")[0].toLowerCase() };
}
function verifyFileBytes(fileName, claimedType, buffer) {
  const type = String(claimedType || "").toLowerCase();
  if (!allowedFileType(fileName, type)) return false;
  if (type === "application/pdf") return buffer.subarray(0, 1024).toString("latin1").includes("%PDF-");
  if (type === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (type === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  return false;
}
async function storageDelete(cfg, path) {
  const url = cfg.url + "/storage/v1/object/" + BUCKET + "/" + encodeStoragePath(path);
  const response = await fetch(url, {
    method: "DELETE",
    headers: { apikey: cfg.service, Authorization: "Bearer " + cfg.service }
  });
  if (!response.ok && response.status !== 404) throw new Error("SOURCE_DELETE_FAILED");
}
async function tableIsReady(cfg) {
  try { await db(cfg, "paper_orders?select=order_id&limit=1"); return true; } catch (_) { return false; }
}
async function bucketIsReady(cfg) {
  try {
    const response = await fetch(cfg.url + "/storage/v1/bucket/" + BUCKET, {
      headers: { apikey: cfg.service, Authorization: "Bearer " + cfg.service }
    });
    return response.ok;
  } catch (_) { return false; }
}
async function runtimeStatus(req) {
  const cfgPresent = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  let databaseReady = false, storageReady = false;
  if (cfgPresent) {
    try {
      const cfg = envSupabase();
      const checks = await Promise.all([tableIsReady(cfg), bucketIsReady(cfg)]);
      databaseReady = checks[0]; storageReady = checks[1];
    } catch (_) {}
  }
  const payhereReady = paymentEnvironmentReady();
  const aiReady = Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
  const aiProvider = process.env.GEMINI_API_KEY ? "Gemini Flash" : (process.env.OPENAI_API_KEY ? "OpenAI" : "Not configured");
  const hostReady = sameAppOrigin(req);
  const checkoutManuallyEnabled = String(process.env.GURUPAPER_ENABLE_CHECKOUT || "").toLowerCase() === "true";
  return {
    databaseReady, storageReady, payhereReady, aiReady, aiProvider, hostReady, checkoutManuallyEnabled,
    readyToAcceptPayment: databaseReady && storageReady && payhereReady && aiReady && hostReady && checkoutManuallyEnabled,
    paymentMode: String(process.env.PAYHERE_MODE || "").toLowerCase() === "live" ? "live" : "sandbox"
  };
}

function authEnvironment() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const publicKey = String(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  return { url, publicKey, ready: Boolean(url && publicKey) };
}
async function requireAuthenticatedUser(req, res) {
  const match = /^Bearer\s+(.+)$/i.exec(String((req && req.headers && req.headers.authorization) || ""));
  if (!match || !match[1].trim()) {
    json(res, 401, { error: "authentication_required", message: "Sign in with your verified mobile number before using the paper generator." });
    return null;
  }
  const config = authEnvironment();
  if (!config.ready) {
    json(res, 503, { error: "auth_not_configured", message: "Mobile OTP sign-in is not configured. Add the Supabase public anon/publishable key in Vercel." });
    return null;
  }
  let response;
  try {
    response = await fetch(config.url + "/auth/v1/user", {
      method: "GET",
      headers: { apikey: config.publicKey, Authorization: "Bearer " + match[1].trim() }
    });
  } catch (_) {
    json(res, 503, { error: "auth_provider_unavailable", message: "Could not verify your sign-in right now. Please try again." });
    return null;
  }
  if (response.status === 401 || response.status === 403) {
    json(res, 401, { error: "session_expired", message: "Your sign-in session expired. Please verify your mobile number and sign in again." });
    return null;
  }
  if (!response.ok) {
    json(res, 503, { error: "auth_provider_unavailable", message: "Could not verify your sign-in right now. Please try again." });
    return null;
  }
  let user;
  try { user = await response.json(); } catch (_) { user = null; }
  const phone = String(user && user.phone || "");
  if (!user || !/^[0-9a-f-]{36}$/i.test(String(user.id || "")) ||
      !/^\+[1-9][0-9]{7,14}$/.test(phone) || !user.phone_confirmed_at) {
    json(res, 401, { error: "invalid_session", message: "Please verify your mobile number and sign in again." });
    return null;
  }
  return user;
}


module.exports = {
  PRICE_LKR, CURRENCY, MAX_FILE_SIZE, BUCKET, ALLOWED_TYPES,
  json, text, readJson, readForm, envSupabase, appUrl, sameAppOrigin, originAllowed,
  paymentEnvironmentReady, allGenerationServicesConfigured, payhereAction, md5,
  sha256, secureEqual, paymentHash, notificationHash, cleanString, emailValid,
  allowedFileType, encodeStoragePath, db, getOrder, patchOrder, accessTokenMatches,
  authEnvironment, requireAuthenticatedUser,
  createSignedUploadUrl, storageDownload, verifyFileBytes, storageDelete, runtimeStatus
};