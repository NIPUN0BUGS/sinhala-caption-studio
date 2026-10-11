const crypto = require("node:crypto");
const { PLANS, json, authenticate, db, readBody, appUrl, originAllowed, paymentHash, isConfiguredForCheckout, payhereAction, cleanString } = require("./_shared");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  if (!originAllowed(req)) return json(res, 403, { error: "origin_not_allowed" });
  let auth;
  try { auth = await authenticate(req); } catch (e) {
    if (e.message === "SUPABASE_NOT_CONFIGURED") return json(res, 503, { error: "accounts_not_configured", message: "Account sign-in is not configured yet." });
    return json(res, 502, { error: "auth_service_unavailable" });
  }
  if (!auth) return json(res, 401, { error: "sign_in_required" });
  if (!isConfiguredForCheckout()) return json(res, 503, { error: "payments_not_configured", message: "Payments are not enabled yet. Finish PayHere and Supabase setup first." });

  const input = readBody(req); const plan = PLANS[String(input.planId || "")];
  if (!plan) return json(res, 400, { error: "invalid_plan" });
  const first = cleanString(input.firstName, 60), last = cleanString(input.lastName, 60);
  const phone = cleanString(input.phone, 30), address = cleanString(input.address, 120), city = cleanString(input.city, 70);
  const email = cleanString(auth.user.email, 160);
  if (!first || !last || !address || !city || !/^[+0-9()\s-]{9,25}$/.test(phone))
    return json(res, 400, { error: "customer_details_required", message: "Provide first name, last name, a valid phone number, address and city." });

  const merchantId = process.env.PAYHERE_MERCHANT_ID, secret = process.env.PAYHERE_MERCHANT_SECRET;
  const orderId = "SCS" + Date.now() + crypto.randomBytes(3).toString("hex").toUpperCase();
  const amount = plan.amount.toFixed(2), origin = appUrl();
  try {
    await db(auth.cfg, "pending_checkouts", "POST", {
      order_id: orderId, user_id: auth.user.id, plan_id: plan.id, amount, currency: plan.currency,
      status: "pending", customer_email: email
    }, "return=minimal");
  } catch (e) {
    console.error("Could not create pending checkout:", e.message, e.status || "");
    return json(res, 500, { error: "checkout_initialization_failed", message: "Could not initialize checkout. Please try again." });
  }
  const params = {
    merchant_id: merchantId, return_url: origin + "/?payment=return", cancel_url: origin + "/?payment=cancelled",
    notify_url: origin + "/api/payhere-notify", first_name: first, last_name: last, email, phone, address, city,
    country: "Sri Lanka", order_id: orderId, items: "Sinhala Caption Studio - " + plan.name + " Monthly Subscription",
    currency: plan.currency, recurrence: plan.recurrence, duration: plan.duration, amount,
    hash: paymentHash(merchantId, orderId, amount, plan.currency, secret)
  };
  return json(res, 200, { action: payhereAction(), params });
};
