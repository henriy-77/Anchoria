/**
 * Anchoria Securities — Account Opening Form Submission Handler
 * Netlify Serverless Function
 *
 * Receives the JSON payload from account-opening.html, validates the
 * shared secret, maps every field to an Airtable record, and creates
 * it via the Airtable REST API.
 *
 * Required Netlify environment variables:
 *   AIRTABLE_TOKEN   — Airtable Personal Access Token (data.records:write scope)
 *   AIRTABLE_BASE_ID — e.g. "appXXXXXXXXXXXXXX"
 *   SHARED_SECRET    — must match the value in account-opening.html
 *
 * Airtable table name: "Applications" (create it per the README schema)
 */

const AIRTABLE_TABLE = "Applications";

exports.handler = async (event) => {
  /* ── CORS preflight ── */
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: cors(),
      body: "",
    };
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

  /* ── Validate shared secret ── */
  const incomingSecret = event.headers["x-shared-secret"] || "";
  if (SHARED_SECRET && incomingSecret !== SHARED_SECRET) {
    return json(401, { error: "Unauthorized" });
  }

  /* ── Parse body ── */
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  /* ── Map form payload → Airtable fields ── */
  const arr  = (v) => (Array.isArray(v) ? v.join(", ") : v || "");
  const str  = (v) => (v == null ? "" : String(v));
  const date = (v) => (v ? v.slice(0, 10) : null); // Airtable expects YYYY-MM-DD

  const decl = payload.declarations || {};
  const sig  = payload.signature    || {};
  const docs = Array.isArray(payload.documents)
    ? payload.documents.map((d) => `${d.key}: ${d.name}`).join("\n")
    : "";

  const products = Array.isArray(payload.products)
    ? payload.products
        .map((p) => `${p.product}: ₦${Number(p.amount || 0).toLocaleString("en-NG")}`)
        .join(", ")
    : "";

  const fields = {
    /* ── Meta ── */
    "Reference":             str(payload.reference),
    "Submitted At":          str(payload.submittedAt),
    "Status":                "New",

    /* ── Personal details ── */
    "Surname":               str(payload.surname),
    "First Name":            str(payload.firstName),
    "Middle Name":           str(payload.middleName),
    "Title":                 str(payload.title),
    "Title Other":           str(payload.titleOther),
    "Sex":                   str(payload.sex),
    "Date of Birth":         date(payload.dob),
    "Nationality":           str(payload.nationality),
    "Marital Status":        str(payload.maritalStatus),
    "State of Origin":       str(payload.stateOfOrigin),
    "LGA":                   str(payload.lga),
    "Maiden Name":           str(payload.maidenName),
    "Mother Maiden Name":    str(payload.motherMaiden),
    "BVN":                   str(payload.bvn),
    "NIN":                   str(payload.nin),
    "TIN":                   str(payload.taxId),

    /* ── Contact ── */
    "Email":                 str(payload.email),
    "Mobile":                str(payload.mobile),
    "Mobile 2":              str(payload.mobile2),
    "Residential Address":   str(payload.residentialAddress),
    "Mailing Address":       str(payload.mailingAddress),

    /* ── Next of kin ── */
    "NOK Name":              str(payload.nokName),
    "NOK Relationship":      str(payload.nokRelationship),
    "NOK Email":             str(payload.nokEmail),
    "NOK Phone":             str(payload.nokPhone),
    "NOK Address":           str(payload.nokAddress),

    /* ── Identification ── */
    "ID Type":               str(payload.idType),
    "ID Number":             str(payload.idNumber),
    "ID Issue Date":         date(payload.idIssue),
    "ID Expiry Date":        date(payload.idExpiry),

    /* ── Financial & investment ── */
    "Occupation":            str(payload.occupation),
    "Nature of Business":    str(payload.natureOfBusiness),
    "Employer":              str(payload.employer),
    "Annual Income":         str(payload.income),
    "Bank Name":             str(payload.bankName),
    "Bank Branch":           str(payload.bankBranch),
    "Account Number":        str(payload.bankAccountNumber),
    "Account Name":          str(payload.bankAccountName),
    "Direct Cash Settlement": str(payload.dcs),
    "Source of Funds":       arr(payload.sourceOfFunds),
    "Source Details":        str(payload.sourceDetails),
    "Country of Funds":      str(payload.countryOfFunds),
    "Investor Category":     arr(payload.investorCategory),
    "Investment Option":     arr(payload.investmentOption),
    "CSCS Number":           str(payload.cscsNumber),
    "CHN":                   str(payload.chn),
    "Referral Source":       str(payload.referralSource),

    /* ── Products & funding ── */
    "Products Selected":     products,

    /* ── Declarations & signature ── */
    "PEP":                   str(payload.pep),
    "PEP Details":           str(payload.pepDetails),
    "All Declarations Accepted": Object.values(decl).every(Boolean),
    "Signed By":             str(sig.name),
    "Signature Date":        str(sig.date),

    /* ── Documents (filenames only — full files are base64 in the payload) ── */
    "Documents Submitted":   docs,

    /* ── Back-office fields (leave blank for staff to fill) ── */
    "Notes":                 "",
  };

  /* Strip null / empty-string fields so Airtable doesn't complain */
  Object.keys(fields).forEach((k) => {
    if (fields[k] === "" || fields[k] === null || fields[k] === undefined) {
      delete fields[k];
    }
  });

  /* ── POST to Airtable ── */
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

    return json(200, {
      success:    true,
      reference:  payload.reference,
      airtableId: result.id,
    });

  } catch (err) {
    console.error("Function error:", err);
    return json(500, { error: "Internal server error", detail: err.message });
  }
};

/* ── Helpers ── */
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
