const { json, authEnvironment } = require("../gurupaper-paper-shared");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
  const config = authEnvironment();
  return json(res, 200, {
    product: "GuruPaper",
    authEnabled: config.ready,
    supabaseUrl: config.ready ? config.url : "",
    // This is the public anon/publishable key, not the service-role key.
    // Database tables remain inaccessible to browser roles by RLS.
    publicKey: config.ready ? config.publicKey : "",
    message: config.ready
      ? "Email OTP authentication is configured."
      : "Email sign-in is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY (public anon/publishable key) in Vercel."
  });
};
