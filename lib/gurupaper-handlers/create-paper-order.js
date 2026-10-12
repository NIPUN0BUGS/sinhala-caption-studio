const crypto = require("node:crypto");
const {
  PRICE_LKR, CURRENCY, MAX_FILE_SIZE, json, readJson, envSupabase, originAllowed,
  allGenerationServicesConfigured, cleanString, allowedFileType, sha256, createSignedUploadUrl, db, requireAuthenticatedUser
} = require("../gurupaper-paper-shared");
function fail(res, status, error, message) { return json(res, status, { error, message }); }
function cleanOptions(input) {
  const types = Array.isArray(input.questionTypes) ? input.questionTypes.filter(x => ["mcq", "short", "structured", "essay"].includes(x)) : [];
  const count = Number(input.questionCount);
  const marks = Number(input.totalMarks);
  const difficulty = ["easy", "standard", "challenging"].includes(input.difficulty) ? input.difficulty : "standard";
  const grade = cleanString(input.grade, 40);
  const subject = cleanString(input.subject, 80);
  const medium = cleanString(input.medium, 40);
  if (!grade || !subject || !["Sinhala Medium", "Tamil Medium", "English Medium", "Sinhala & English", "Tamil & English"].includes(medium)) throw new Error("INVALID_PAPER_DETAILS");
  if (!Number.isInteger(count) || count < 5 || count > 20 || !Number.isInteger(marks) || marks < count || marks > 1000) throw new Error("INVALID_MARKS_OR_QUESTION_COUNT");
  if (!types.length) throw new Error("QUESTION_TYPE_REQUIRED");
  return {
    schoolName: cleanString(input.schoolName, 120),
    teacherName: cleanString(input.teacherName, 100),
    title: cleanString(input.title || "Lesson-based Question Paper", 120),
    grade, subject, medium,
    term: cleanString(input.term || "Revision Paper", 60),
    duration: cleanString(input.duration || "1 hour", 40),
    questionCount: count, totalMarks: marks, difficulty,
    questionTypes: Array.from(new Set(types)),
    includeAnswers: input.includeAnswers !== false
  };
}
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed", "Use POST.");
  if (!originAllowed(req)) return fail(res, 403, "origin_not_allowed", "Please use GuruPaper from its configured website domain.");
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;
  if (!allGenerationServicesConfigured()) return fail(res, 503, "services_not_configured", "Paper generation and payments are not live yet. Required services must be configured and tested before taking a payment.");
  const input = readJson(req);
  if (input.sourceConsent !== true) return fail(res, 400, "source_consent_required", "Confirm that you have permission to upload and process these lesson notes.");
  let options;
  try { options = cleanOptions(input); }
  catch (_) { return fail(res, 400, "invalid_paper_options", "Check the grade, subject, language, question count, total marks and question types."); }
  const fileNameRaw = cleanString(input.fileName, 180);
  const ext = (fileNameRaw.toLowerCase().match(/\.[a-z0-9]+$/) || [])[0] || "";
  const fileName = fileNameRaw.split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-100);
  const type = cleanString(input.contentType, 80).toLowerCase();
  const size = Number(input.fileSize);
  if (!fileName || ![".pdf", ".png", ".jpg", ".jpeg"].includes(ext) ||
      !["application/pdf", "image/png", "image/jpeg"].includes(type) ||
      !Number.isInteger(size) || size < 1 || size > MAX_FILE_SIZE || !allowedFileType(fileName, type)) {
    return fail(res, 400, "invalid_source_file", "Upload one PDF, PNG or JPG/JPEG file smaller than 15 MB.");
  }
  try {
    const cfg = envSupabase();
    const orderId = crypto.randomUUID();
    const accessToken = crypto.randomBytes(32).toString("hex");
    const path = orderId + "/" + fileName;
    const signed = await createSignedUploadUrl(cfg, path);
    const now = new Date().toISOString();
    const inserted = await db(cfg, "paper_orders", "POST", {
      order_id: orderId, user_id: user.id, access_token_hash: sha256(accessToken), status: "created",
      amount: PRICE_LKR, currency: CURRENCY, source_path: path,
      source_filename: fileName, source_content_type: type, source_size: size,
      paper_options: options,
      source_consent_at: now,
      source_consent_version: "2026-10-v1",
      created_at: now, updated_at: now
    }, "return=representation");
    if (!Array.isArray(inserted) || !inserted.length) throw new Error("ORDER_CREATE_FAILED");
    return json(res, 201, {
      orderId, accessToken, uploadUrl: signed.uploadUrl, amount: PRICE_LKR, currency: CURRENCY, status: "created",
      message: "Upload the lesson file, then continue to the one-time payment. No paper will be generated before the server confirms payment."
    });
  } catch (e) {
    console.error("GuruPaper order creation failed:", e.message, e.status || "");
    if (e.message === "SUPABASE_NOT_CONFIGURED") return fail(res, 503, "storage_not_configured", "Private file storage is not configured yet.");
    return fail(res, 503, "order_setup_failed", "Could not start this order. Check the private storage and database setup; no payment was taken.");
  }
};