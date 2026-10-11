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
      readyToAcceptPayment: status.readyToAcceptPayment,
      message: status.readyToAcceptPayment
        ? "Configuration checks passed. Provider credentials and sandbox checkout still need to be tested before live use."
        : "Payment and AI paper generation are not enabled. Complete the private storage, database, PayHere, OpenAI and APP_URL setup first."
    });
  } catch (_) {
    return json(res, 200, { product: "GuruPaper", price: 100, currency: "LKR", readyToAcceptPayment: false, message: "Configuration could not be verified. Payments remain disabled." });
  }
};