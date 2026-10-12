const { json, runtimeStatus } = require("../gurupaper-paper-shared");
module.exports = async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
  try {
    const status = await runtimeStatus(req);
    return json(res, 200, {
      product: "GuruPaper",
      price: 100,
      currency: "LKR",
      paymentMode: status.paymentMode,
      databaseReady: status.databaseReady,
      privateStorageReady: status.storageReady,
      payhereCredentialsConfigured: status.payhereReady,
      aiCredentialConfigured: status.aiReady,
      aiProvider: status.aiProvider,
      domainConfigured: status.hostReady,
      checkoutManuallyEnabled: status.checkoutManuallyEnabled,
      readyToAcceptPayment: status.readyToAcceptPayment,
      message: status.readyToAcceptPayment
        ? "Configuration gates are open. Test sandbox payment callbacks and AI output before live use."
        : "Payments are disabled. Configure database, private storage, PayHere, Gemini or OpenAI and APP_URL first. Set GURUPAPER_ENABLE_CHECKOUT=true to run sandbox tests while PAYHERE_MODE=sandbox; switch to live only after testing and merchant approval."
    });
  } catch (_) {
    return json(res, 200, { product: "GuruPaper", price: 100, currency: "LKR", readyToAcceptPayment: false, message: "Configuration could not be verified. Payments remain disabled." });
  }
};