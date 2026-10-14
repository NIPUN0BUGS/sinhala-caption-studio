const { json, authEnvironment } = require("../gurupaper-paper-shared");
module.exports = async function freeConfig(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
  const auth = authEnvironment();
  const aiReady = Boolean(String(process.env.GEMINI_API_KEY || "").trim());
  return json(res, 200, {
    mode: "free-beta",
    aiProvider: "Gemini API Free Tier",
    model: String(process.env.GEMINI_MODEL || "gemini-3.1-flash-lite"),
    aiReady,
    authReady: auth.ready,
    requiresPayment: false,
    requiresOrderDatabase: false,
    requiresPrivateStorage: false,
    requiresAppUrl: false,
    maxUploadBytes: 2.5 * 1024 * 1024,
    message: !auth.ready
      ? "Supabase sign-in is not configured. Check SUPABASE_URL and SUPABASE_ANON_KEY."
      : !aiReady
        ? "Free beta is ready, but add a Gemini API key to Vercel as GEMINI_API_KEY first. No PayHere, database, private storage or APP_URL is required for this beta."
        : "Free beta is ready. No payment is taken and source files are not stored by GuruPaper. Gemini free-tier terms apply."
  });
};
