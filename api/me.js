const { json, authenticate, getUserSubscription } = require("./_shared");
module.exports = async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
  let auth;
  try { auth = await authenticate(req); } catch (e) {
    if (e.message === "SUPABASE_NOT_CONFIGURED") return json(res, 503, { error: "accounts_not_configured" });
    return json(res, 502, { error: "auth_service_unavailable" });
  }
  if (!auth) return json(res, 401, { error: "sign_in_required" });
  try {
    const subscription = await getUserSubscription(auth.cfg, auth.user.id);
    const withinPeriod = subscription && (!subscription.current_period_end || Date.parse(subscription.current_period_end) > Date.now());
    const isPremium = Boolean(subscription && subscription.status === "active" && withinPeriod);
    return json(res, 200, {
      user: { id: auth.user.id, email: auth.user.email, name: auth.user.user_metadata && auth.user.user_metadata.full_name || "" },
      subscription: subscription ? { planId: subscription.plan_id, status: subscription.status, currentPeriodEnd: subscription.current_period_end, isPremium } : null,
      isPremium
    });
  } catch (e) {
    console.error("Could not fetch member status:", e.message);
    return json(res, 500, { error: "member_status_unavailable" });
  }
};
