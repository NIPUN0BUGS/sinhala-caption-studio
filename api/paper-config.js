const { json, runtimeStatus } = require("./_paper-shared");
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
      domainConfigured: status.hostReady,
      checkoutManuallyEnabled: status.checkoutManuallyEnabled,
      readyToAcceptPayment: status.readyToAcceptPayment,
      message: status.readyToAcceptPayment
        ? "Configuration gates are open. Test sandbox payment callbacks and AI output before live use."
        : "Payments are disabled. Complete database, private storage, PayHere, OpenAI and APP_URL setup, test the flow in sandbox, then explicitly set GURUPAPER_ENABLE_CHECKOUT=true."
    });
  } catch (_) {
    return json(res, 200, { product: "GuruPaper", price: 100, currency: "LKR", readyToAcceptPayment: false, message: "Configuration could not be verified. Payments remain disabled." });
  }
};