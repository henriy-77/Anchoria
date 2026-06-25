/**
 * Anchoria Securities — Account Opening Form Submission Handler
 * Netlify Serverless Function → Airtable
 */

const AIRTABLE_TABLE = "Applications";

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

  const arr  = (v) => (Array.isArray(v) ? v.join(", ") : v || "");
  const str  = (v) => (v == null ? "" : String(v));
  const date = (v) => (v ? v.slice(0, 10) : null);

  const sig  = payload.signature || {};
  const docs = Array.isArray(payload.documents)
    ? payload.documents.map((d) => `${d.key}: ${d.name}`).join("\n")
    : "";

  const products = Array.isArray(payload.products)
    ? payload.products
        .map((p) => `${p.product}: ₦${Number(p.amount || 0).toLocaleString("en-NG")}`)
        .join(", ")
    : "";

  // Field names match Airtable schema exactly
  const fields = {
    "Reference":                str(payload.reference),
    "Surname":                  str(payload.surname),
    "First Name":               str(payload.firstName),
    "Middle Name":              str(payload.middleName),
    "Title":                    str(payload.title),
    "Title (Other)":            str(payload.titleOther),
    "Sex":                      str(payload.sex),
    "Date of Birth":            date(payload.dob),
    "Nationality":              str(payload.nationality),
    "Marital Status":           str(payload.maritalStatus),
    "State of Origin":          str(payload.stateOfOrigin),
    "LGA":                      str(payload.lga),
    "Maiden Name":              str(payload.maidenName),
    "Mother's Maiden Name":     str(payload.motherMaiden),
    "BVN":                      str(payload.bvn),
    "NIN":                      str(payload.nin),
    "Tax ID (TIN)":             str(payload.taxId),
    "Email":                    str(payload.email),
    "Mobile":                   str(payload.mobile),
    "Mobile 2":                 str(payload.mobile2),
    "Residential Address":      str(payload.residentialAddress),
    "Mailing Address":          str(payload.mailingAddress),
    "Next of Kin Name":         str(payload.nokName),
    "Next of Kin Relationship": str(payload.nokRelationship),
    "Next of Kin Email":        str(payload.nokEmail),
    "Next of Kin Phone":        str(payload.nokPhone),
    "Next of Kin Address":      str(payload.nokAddress),
    "ID Type":                  str(payload.idType),
    "ID Number":                str(payload.idNumber),
    "ID Issue Date":            date(payload.idIssue),
    "ID Expiry Date":           date(payload.idExpiry),
    "Occupation":               str(payload.occupation),
    "Nature of Business":       str(payload.natureOfBusiness),
    "Employer":                 str(payload.employer),
    "Annual Income":            str(payload.income),
    "Bank Name":                str(payload.bankName),
    "Bank Branch":              str(payload.bankBranch),
    "Bank Account Number":      str(payload.bankAccountNumber),
    "Bank Account Name":        str(payload.bankAccountName),
    "DCS (Settlement)":         str(payload.dcs),
    "Source of Funds":          arr(payload.sourceOfFunds),
    "Source of Funds Details":  str(payload.sourceDetails),
    "Country of Funds":         str(payload.countryOfFunds),
    "Investor Category":        arr(payload.investorCategory),
    "Investment Option":        arr(payload.investmentOption),
    "CSCS Number":              str(payload.cscsNumber),
    "CHN":                      str(payload.chn),
    "Referral Source":          str(payload.referralSource),
    "Products Selected":        products,
    "PEP":                      str(payload.pep),
    "PEP Details":              str(payload.pepDetails),
    "Signatory Name":           str(sig.name),
    "Signature Date":           date(sig.date),
    "Documents Submitted":      docs,
    "Status":                   "New",
    "Notes":                    "",
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
    console.log("Application saved:", payload.reference, "→ Airtable", result.id);
    return json(200, { success: true, reference: payload.reference, airtableId: result.id });

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
