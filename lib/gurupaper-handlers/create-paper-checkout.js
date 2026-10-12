const {
  PRICE_LKR, CURRENCY, json, readJson, envSupabase, originAllowed, allGenerationServicesConfigured,
  emailValid, cleanString, getOrder, accessTokenMatches, storageDownload, verifyFileBytes,
  paymentHash, payhereAction, patchOrder
} = require("../gurupaper-paper-shared");
function fail(res, status, error, message) { return json(res, status, { error, message }); }
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed", "Use POST.");
  if (!originAllowed(req)) return fail(res, 403, "origin_not_allowed", "Please use GuruPaper from its configured website domain.");
  if (!allGenerationServicesConfigured()) return fail(res, 503, "services_not_configured", "Payments remain disabled until PayHere, private storage, database, AI and website URL are configured.");
  const input = readJson(req);
  const orderId = String(input.orderId || "");
  const token = String(input.accessToken || "");
  const customer = input.customer || {};
  const first = cleanString(customer.firstName, 80);
  const last = cleanString(customer.lastName, 80);
  const email = cleanString(customer.email, 254);
  const phone = cleanString(customer.phone, 30);
  const address = cleanString(customer.address, 160);
  const city = cleanString(customer.city, 80);
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !first || !last || !emailValid(email) ||
      !/^[0-9+() -]{7,30}$/.test(phone) || !address || !city) {
    return fail(res, 400, "invalid_customer_details", "Enter your first name, last name, email, phone, address and city correctly.");
  }
  try {
    const cfg = envSupabase();
    const order = await getOrder(cfg, orderId);
    if (!order || !accessTokenMatches(order, token)) return fail(res, 404, "order_not_found", "This order could not be found. Please start again.");
    if (Number(order.amount) !== PRICE_LKR || order.currency !== CURRENCY) return fail(res, 409, "order_amount_mismatch", "The order amount could not be verified.");
    if (order.status !== "created") return fail(res, 409, "order_not_ready_for_checkout", "This order has already entered payment or generation. Check its status instead.");
    const source = await storageDownload(cfg, order.source_path);
    if (source.buffer.length !== Number(order.source_size) || !verifyFileBytes(order.source_filename, order.source_content_type, source.buffer)) {
      return fail(res, 400, "invalid_uploaded_file", "The uploaded file could not be verified. Upload a valid PDF, PNG or JPG/JPEG and try again.");
    }
    const merchantId = String(process.env.PAYHERE_MERCHANT_ID || "").trim();
    const merchantSecret = String(process.env.PAYHERE_MERCHANT_SECRET || "");
    const base = process.env.APP_URL.replace(/\/+$/, "");
    const amount = PRICE_LKR.toFixed(2);
    const updated = await patchOrder(cfg, orderId, {
      status: "pending_payment",
      customer: { firstName: first, lastName: last, email, phone, address, city },
      updated_at: new Date().toISOString()
    }, "status=eq.created");
    if (!Array.isArray(updated) || !updated.length) return fail(res, 409, "checkout_already_started", "This order has already started payment. Check its status instead.");
    const params = {
      merchant_id: merchantId,
      return_url: base + "/?payment=return&order_id=" + encodeURIComponent(orderId) + "#paper-generator",
      cancel_url: base + "/?payment=cancelled&order_id=" + encodeURIComponent(orderId) + "#paper-generator",
      notify_url: base + "/api/payhere-paper-notify",
      first_name: first, last_name: last, email, phone, address, city, country: "Sri Lanka",
      order_id: orderId, items: "GuruPaper - Lesson-based Question Paper",
      currency: CURRENCY, amount,
      hash: paymentHash(merchantId, orderId, amount, CURRENCY, merchantSecret)
    };
    return json(res, 200, { action: payhereAction(), params });
  } catch (e) {
    console.error("GuruPaper checkout initialization failed:", e.message, e.status || "");
    return fail(res, 503, "checkout_initialization_failed", "Checkout could not be initialized. No payment was taken.");
  }
};