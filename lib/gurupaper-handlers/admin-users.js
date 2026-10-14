const {
  json, readJson, envSupabase, db, requireAuthenticatedUser, enforceRateLimit
} = require("../gurupaper-paper-shared");

const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireAdmin(req, res) {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return null;
  let cfg;
  try {
    cfg = envSupabase();
    const rows = await db(
      cfg,
      "gurupaper_admins?select=user_id&user_id=eq." + encodeURIComponent(user.id) + "&limit=1"
    );
    if (!Array.isArray(rows) || !rows.length) {
      json(res, 403, { error: "admin_access_required", message: "Administrator access is required for user management." });
      return null;
    }
    return { user, cfg };
  } catch (error) {
    console.error("GuruPaper admin user authorization failed:", error.message, error.status || "");
    json(res, 503, {
      error: "admin_user_management_unavailable",
      message: error.message === "SUPABASE_NOT_CONFIGURED"
        ? "Admin database access is not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel."
        : "Could not verify administrator permissions. Check Supabase database settings."
    });
    return null;
  }
}

async function adminAuthRequest(cfg, path, method, payload) {
  const headers = {
    apikey: cfg.service,
    Authorization: "Bearer " + cfg.service
  };
  const init = { method, headers };
  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(payload);
  }
  const response = await fetch(cfg.url + "/auth/v1/" + path, init);
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
  if (!response.ok) {
    const error = new Error(String(data.msg || data.message || data.error_description || data.error || "Supabase Auth admin request failed."));
    error.status = response.status;
    error.code = String(data.code || data.error_code || "");
    throw error;
  }
  return data;
}

function profileMetadata(firstName, lastName, address, previous) {
  const fullName = [firstName, lastName].join(" ");
  return {
    ...(previous && typeof previous === "object" ? previous : {}),
    first_name: firstName,
    last_name: lastName,
    address,
    full_name: fullName,
    name: fullName
  };
}
function cleanProfile(body) {
  const firstName = String(body.firstName || "").trim().slice(0, 80);
  const lastName = String(body.lastName || "").trim().slice(0, 80);
  const address = String(body.address || "").trim().slice(0, 160);
  if (!firstName || !lastName || !address) {
    const error = new Error("First name, last name and address are all required.");
    error.status = 400;
    throw error;
  }
  return { firstName, lastName, address };
}
function responseError(res, error, fallback) {
  console.error("GuruPaper admin user action failed:", error.message, error.status || "");
  const status = Number(error.status || 0);
  if (status === 400) return json(res, 400, { error: "invalid_user_details", message: error.message });
  if (status === 401 || status === 403) return json(res, 502, { error: "supabase_auth_admin_denied", message: "Supabase rejected this user-management action. Check the server-side Supabase key and permissions." });
  if (status === 409 || error.code === "email_exists" || /already (been )?registered|already exists/i.test(error.message)) {
    return json(res, 409, { error: "user_already_exists", message: "An account with this email already exists. Refresh the users list and edit that account instead." });
  }
  if (status === 422) return json(res, 422, { error: "user_invitation_failed", message: "Supabase could not invite this email. Check the email address and Supabase Auth email delivery settings." });
  if (status === 429) return json(res, 429, { error: "rate_limited", message: "Too many account changes were attempted. Wait a little and try again." });
  return json(res, 500, { error: "admin_user_action_failed", message: fallback });
}

module.exports = async function adminUsersHandler(req, res) {
  if (!["POST", "PATCH", "DELETE"].includes(String(req.method || "").toUpperCase())) {
    return json(res, 405, { error: "method_not_allowed", message: "Use POST to invite, PATCH to edit, or DELETE to remove a user account." });
  }
  const context = await requireAdmin(req, res);
  if (!context) return;
  const { user: adminUser, cfg } = context;
  if (!await enforceRateLimit(req, res, cfg, adminUser.id, { bucket: "admin-user-mutations", actorLimit: 20, ipLimit: 40, windowSeconds: 60 })) return;
  const body = readJson(req);

  try {
    if (req.method === "POST") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!EMAIL_RE.test(email) || email.length > 254) {
        return json(res, 400, { error: "invalid_email", message: "Enter a valid email address." });
      }
      const { firstName, lastName, address } = cleanProfile(body);
      const metadata = profileMetadata(firstName, lastName, address, {});
      const redirect = "https://gurupaper.vercel.app/";
      const invite = await adminAuthRequest(
        cfg,
        "invite?redirect_to=" + encodeURIComponent(redirect),
        "POST",
        { email, data: metadata }
      );
      return json(res, 201, {
        ok: true,
        message: "Invitation sent to " + email + ". The user must open the invite email to activate the account.",
        user: {
          id: String(invite.id || invite.user && invite.user.id || ""),
          email,
          firstName,
          lastName,
          address
        }
      });
    }

    const id = String(body.id || "").trim();
    if (!USER_ID_RE.test(id)) return json(res, 400, { error: "invalid_user_id", message: "Choose a valid user from the list." });

    if (req.method === "PATCH") {
      const { firstName, lastName, address } = cleanProfile(body);
      const current = await adminAuthRequest(cfg, "admin/users/" + encodeURIComponent(id), "GET");
      const previous = current.user_metadata && typeof current.user_metadata === "object" ? current.user_metadata : {};
      const metadata = profileMetadata(firstName, lastName, address, previous);
      const updated = await adminAuthRequest(
        cfg,
        "admin/users/" + encodeURIComponent(id),
        "PUT",
        { user_metadata: metadata }
      );
      const output = updated.user || updated;
      return json(res, 200, {
        ok: true,
        message: "User profile details updated.",
        user: {
          id,
          email: String(output.email || current.email || ""),
          firstName,
          lastName,
          address
        }
      });
    }

    if (id === String(adminUser.id)) {
      return json(res, 400, { error: "cannot_delete_self", message: "You cannot delete your own administrator account from this screen." });
    }
    const admins = await db(
      cfg,
      "gurupaper_admins?select=user_id&user_id=eq." + encodeURIComponent(id) + "&limit=1"
    );
    if (Array.isArray(admins) && admins.length) {
      return json(res, 403, { error: "cannot_delete_admin", message: "Administrator accounts cannot be deleted here. Remove admin access through a separate reviewed process first." });
    }
    await adminAuthRequest(cfg, "admin/users/" + encodeURIComponent(id), "DELETE");
    return json(res, 200, {
      ok: true,
      message: "User account deleted. Historical paper orders are retained and detached from that account."
    });
  } catch (error) {
    const fallback = req.method === "POST"
      ? "Could not invite user. Check Supabase Auth email delivery configuration."
      : req.method === "PATCH"
        ? "Could not update the user profile. Check the Supabase Auth configuration."
        : "Could not delete this account. Check Supabase Auth configuration and account permissions.";
    return responseError(res, error, fallback);
  }
};
