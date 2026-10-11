const { json, authenticate, envSupabase, db, originAllowed, getUserSubscription } = require("./_shared");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  if (!originAllowed(req)) return json(res, 403, { error: "origin_not_allowed" });
  let auth;
  try { auth = await authenticate(req); } catch (e) {
    if (e.message === "SUPABASE_NOT_CONFIGURED") return json(res, 503, { error: "accounts_not_configured" });
    return json(res, 502, { error: "auth_service_unavailable" });
  }
  if (!auth) return json(res, 401, { error: "sign_in_required" });
  const appId = process.env.PAYHERE_APP_ID || "";
  const appSecret = process.env.PAYHERE_APP_SECRET || "";
  if (!appId || !appSecret) return json(res, 503, { error: "cancellation_not_configured", message: "Subscription cancellation API credentials have not been configured yet." });

  let sub;
  try { sub = await getUserSubscription(auth.cfg, auth.user.id); }
  catch (e) { return json(res, 500, { error: "subscription_lookup_failed" }); }
  if (!sub || !sub.payhere_subscription_id || !["active", "past_due"].includes(sub.status))
    return json(res, 409, { error: "no_cancellable_subscription", message: "No active PayHere subscription was found for this account." });

  const mode = process.env.PAYHERE_MODE === "live" ? "live" : "sandbox";
  const base = mode === "live" ? "https://www.payhere.lk" : "https://sandbox.payhere.lk";
  try {
    const tokenResponse = await fetch(base + "/merchant/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(appId + ":" + appSecret).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString()
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("PayHere manager token request failed with status", tokenResponse.status);
      return json(res, 502, { error: "payhere_auth_failed", message: "Could not authenticate to the PayHere subscription manager." });
    }

    const cancelResponse = await fetch(base + "/merchant/v1/subscription/cancel", {
      method: "POST",
      headers: { Authorization: "Bearer " + tokenData.access_token, "Content-Type": "application/json" },
      body: JSON.stringify({ subscription_id: sub.payhere_subscription_id })
    });
    const cancelData = await cancelResponse.json().catch(() => ({}));
    if (!cancelResponse.ok || Number(cancelData.status) !== 1) {
      console.error("PayHere subscription cancellation returned a non-success response", cancelResponse.status, cancelData.status || "");
      return json(res, 502, { error: "payhere_cancel_failed", message: cancelData.msg || "PayHere could not cancel the subscription. Please contact support." });
    }
    await db(auth.cfg, "subscriptions?user_id=eq." + encodeURIComponent(auth.user.id), "PATCH", {
      status: "cancelled", updated_at: new Date().toISOString()
    }, "return=minimal");
    return json(res, 200, { ok: true, status: "cancelled", message: "Your recurring subscription has been cancelled." });
  } catch (e) {
    console.error("Subscription cancellation failed:", e.message);
    return json(res, 502, { error: "cancellation_service_unavailable", message: "Could not contact PayHere. Please try again later." });
  }
};
