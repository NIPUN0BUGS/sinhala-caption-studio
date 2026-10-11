const { json, appUrl, isConfiguredForCheckout } = require("./_shared");
module.exports = function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
  const supabaseReady = Boolean(supabaseUrl && supabaseAnonKey && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const paymentsReady = Boolean(supabaseReady && appUrl() && isConfiguredForCheckout());
  return json(res, 200, {
    supabaseUrl, supabaseAnonKey, authReady: supabaseReady, paymentsReady,
    cancellationReady: Boolean(process.env.PAYHERE_APP_ID && process.env.PAYHERE_APP_SECRET),
    payhereMode: process.env.PAYHERE_MODE === "live" ? "live" : "sandbox",
    plans: [
      { id: "pro", name: "Creator Pro", amount: 490, currency: "LKR", interval: "month" },
      { id: "plus", name: "Creator Plus", amount: 990, currency: "LKR", interval: "month" }
    ]
  });
};
