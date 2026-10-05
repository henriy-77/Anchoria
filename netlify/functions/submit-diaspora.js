/**
 * Anchoria Securities — Dangote IPO Diaspora Application Submission Handler
 * Netlify Serverless Function → Netlify Blobs only (responses are NOT sent to Airtable)
 * Documents & signature are uploaded separately via upload-document
 * (routed here by the DIA- reference prefix / "diaspora" record kind).
 */

const { saveApplication } = require("./lib/records");
const { REF_RE, overLimit } = require("./lib/guard");
const TABLE = "Diaspora IPO Applications"; // label only — Airtable is not used for this form
const OFFER_PRICE = 525;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(), body: "Method Not Allowed" };
  }

  const SHARED_SECRET = process.env.SHARED_SECRET;
  const incomingSecret = event.headers["x-shared-secret"] || "";
  if (SHARED_SECRET && incomingSecret !== SHARED_SECRET) {
    return json(401, { error: "Unauthorized" });
  }

  if (await overLimit("submit", event, 20, 3600)) return json(429, { error: "Too many submissions from your network. Please try again later." });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const str  = (v) => (v == null ? "" : String(v));
  const date = (v) => (v ? String(v).slice(0, 10) : null);
  const sig  = payload.signature || {};
  const decl = payload.declarations || {};
  const ref  = str(payload.reference);

  // Re-check the rules the form enforces — never trust the client for the amount.
  const units = Number(payload.units);
  if (!Number.isInteger(units) || units < 10 || units % 10 !== 0) {
    return json(400, { error: "Units must be a whole number in multiples of 10" });
  }
  if (!payload.isDiaspora) return json(400, { error: "This offer is for diaspora investors only" });
  const amount = units * OFFER_PRICE;
  const ng = !!payload.hasNigerianKyc;

  const fields = {
    "Reference":                    ref,
    "Units":                        units,
    "Offer Price (NGN)":            OFFER_PRICE,
    "Amount Payable (NGN)":         amount,
    "Amount In Words":              str(payload.amountInWords),
    "Diaspora Investor":            true,
    "Holds Nigerian KYC":           ng,
    "Country of Residence":         str(payload.residenceCountry),
    "Title":                        str(payload.title),
    "Surname":                      str(payload.surname),
    "First Name":                   str(payload.firstName),
    "Other Names":                  str(payload.otherNames),
    "Date of Birth":                date(payload.dob),
    "Postal Address":               str(payload.address),
    "City":                         str(payload.city),
    "Country":                      str(payload.country),
    "Phone":                        str(payload.phone),
    "Email":                        str(payload.email),
    "BVN":                          ng ? str(payload.bvn) : "",
    "Government ID Number":         ng ? str(payload.govId) : "",
    "Source of Funds":              ng ? "" : str(payload.sourceOfFunds),
    "Payment Sent to ASL":          !!payload.paymentSent,
    "Refund Bank Name":             str(payload.bankName),
    "Refund Account Number":        str(payload.bankAccountNumber),
    "Refund Account Name":          str(payload.bankAccountName),
    "Declaration: Risk & Terms":    !!decl.riskAndTerms,
    "Declaration: Bound by Offer":  !!decl.boundByOffer,
    "Declaration: Shares Held":     !!decl.heldOnBehalf,
    "Declaration: Allotment":       !!decl.allotmentDiscretion,
    "Declaration: True Info":       !!decl.trueAndAccurate,
    "Signatory Name":               str(sig.name),
    "Signature Date":               str(sig.date),
    "Documents Submitted":          Array.isArray(payload.documents)
                                      ? payload.documents.map((d) => `${str(d.key)}: ${str(d.name)}`).join("\n")
                                      : "",
    "Source":                       str(payload.source) || "Diaspora IPO",
    "Status":                       "New",
  };

  Object.keys(fields).forEach((k) => {
    if (fields[k] === "" || fields[k] === null || fields[k] === undefined) delete fields[k];
  });

  try {
    if (!REF_RE.test(ref)) return json(400, { error: "Invalid reference" });
    const r = await saveApplication("diaspora", TABLE, ref, fields, { airtable: false });
    if (r.exists) return json(409, { error: "This reference has already been submitted" });
    if (!r.saved) return json(502, { error: "Failed to save application", detail: r.detail });
    console.log("diaspora application saved:", ref);
    return json(200, { success: true, reference: ref });
  } catch (err) {
    console.error("Function error:", err);
    return json(500, { error: "Internal server error", detail: err.message });
  }
};

function json(status, body) {
  return { statusCode: status, headers: { "Content-Type": "application/json", ...cors() }, body: JSON.stringify(body) };
}
function cors() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Shared-Secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
