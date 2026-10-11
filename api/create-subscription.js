const crypto = require("node:crypto");
const { PLANS, json, authenticate, db, readBody, appUrl, originAllowed, paymentHash, isConfiguredForCheckout, payhereAction, cleanString, getUserSubscription } = require("./_shared");

const CONSENT_TERMS_VERSION = "2026-10-v1";
const PENDING_CHECKOUT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

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

  const input = readBody(req);
  if (input.recurringConsent !== true) {
    return json(res, 400, { error: "recurring_consent_required", message: "Confirm the monthly recurring price and cancellation terms before continuing." });
  }
  const plan = PLANS[String(input.planId || "")];
  if (!plan) return json(res, 400, { error: "invalid_plan" });

  try {
    const current = await getUserSubscription(auth.cfg, auth.user.id);
    const paidPeriod = Boolean(current && current.current_period_end && Date.parse(current.current_period_end) > Date.now());
    const providerMayStillCharge = Boolean(current && ["active", "past_due"].includes(current.status));
    const cancelledPeriodStillValid = Boolean(current && current.status === "cancelled" && (!current.current_period_end || paidPeriod));
    if (providerMayStillCharge || cancelledPeriodStillValid) {
      return json(res, 409, { error: "subscription_already_exists", message: "A subscription is already active, past due, or still within its paid period. Cancel any active renewal and wait until paid access ends before subscribing again." });
    }
  } catch (e) {
    console.error("Could not verify existing subscription:", e.message);
    return json(res, 500, { error: "subscription_lookup_failed" });
  }

  const first = cleanString(input.firstName, 60), last = cleanString(input.lastName, 60);
  const phone = cleanString(input.phone, 30), address = cleanString(input.address, 120), city = cleanString(input.city, 70);
  const email = cleanString(auth.user.email, 160);
  if (!first || !last || !address || !city || !/^[+0-9()\s-]{9,25}$/.test(phone) || phone.replace(/\D/g, "").length < 9)
    return json(res, 400, { error: "customer_details_required", message: "Provide first name, last name, a valid phone number, address and city." });

  const merchantId = process.env.PAYHERE_MERCHANT_ID, secret = process.env.PAYHERE_MERCHANT_SECRET;
  const orderId = "SCS" + Date.now() + crypto.randomBytes(5).toString("hex").toUpperCase();
  const amount = plan.amount.toFixed(2), origin = appUrl();
  const cutoff = new Date(Date.now() - PENDING_CHECKOUT_MAX_AGE_MS).toISOString();

  try {
    // Release abandoned checkout locks after 30 minutes so a customer can retry.
    await db(auth.cfg,
      "pending_checkouts?user_id=eq." + encodeURIComponent(auth.user.id) +
      "&status=eq.pending&created_at=lt." + encodeURIComponent(cutoff),
      "PATCH", { status: "failed", processed_at: new Date().toISOString() }, "return=minimal");

    const openCheckouts = await db(auth.cfg,
      "pending_checkouts?select=order_id&user_id=eq." + encodeURIComponent(auth.user.id) +
      "&status=eq.pending&limit=1");
    if (Array.isArray(openCheckouts) && openCheckouts.length) {
      return json(res, 409, { error: "checkout_already_pending", message: "A checkout is already waiting for a payment result. Wait for PayHere to report the outcome, or retry after 2 hours if you abandoned the checkout." });
    }

    await db(auth.cfg, "pending_checkouts", "POST", {
      order_id: orderId, user_id: auth.user.id, plan_id: plan.id, amount, currency: plan.currency,
      status: "pending", customer_email: email, recurring_consent_at: new Date().toISOString(),
      consent_terms_version: CONSENT_TERMS_VERSION, created_at: new Date().toISOString()
    }, "return=minimal");
  } catch (e) {
    if (e.status === 409) {
      return json(res, 409, { error: "checkout_already_pending", message: "A checkout is already waiting for a payment result. Do not start multiple checkouts for the same account." });
    }
    console.error("Could not create pending checkout:", e.message, e.status || "");
    return json(res, 500, { error: "checkout_initialization_failed", message: "Could not initialize checkout. Please try again." });
  }

  const params = {
    merchant_id: merchantId, return_url: origin + "/?payment=return#account", cancel_url: origin + "/?payment=cancelled#plans",
    notify_url: origin + "/api/payhere-notify", first_name: first, last_name: last, email, phone, address, city,
    country: "Sri Lanka", order_id: orderId, items: "Sinhala Caption Studio - " + plan.name + " Monthly Subscription",
    currency: plan.currency, recurrence: plan.recurrence, duration: plan.duration, amount,
    hash: paymentHash(merchantId, orderId, amount, plan.currency, secret)
  };
  return json(res, 200, { action: payhereAction(), params });
};
