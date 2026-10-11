const {
  PLANS, text, envSupabase, db, readBody, verifyNotification, nextBillingDate,
  verifyPayHereSubscriptionPayment, getPayHereSubscription, cancelPayHereSubscription
} = require("./_shared");

async function selectRows(cfg, path) {
  const rows = await db(cfg, path); return Array.isArray(rows) ? rows : [];
}
async function patchRow(cfg, path, payload) {
  return db(cfg, path, "PATCH", payload, "return=minimal");
}
function validPaymentId(value) { return /^\d{1,30}$/.test(String(value || "")); }
function matchedAmount(row, amount, currency) {
  if (!row || String(row.currency || "") !== currency) return false;
  const configuredPlan = PLANS[String(row.plan_id || "")];
  return Boolean(configuredPlan &&
    Number(configuredPlan.amount) === Number(row.amount) &&
    Math.abs(Number(row.amount) - amount) < 0.005);
}
async function findPending(cfg, orderId) {
  const rows = await selectRows(cfg, "pending_checkouts?select=order_id,user_id,plan_id,amount,currency,status,created_at&order_id=eq." +
    encodeURIComponent(orderId) + "&limit=1");
  return rows[0] || null;
}
async function findSubscription(cfg, subscriptionId) {
  if (!subscriptionId) return null;
  const rows = await selectRows(cfg, "subscriptions?select=user_id,plan_id,payhere_subscription_id,status,amount,currency,current_period_end,latest_payment_id&payhere_subscription_id=eq." +
    encodeURIComponent(subscriptionId) + "&limit=1");
  return rows[0] || null;
}
async function findPayment(cfg, paymentId) {
  const rows = await selectRows(cfg, "payments?select=payment_id,order_id,user_id,status_code,message_type&payment_id=eq." +
    encodeURIComponent(paymentId) + "&limit=1");
  return rows[0] || null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return text(res, 405, "Method not allowed");
  let cfg;
  try { cfg = envSupabase(); } catch (_) { return text(res, 503, "Payment database is not configured"); }
  const merchantId = process.env.PAYHERE_MERCHANT_ID || "", secret = process.env.PAYHERE_MERCHANT_SECRET || "";
  if (!merchantId || !secret) return text(res, 503, "PayHere is not configured");

  const body = readBody(req);
  // Verify PayHere's documented MD5 checksum before reading any callback as a payment event.
  if (!verifyNotification(body, merchantId, secret)) return text(res, 400, "Invalid notification signature");

  const orderId = String(body.order_id || "").trim();
  const subscriptionId = String(body.subscription_id || "").trim();
  const paymentId = String(body.payment_id || "").trim();
  const statusCodeText = String(body.status_code ?? "").trim();
  const statusCode = /^-?\d+$/.test(statusCodeText) ? Number(statusCodeText) : NaN;
  const messageType = String(body.message_type || "").trim().toUpperCase();
  const currency = String(body.payhere_currency || "").trim().toUpperCase();
  const amount = Number(body.payhere_amount);

  if (!orderId || orderId.length > 100 || !Number.isFinite(amount) || amount <= 0 ||
      currency !== "LKR" || !Number.isFinite(statusCode)) {
    return text(res, 400, "Invalid notification fields");
  }

  try {
    const pending = await findPending(cfg, orderId);
    const existingSub = await findSubscription(cfg, subscriptionId);
    const matchedPending = Boolean(pending && matchedAmount(pending, amount, currency));
    const matchedExisting = Boolean(existingSub && matchedAmount(existingSub, amount, currency) &&
      String(existingSub.payhere_subscription_id) === subscriptionId);
    const initialAuthorization = messageType === "AUTHORIZATION_SUCCESS" && statusCode === 2;
    const successfulInstallment = messageType === "RECURRING_INSTALLMENT_SUCCESS" && statusCode === 2;

    if (initialAuthorization || successfulInstallment) {
      if (!subscriptionId || !validPaymentId(paymentId)) {
        return text(res, 400, "Missing payment or subscription identifier");
      }
      // A successful notification must map to a checkout created by this server or
      // to a subscription that was previously bound to an account.
      if (!(matchedPending || matchedExisting)) return text(res, 200, "Notification ignored");

      // PayHere's MD5 callback checksum does not cover every callback field. Confirm
      // the payment ID against PayHere's authenticated Subscription Manager API too.
      // This prevents accepting fabricated payment IDs or client-supplied amounts.
      let providerPaymentVerified = false;
      try {
        providerPaymentVerified = await verifyPayHereSubscriptionPayment({
          subscriptionId, paymentId, orderId, amount, currency
        });
      } catch (e) {
        console.error("PayHere payment verification unavailable:", e.message);
        return text(res, 503, "Could not independently verify payment; retry notification");
      }
      if (!providerPaymentVerified) return text(res, 503, "Payment is not yet confirmed by PayHere; retry notification");

      const priorPayment = await findPayment(cfg, paymentId);
      if (priorPayment && String(priorPayment.order_id) === orderId &&
          String(priorPayment.status_code) === "2" && String(priorPayment.user_id) === String(matchedPending ? pending.user_id : existingSub.user_id)) {
        return text(res, 200, "OK");
      }

      if (initialAuthorization) {
        // The initial authorization is the only event that may create a subscription.
        // Do not replay it to revive a previously cancelled/completed subscription.
        if (!matchedPending || pending.status === "paid") return text(res, 200, "Notification ignored");
        const existingForUser = await selectRows(cfg, "subscriptions?select=plan_id,status,payhere_subscription_id,current_period_end&user_id=eq." +
          encodeURIComponent(pending.user_id) + "&limit=1");
        const priorSub = existingForUser[0] || null;
        if (priorSub && String(priorSub.payhere_subscription_id || "") !== subscriptionId &&
            (["active", "past_due"].includes(priorSub.status) ||
             (priorSub.status === "cancelled" && (!priorSub.current_period_end || Date.parse(priorSub.current_period_end) > Date.now())))) {
          // A customer may finish a checkout that was abandoned in another tab. Do not
          // overwrite their existing subscription. Record the verified charge and try
          // to stop future renewals on the duplicate PayHere subscription.
          await patchRow(cfg, "pending_checkouts?order_id=eq." + encodeURIComponent(orderId), {
            status: "paid", processed_at: new Date().toISOString()
          });
          await db(cfg, "payments?on_conflict=payment_id", "POST", {
            payment_id: paymentId, order_id: orderId, user_id: pending.user_id,
            payhere_subscription_id: subscriptionId, amount: amount.toFixed(2), currency,
            status_code: statusCode, message_type: messageType
          }, "resolution=merge-duplicates,return=minimal");
          try {
            await cancelPayHereSubscription(subscriptionId);
            console.error("A verified late checkout created a duplicate subscription; future renewals were cancelled. Review whether the customer needs a refund.", pending.user_id);
          } catch (cancelError) {
            console.error("A verified late checkout created a duplicate subscription and automatic cancellation failed. Manual review is required.", pending.user_id, cancelError.message);
          }
          return text(res, 200, "Verified payment recorded; duplicate subscription reviewed");
        }

        await db(cfg, "subscriptions?on_conflict=user_id", "POST", {
          user_id: pending.user_id, plan_id: pending.plan_id, payhere_subscription_id: subscriptionId,
          status: "active", amount: Number(pending.amount).toFixed(2), currency: "LKR",
          current_period_end: nextBillingDate(String(body.item_rec_date_next || "")),
          latest_payment_id: paymentId, updated_at: new Date().toISOString()
        }, "resolution=merge-duplicates,return=minimal");
        await patchRow(cfg, "pending_checkouts?order_id=eq." + encodeURIComponent(orderId), {
          status: "paid", processed_at: new Date().toISOString()
        });
        await db(cfg, "payments?on_conflict=payment_id", "POST", {
          payment_id: paymentId, order_id: orderId, user_id: pending.user_id,
          payhere_subscription_id: subscriptionId, amount: amount.toFixed(2), currency,
          status_code: statusCode, message_type: messageType
        }, "resolution=merge-duplicates,return=minimal");
        return text(res, 200, "OK");
      }

      // Installments are accepted only for a subscription ID already linked to the
      // same user and plan. Cancelled/completed subscriptions are never reactivated.
      if (successfulInstallment && matchedExisting &&
          ["active", "past_due", "cancelled"].includes(existingSub.status)) {
        const newEnd = nextBillingDate(String(body.item_rec_date_next || ""), existingSub.current_period_end);
        await db(cfg, "subscriptions?payhere_subscription_id=eq." + encodeURIComponent(subscriptionId), "PATCH", {
          status: existingSub.status === "cancelled" ? "cancelled" : "active",
          current_period_end: newEnd, latest_payment_id: paymentId, updated_at: new Date().toISOString()
        }, "return=minimal");
        await db(cfg, "payments?on_conflict=payment_id", "POST", {
          payment_id: paymentId, order_id: orderId, user_id: existingSub.user_id,
          payhere_subscription_id: subscriptionId, amount: amount.toFixed(2), currency,
          status_code: statusCode, message_type: messageType
        }, "resolution=merge-duplicates,return=minimal");
        return text(res, 200, "OK");
      }
      return text(res, 200, "Notification ignored");
    }

    // Failed recurring charges do not grant or extend premium access.
    if (messageType === "RECURRING_INSTALLMENT_FAILED" && statusCode === -3 && matchedExisting) {
      await patchRow(cfg, "subscriptions?payhere_subscription_id=eq." + encodeURIComponent(subscriptionId), {
        status: existingSub.status === "cancelled" ? "cancelled" : "past_due",
        latest_payment_id: validPaymentId(paymentId) ? paymentId : existingSub.latest_payment_id,
        updated_at: new Date().toISOString()
      });
      if (validPaymentId(paymentId)) {
        await db(cfg, "payments?on_conflict=payment_id", "POST", {
          payment_id: paymentId, order_id: orderId, user_id: existingSub.user_id,
          payhere_subscription_id: subscriptionId, amount: amount.toFixed(2), currency,
          status_code: statusCode, message_type: messageType
        }, "resolution=merge-duplicates,return=minimal");
      }
      return text(res, 200, "OK");
    }

    if (messageType === "AUTHORIZATION_FAILED" && matchedPending && pending.status === "pending") {
      await patchRow(cfg, "pending_checkouts?order_id=eq." + encodeURIComponent(orderId), {
        status: statusCode === -1 ? "cancelled" : "failed", processed_at: new Date().toISOString()
      });
      return text(res, 200, "OK");
    }

    // Cancellation/completion fields aren't covered by PayHere's MD5 checksum;
    // compare them with the authenticated Subscription Manager API before updating.
    if (subscriptionId && matchedExisting &&
        (messageType === "RECURRING_STOPPED" || String(body.item_rec_status || "") === "-1" ||
         messageType === "RECURRING_COMPLETE" || String(body.item_rec_status || "") === "1")) {
      const remoteSub = await getPayHereSubscription(subscriptionId);
      const remoteStatus = String(remoteSub && remoteSub.status || "").toUpperCase();
      let localStatus = null;
      if (["CANCELLED", "CANCELED", "STOPPED"].includes(remoteStatus)) localStatus = "cancelled";
      else if (remoteStatus === "COMPLETED") localStatus = "completed";
      else if (remoteStatus === "FAILED") localStatus = "past_due";
      if (localStatus) await patchRow(cfg, "subscriptions?payhere_subscription_id=eq." + encodeURIComponent(subscriptionId), {
        status: localStatus, updated_at: new Date().toISOString()
      });
    }

    if (matchedPending && pending.status === "pending" && (statusCode === -1 || statusCode === -2)) {
      await patchRow(cfg, "pending_checkouts?order_id=eq." + encodeURIComponent(orderId), {
        status: statusCode === -1 ? "cancelled" : "failed", processed_at: new Date().toISOString()
      });
    }
    return text(res, 200, "OK");
  } catch (e) {
    console.error("PayHere notification processing failed:", e.message, e.status || "");
    return text(res, 500, "Notification processing failed");
  }
};
