const { text, envSupabase, db, readBody, verifyNotification, nextBillingDate } = require("./_shared");
async function selectRows(cfg, path) {
  const rows = await db(cfg, path); return Array.isArray(rows) ? rows : [];
}
async function patchRow(cfg, path, payload) {
  return db(cfg, path, "PATCH", payload, "return=minimal");
}
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return text(res, 405, "Method not allowed");
  let cfg;
  try { cfg = envSupabase(); } catch (_) { return text(res, 503, "Payment notification is not configured"); }
  const merchantId = process.env.PAYHERE_MERCHANT_ID || "", secret = process.env.PAYHERE_MERCHANT_SECRET || "";
  if (!merchantId || !secret) return text(res, 503, "PayHere is not configured");
  const body = readBody(req);
  if (!verifyNotification(body, merchantId, secret)) return text(res, 400, "Invalid notification signature");

  const orderId = String(body.order_id || ""), subscriptionId = String(body.subscription_id || "");
  const paymentId = String(body.payment_id || ""), statusCode = Number(body.status_code);
  const messageType = String(body.message_type || ""), currency = String(body.payhere_currency || "");
  const amount = Number(body.payhere_amount);
  if (!orderId || !paymentId || !Number.isFinite(amount) || currency !== "LKR" || !Number.isFinite(statusCode))
    return text(res, 400, "Invalid notification fields");

  try {
    const pendingRows = await selectRows(cfg, "pending_checkouts?select=order_id,user_id,plan_id,amount,currency,status&order_id=eq." + encodeURIComponent(orderId) + "&limit=1");
    const pending = pendingRows[0] || null;
    let existingSub = null;
    if (subscriptionId) {
      const rows = await selectRows(cfg, "subscriptions?select=user_id,plan_id,payhere_subscription_id,status,amount,currency,current_period_end&payhere_subscription_id=eq." + encodeURIComponent(subscriptionId) + "&limit=1");
      existingSub = rows[0] || null;
    }
    const matchedPending = Boolean(pending && pending.currency === currency && Math.abs(Number(pending.amount) - amount) < 0.005);
    const matchedExisting = Boolean(existingSub && existingSub.currency === currency && Math.abs(Number(existingSub.amount) - amount) < 0.005);
    const initial = Boolean(matchedPending && subscriptionId);
    const knownSubscription = Boolean(matchedExisting && subscriptionId);

    // Persist only notifications associated with a server-created checkout or known subscription.
    const ownerId = matchedPending ? pending.user_id : matchedExisting ? existingSub.user_id : null;
    if (ownerId) {
      await db(cfg, "payments?on_conflict=payment_id", "POST", {
        payment_id: paymentId, order_id: orderId, user_id: ownerId,
        payhere_subscription_id: subscriptionId || null, amount: amount.toFixed(2), currency,
        status_code: statusCode, message_type: messageType || null
      }, "resolution=merge-duplicates,return=minimal");
    }

    const successful = statusCode === 2 &&
      (messageType === "AUTHORIZATION_SUCCESS" || messageType === "RECURRING_INSTALLMENT_SUCCESS" ||
       (!messageType && (initial || knownSubscription)));
    if (successful && (initial || knownSubscription)) {
      const userId = matchedPending ? pending.user_id : existingSub.user_id;
      const planId = matchedPending ? pending.plan_id : existingSub.plan_id;
      const chargeAmount = matchedPending ? Number(pending.amount) : Number(existingSub.amount);
      await db(cfg, "subscriptions?on_conflict=user_id", "POST", {
        user_id: userId, plan_id: planId, payhere_subscription_id: subscriptionId, status: "active",
        amount: chargeAmount.toFixed(2), currency: "LKR", current_period_end: nextBillingDate(body.item_rec_date_next || ""),
        latest_payment_id: paymentId, updated_at: new Date().toISOString()
      }, "resolution=merge-duplicates,return=minimal");
      if (matchedPending) await patchRow(cfg, "pending_checkouts?order_id=eq." + encodeURIComponent(orderId),
        { status: "paid", processed_at: new Date().toISOString() });
    } else if (matchedPending && (statusCode === -1 || statusCode === -2 || statusCode === 0)) {
      await patchRow(cfg, "pending_checkouts?order_id=eq." + encodeURIComponent(orderId),
        { status: statusCode === -1 ? "cancelled" : "failed", processed_at: new Date().toISOString() });
    }

    if (matchedExisting && subscriptionId) {
      if (messageType === "RECURRING_INSTALLMENT_FAILED" || statusCode === -3) {
        await patchRow(cfg, "subscriptions?payhere_subscription_id=eq." + encodeURIComponent(subscriptionId),
          { status: "past_due", latest_payment_id: paymentId, updated_at: new Date().toISOString() });
      } else if (messageType === "RECURRING_STOPPED" || String(body.item_rec_status) === "-1") {
        await patchRow(cfg, "subscriptions?payhere_subscription_id=eq." + encodeURIComponent(subscriptionId),
          { status: "cancelled", latest_payment_id: paymentId, updated_at: new Date().toISOString() });
      } else if (messageType === "RECURRING_COMPLETE" || String(body.item_rec_status) === "1") {
        await patchRow(cfg, "subscriptions?payhere_subscription_id=eq." + encodeURIComponent(subscriptionId),
          { status: "completed", latest_payment_id: paymentId, updated_at: new Date().toISOString() });
      }
    }
    return text(res, 200, "OK");
  } catch (e) {
    console.error("PayHere notification processing failed:", e.message, e.status || "");
    return text(res, 500, "Notification processing failed");
  }
};
