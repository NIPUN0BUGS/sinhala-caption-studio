const { json, readJson, envSupabase, originAllowed, getOrder, accessTokenMatches, requireAuthenticatedUser, enforceRateLimit } = require("../gurupaper-paper-shared");
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  if (!originAllowed(req)) return json(res, 403, { error: "origin_not_allowed", message: "Please use GuruPaper from its configured website domain." });
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;
  const input = readJson(req);
  const orderId = String(input.orderId || "");
  const token = String(input.accessToken || "");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json(res, 400, { error: "invalid_order_id" });
  try {
    const cfg = envSupabase();
    if (!await enforceRateLimit(req, res, cfg, user.id, { bucket: "paper-order-status", actorLimit: 60, ipLimit: 120, windowSeconds: 60 })) return;
    const order = await getOrder(cfg, orderId);
    if (!order || order.user_id !== user.id || !accessTokenMatches(order, token)) return json(res, 404, { error: "order_not_found", message: "Order not found. Sign in to the account that created this order." });
    const payload = { orderId, status: order.status, amount: Number(order.amount), currency: order.currency };
    if (order.status === "ready" && order.generated_paper) {
      payload.paper = order.generated_paper;
      payload.options = order.paper_options;
    }
    if (["failed", "cancelled", "chargeback"].includes(order.status)) {
      payload.message = order.status === "cancelled" ? "Payment was cancelled." : order.status === "chargeback" ? "The payment was reversed. Contact support if you think this is an error." : "Payment or generation failed. Contact support if you need help.";
    }
    return json(res, 200, payload);
  } catch (e) {
    console.error("GuruPaper order status failed:", e.message, e.status || "");
    return json(res, 503, { error: "status_unavailable", message: "Could not check payment status right now. Try again shortly." });
  }
};