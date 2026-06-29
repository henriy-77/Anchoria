/**
 * Anchoria Securities — Corporate Account Opening Submission Handler
 * Netlify Serverless Function → Airtable (Corporate Applications table)
 */

const AIRTABLE_TABLE = "Corporate Applications";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(), body: "Method Not Allowed" };
  }

  const AIRTABLE_TOKEN   = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const SHARED_SECRET    = process.env.SHARED_SECRET;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    console.error("Missing AIRTABLE_TOKEN or AIRTABLE_BASE_ID env vars");
    return json(500, { error: "Server misconfiguration — contact admin" });
  }

  const incomingSecret = event.headers["x-shared-secret"] || "";
  if (SHARED_SECRET && incomingSecret !== SHARED_SECRET) {
    return json(401, { error: "Unauthorized" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const str  = (v) => (v == null ? "" : String(v));
  const arr  = (v) => (Array.isArray(v) ? v.join(", ") : v || "");
  const date = (v) => (v ? v.slice(0, 10) : null);

  const ref = str(payload.reference);
  const sig = payload.signature || {};

  // Directors
  const directors = Array.isArray(payload.directors) ? payload.directors : [];
  const dirStr = directors.map((d, i) =>
    `Director ${i + 1}: ${d.name || ""}${d.bvn ? " | BVN: " + d.bvn : ""}${d.nin ? " | NIN: " + d.nin : ""}${d.phone ? " | Phone: " + d.phone : ""}${d.email ? " | Email: " + d.email : ""}`
  ).join("\n");

  // Signatories
  const signatories = Array.isArray(payload.signatories) ? payload.signatories : [];
  const sigStr = signatories.map((s, i) =>
    `Signatory ${i + 1}: ${s.name || ""}${s.title ? " (" + s.title + ")" : ""}${s.mandate ? " | Mandate: " + s.mandate : ""}${s.phone ? " | Phone: " + s.phone : ""}${s.email ? " | Email: " + s.email : ""}`
  ).join("\n");

  const siteUrl = process.env.URL || "https://anchoria-securities-account-opening.netlify.app";

  const fields = {
    "Reference":              ref,
    "Entity Type":            str(payload.entityType),
    "Company Name":           str(payload.companyName),
    "RC Number":              str(payload.rcNumber),
    "Tax ID (TIN)":           str(payload.taxId),
    "Date of Incorporation":  date(payload.incorporationDate),
    "Nature of Business":     str(payload.natureOfBusiness),
    "Registered Address":     str(payload.registeredAddress),
    "Operating Address":      str(payload.operatingAddress),
    "Email":                  str(payload.email),
    "Phone":                  str(payload.phone),
    "Website":                str(payload.website),
    "Directors":              dirStr,
    "Authorized Signatories": sigStr,
    "Bank Name":              str(payload.bankName),
    "Bank Branch":            str(payload.bankBranch),
    "Bank Account Number":    str(payload.bankAccountNumber),
    "Bank Account Name":      str(payload.bankAccountName),
    "DCS / Settlement":       str(payload.dcs),
    "Source of Funds":        arr(payload.sourceOfFunds),
    "Source of Funds Details":str(payload.sourceDetails),
    "Annual Turnover":        str(payload.annualTurnover),
    "Investment Options":     arr(payload.investmentOptions),
    "Referral Source":        str(payload.referralSource),
    "Documents Submitted":    Array.isArray(payload.documents)
                                ? payload.documents.map((d) => `${d.key}: ${d.name}`).join("\n")
                                : "",
    "Document Links":         "",
    "Signatory Name":         str(sig.name),
    "Signature Date":         date(sig.date),
    "View Application":       `${siteUrl}/.netlify/functions/corporate-pdf?ref=${encodeURIComponent(ref)}`,
    "Status":                 "New",
    "Notes":                  "",
  };

  // Strip empty/null fields
  Object.keys(fields).forEach((k) => {
    if (fields[k] === "" || fields[k] === null || fields[k] === undefined) {
      delete fields[k];
    }
  });

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${AIRTABLE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Airtable API error:", res.status, detail);
      return json(502, { error: "Failed to save application", detail });
    }

    const result = await res.json();
    console.log("Corporate application saved:", ref, "→ Airtable", result.id);
    return json(200, { success: true, reference: ref, airtableId: result.id });

  } catch (err) {
    console.error("Function error:", err);
    return json(500, { error: "Internal server error", detail: err.message });
  }
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", ...cors() },
    body: JSON.stringify(body),
  };
}

function cors() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Shared-Secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
