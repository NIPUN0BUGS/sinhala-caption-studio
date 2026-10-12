const {
  json, envSupabase, db, requireAuthenticatedUser
} = require("../gurupaper-paper-shared");

function statusLabel(status) {
  return String(status || "unknown").slice(0, 40);
}
module.exports = async function adminDashboardHandler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;
  let cfg;
  try {
    cfg = envSupabase();
    const admins = await db(
      cfg,
      "gurupaper_admins?select=user_id&user_id=eq." + encodeURIComponent(user.id) + "&limit=1"
    );
    if (!Array.isArray(admins) || !admins.length) {
      return json(res, 403, { error: "admin_access_required", message: "This verified account is not an administrator. Add your Supabase Auth user UUID to public.gurupaper_admins after reviewing access." });
    }
    const rows = await db(
      cfg,
      "paper_orders?select=order_id,user_id,status,amount,currency,source_filename,paper_options,customer,created_at,updated_at,paid_at,generated_at&order=created_at.desc&limit=100"
    );
    const orders = (Array.isArray(rows) ? rows : []).map(row => {
      const customer = row.customer && typeof row.customer === "object" ? row.customer : {};
      const options = row.paper_options && typeof row.paper_options === "object" ? row.paper_options : {};
      return {
        orderId: row.order_id,
        userId: row.user_id || null,
        status: statusLabel(row.status),
        amount: Number(row.amount) || 0,
        currency: String(row.currency || "LKR"),
        sourceFilename: String(row.source_filename || ""),
        grade: String(options.grade || ""),
        subject: String(options.subject || ""),
        medium: String(options.medium || ""),
        questionCount: Number(options.questionCount) || 0,
        customer: {
          name: [customer.firstName, customer.lastName].filter(Boolean).join(" ").slice(0, 170),
          email: String(customer.email || "").slice(0, 254),
          phone: String(customer.phone || "").slice(0, 30),
          city: String(customer.city || "").slice(0, 80)
        },
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
        paidAt: row.paid_at || null,
        generatedAt: row.generated_at || null
      };
    });
    const paidOrders = orders.filter(o => o.paidAt && o.status !== "chargeback");
    const allUsersUrl = cfg.url + "/auth/v1/admin/users?page=1&per_page=100";
    let users = [], totalUsers = null;
    try {
      const response = await fetch(allUsersUrl, {
        headers: { apikey: cfg.service, Authorization: "Bearer " + cfg.service }
      });
      if (response.ok) {
        const data = await response.json();
        users = (Array.isArray(data.users) ? data.users : []).map(item => ({
          id: String(item.id || ""),
          phone: String(item.phone || ""),
          name: String((item.user_metadata && (item.user_metadata.full_name || item.user_metadata.name)) || ""),
          createdAt: item.created_at || null,
          lastSignInAt: item.last_sign_in_at || null,
          phoneConfirmed: Boolean(item.phone_confirmed_at)
        }));
        totalUsers = Number.isFinite(Number(data.total)) ? Number(data.total) : users.length;
      }
    } catch (_) {}
    const counts = {};
    for (const order of orders) counts[order.status] = (counts[order.status] || 0) + 1;
    let aggregate = null;
    try {
      const candidate = await db(cfg, "rpc/gurupaper_admin_stats", "POST", {});
      if (candidate && typeof candidate === "object" && candidate.totalOrders !== undefined) aggregate = candidate;
    } catch (_) {}
    return json(res, 200, {
      admin: { id: user.id, phone: user.phone },
      stats: {
        totalOrders: aggregate ? Number(aggregate.totalOrders) : orders.length,
        paidOrders: aggregate ? Number(aggregate.paidOrders) : paidOrders.length,
        generatedPapers: aggregate ? Number(aggregate.generatedPapers) : (counts.ready || 0),
        awaitingPayment: aggregate ? Number(aggregate.awaitingPayment) : (counts.pending_payment || 0),
        failedOrders: aggregate ? Number(aggregate.failedOrders) : (counts.failed || 0),
        revenueLkr: aggregate ? Number(aggregate.revenueLkr) : paidOrders.reduce((sum, order) => sum + order.amount, 0),
        totalUsers: aggregate ? Number(aggregate.totalUsers) : totalUsers
      },
      statusCounts: aggregate && aggregate.statusCounts ? aggregate.statusCounts : counts,
      aiProvider: process.env.GEMINI_API_KEY ? "Gemini Flash (free-tier quota subject to limits)" : (process.env.OPENAI_API_KEY ? "OpenAI" : "Not configured"),
      llmKeyConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
      recentOrders: orders,
      users
    });
  } catch (error) {
    console.error("GuruPaper admin dashboard failed:", error.message, error.status || "");
    return json(res, 503, { error: "admin_dashboard_unavailable", message: "Could not load admin data. Verify the database schema and administrator allowlist." });
  }
};
