const {
  text, readForm, envSupabase, getOrder, notificationHash, secureEqual,
  PRICE_LKR, CURRENCY, patchOrder
} = require("../lib/gurupaper-paper-shared");
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return text(res, 405, "Method not allowed");
  try {
    const body = await readForm(req);
    const merchantId = String(body.merchant_id || "");
    const orderId = String(body.order_id || "");
    const amount = String(body.payhere_amount || "");
    const currency = String(body.payhere_currency || "");
    const statusCode = String(body.status_code || "");
    const signature = String(body.md5sig || "");
    const paymentId = String(body.payment_id || "");
    const expectedMerchant = String(process.env.PAYHERE_MERCHANT_ID || "");
    const merchantSecret = String(process.env.PAYHERE_MERCHANT_SECRET || "");
    if (!expectedMerchant || !merchantSecret || merchantId !== expectedMerchant ||
        !/^[0-9a-f-]{36}$/i.test(orderId) || !/^[a-zA-Z0-9_-]{1,80}$/.test(paymentId) ||
        !signature || !["2", "0", "-1", "-2", "-3"].includes(statusCode)) {
      return text(res, 200, "Notification ignored");
    }
    const locallyGenerated = notificationHash(merchantId, orderId, amount, currency, statusCode, merchantSecret);
    if (!secureEqual(locallyGenerated, signature.toUpperCase())) return text(res, 200, "Notification ignored");
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || Math.abs(numericAmount - PRICE_LKR) >= 0.005 || currency !== CURRENCY) return text(res, 200, "Notification ignored");
    const cfg = envSupabase();
    const order = await getOrder(cfg, orderId);
    if (!order || Number(order.amount) !== PRICE_LKR || order.currency !== CURRENCY) return text(res, 200, "Notification ignored");
    if (statusCode === "2") {
      if (["paid", "generating", "ready"].includes(order.status)) {
        if (String(order.payhere_payment_id || "") === paymentId) return text(res, 200, "OK");
        console.error("GuruPaper received a second successful payment for one order; review for a possible refund.", orderId);
        return text(res, 200, "Duplicate order notification recorded for review");
      }
      if (order.status !== "pending_payment") return text(res, 200, "Notification ignored");
      const rows = await patchOrder(cfg, orderId, {
        status: "paid", payhere_payment_id: paymentId,
        paid_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }, "status=eq.pending_payment");
      if (!Array.isArray(rows) || !rows.length) {
        const fresh = await getOrder(cfg, orderId);
        if (fresh && ["paid", "generating", "ready"].includes(fresh.status) && String(fresh.payhere_payment_id || "") === paymentId) return text(res, 200, "OK");
      }
      return text(res, 200, "OK");
    }
    if (statusCode === "-3" && ["paid", "generating", "ready"].includes(order.status)) {
      await patchOrder(cfg, orderId, { status: "chargeback", updated_at: new Date().toISOString() });
      return text(res, 200, "Chargeback recorded");
    }
    if (order.status === "pending_payment" && (statusCode === "-1" || statusCode === "-2")) {
      await patchOrder(cfg, orderId, {
        status: statusCode === "-1" ? "cancelled" : "failed",
        updated_at: new Date().toISOString()
      }, "status=eq.pending_payment");
    }
    return text(res, 200, "OK");
  } catch (e) {
    console.error("GuruPaper PayHere notification handler failed:", e.message, e.status || "");
    return text(res, 500, "Notification processing failed");
  }
};
module.exports.config = { api: { bodyParser: false } };