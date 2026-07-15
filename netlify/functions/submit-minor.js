/**
 * Anchoria Securities — Minor Account Opening Submission Handler
 * Netlify Serverless Function → Airtable ("Minor Applications")
 * The guardian is the KYC subject; documents & signature are uploaded
 * separately via upload-document (routed to "Minor Applications" by the
 * MINOR- reference prefix).
 */

const AIRTABLE_TABLE = "Minor Applications";

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
  const date = (v) => (v ? String(v).slice(0, 10) : null);
  const sig  = payload.signature || {};
  const decl = payload.declarations || {};
  const ref  = str(payload.reference);

  const fields = {
    "Reference":                    ref,
    // Minor
    "Minor Surname":                str(payload.minorSurname),
    "Minor First Name":             str(payload.minorFirstName),
    "Minor Middle Name":            str(payload.minorMiddleName),
    "Minor Title":                  str(payload.minorTitle),
    "Minor Gender":                 str(payload.minorSex),
    "Minor Date of Birth":          date(payload.minorDob),
    "Minor Nationality":            str(payload.minorNationality),
    "Minor State of Origin":        str(payload.minorStateOfOrigin),
    "Minor LGA":                    str(payload.minorLga),
    // Guardian
    "Guardian Surname":             str(payload.surname),
    "Guardian First Name":          str(payload.firstName),
    "Guardian Middle Name":         str(payload.middleName),
    "Guardian Title":               str(payload.titleOther || payload.title),
    "Guardian Gender":              str(payload.sex),
    "Guardian Date of Birth":       date(payload.dob),
    "Guardian Nationality":         str(payload.nationality),
    "Guardian Marital Status":      str(payload.maritalStatus),
    "Guardian State of Origin":     str(payload.stateOfOrigin),
    "Guardian LGA":                 str(payload.lga),
    "Guardian Mother's Maiden Name":str(payload.motherMaiden),
    "Guardian BVN":                 str(payload.bvn),
    "Guardian NIN":                 str(payload.nin),
    "Guardian Tax ID":              str(payload.taxId),
    "Guardian ID Type":             str(payload.idType),
    "Guardian ID Number":           str(payload.idNumber),
    "Guardian ID Issue Date":       date(payload.idIssue),
    "Guardian ID Expiry Date":      date(payload.idExpiry),
    // Contact
    "Residential Address":          str(payload.residentialAddress),
    "Mailing Address":              str(payload.mailingAddress),
    "Email":                        str(payload.email),
    "Mobile":                       str(payload.mobile),
    "Mobile 2":                     str(payload.mobile2),
    "Next of Kin Name":             str(payload.nokName),
    "Next of Kin Relationship":     str(payload.nokRelationship),
    "Next of Kin Email":            str(payload.nokEmail),
    "Next of Kin Phone":            str(payload.nokPhone),
    "Next of Kin Address":          str(payload.nokAddress),
    // Financial & bank
    "Occupation":                   str(payload.occupation),
    "Nature of Business":           str(payload.natureOfBusiness),
    "Employer":                     str(payload.employer),
    "Annual Income":                str(payload.income),
    "Bank Name":                    str(payload.bankName),
    "Bank Branch":                  str(payload.bankBranch),
    "Bank Account Number":          str(payload.bankAccountNumber),
    "Bank Account Name":            str(payload.bankAccountName),
    "DCS (Settlement)":             str(payload.dcs),
    "PEP":                          str(payload.pep),
    "PEP Details":                  str(payload.pepDetails),
    // Declarations
    "Declaration: True Info":       !!decl.accurateAndTrue,
    "Declaration: Terms":           !!decl.termsAndConditions,
    "Declaration: Indemnity":       !!decl.indemnityMandate,
    "Declaration: Risk":            !!decl.riskDisclosure,
    "Declaration: Privacy":         !!decl.privacyConsent,
    "Signatory Name":               str(sig.name),
    "Signature Date":               str(sig.date),
    "Documents Submitted":          Array.isArray(payload.documents)
                                      ? payload.documents.map((d) => `${d.key}: ${d.name}`).join("\n")
                                      : "",
    "View Application":             `https://onboard.anchoriaonline.com/.netlify/functions/minor-pdf?ref=${encodeURIComponent(ref)}`,
    "Status":                       "New",
  };

  // Strip empty/null fields
  Object.keys(fields).forEach((k) => {
    if (fields[k] === "" || fields[k] === null || fields[k] === undefined) delete fields[k];
  });

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error("Airtable API error:", res.status, detail);
      return json(502, { error: "Failed to save application", detail });
    }
    const result = await res.json();
    console.log("Minor application saved:", ref, "→ Airtable", result.id);
    return json(200, { success: true, reference: ref, airtableId: result.id });
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
