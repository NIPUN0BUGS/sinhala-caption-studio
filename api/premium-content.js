const { json, authenticate, getUserSubscription } = require("./_shared");
const PREMIUM_CAPTIONS = [
  { category: "Love", caption: "ඔයා එක්ක ගෙවෙන සාමාන්‍ය මොහොතක් වුණත් මගේ මතක පොතේ විශේෂ පිටුවක්. 🤍" },
  { category: "Aesthetic", caption: "හිත නිදහස් වෙන තැන්වල, වචනවලට වඩා නිහඬකම ලස්සනයි. 🌙" },
  { category: "Life", caption: "මගේ හෙට දවස හදන්න අද මම ගන්න පුංචි තීරණයත් වැදගත්. 🌱" },
  { category: "Attitude", caption: "මගේ වටිනාකම මට පැහැදිලියි. ඒ නිසා හැම තැනකම මාව ඔප්පු කරන්න අවශ්‍ය නෑ. 👑" },
  { category: "Friendship", caption: "කාලය අරගෙන ගියත්, හිතට ළඟ මිනිස්සුන්ගේ තැන අඩු වෙන්නෙ නෑ. 🫶" },
  { category: "Motivation", caption: "පටන් ගත්ත තැන මතක් කරගන්න. නවතින්න හිතුණත් එතැනින්ම තවත් පියවරක් තියන්න. ✨" }
];
module.exports = async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
  let auth;
  try { auth = await authenticate(req); } catch (e) {
    if (e.message === "SUPABASE_NOT_CONFIGURED") return json(res, 503, { error: "accounts_not_configured" });
    return json(res, 502, { error: "auth_service_unavailable" });
  }
  if (!auth) return json(res, 401, { error: "sign_in_required" });
  try {
    const sub = await getUserSubscription(auth.cfg, auth.user.id);
    const withinPeriod = sub && (!sub.current_period_end || Date.parse(sub.current_period_end) > Date.now());
    if (!sub || sub.status !== "active" || !withinPeriod) return json(res, 403, { error: "premium_required", message: "An active paid subscription is required." });
    res.setHeader("Cache-Control", "private, no-store");
    return json(res, 200, { planId: sub.plan_id, captions: PREMIUM_CAPTIONS });
  } catch (e) {
    console.error("Could not load premium content:", e.message);
    return json(res, 500, { error: "premium_content_unavailable" });
  }
};
