# Anchoria Securities — Online Account Opening Form

Static, self-contained HTML/CSS/JS page. No framework, no build step, no dependencies.

---

## Quick start

### Option A — Direct link ("Open an account" button)

Upload `account-opening.html` to any static host (AWS S3, Azure Blob, Netlify, GitHub Pages, etc.) and point your CTA button at it:

```html
<a href="https://your-host.com/account-opening.html">Open an account</a>
```

### Option B — Embedded iframe

```html
<iframe
  src="https://your-host.com/account-opening.html"
  title="Open an Anchoria account"
  style="width:100%;height:800px;border:none;"
  allow="camera"
  loading="lazy">
</iframe>
```

The page is fully responsive (mobile-first below 880 px) so an iframe works well in a full-page lightbox or a dedicated `/open-account` route.

---

## Wiring up the backend (Power Automate / Microsoft 365)

### 1. Create the Power Automate HTTP trigger

1. In Power Automate, create a new **Instant cloud flow** → trigger: **When an HTTP request is received**.
2. Set the **Request Body JSON Schema** to the schema in the next section.
3. Note the **HTTP POST URL** generated after you save.
4. Add your actions: send an email notification, write to SharePoint, Teams message, etc.

### 2. Set the constants in `account-opening.html`

Open the file and locate the two constants near the top of the `<script>` block (search for `BACKEND WIRING`):

```js
var ENDPOINT_URL  = "";   // ← paste your Power Automate HTTP trigger URL here
var SHARED_SECRET = "";   // ← set a random string (≥ 32 chars), also configure on the flow side
```

### 3. Uncomment the fetch() call

In `submitApplication()`, remove the demo `setTimeout` block and uncomment the `fetch()` block:

```js
fetch(ENDPOINT_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Shared-Secret": SHARED_SECRET   // validate this header in your PA flow
  },
  body: JSON.stringify(payload)
})
```

On the Power Automate side, add a **Condition** step that checks `triggerOutputs()?['headers']?['X-Shared-Secret']` equals your secret value; if not, return HTTP 401 and terminate the flow.

### 4. Remove the demo payload viewer

In the success screen HTML, delete (or comment out) the `<details class="payload">` block before going live.

---

## Payload JSON schema

This is the exact object `submitApplication()` POSTs to `ENDPOINT_URL`.

```jsonc
{
  // ── Meta ──────────────────────────────────────────────
  "reference":    "ASL-XXXXXX",        // string — unique application ID
  "submittedAt":  "2025-01-15T10:32:00.000Z",  // ISO 8601 UTC
  "sharedSecret": "",                  // string — matches SHARED_SECRET constant

  // ── Step 1: Personal details ──────────────────────────
  "surname":        "Okonkwo",
  "firstName":      "Adaeze",
  "middleName":     "Grace",
  "title":          "Mrs",             // Mr | Mrs | Ms | Dr | Other
  "titleOther":     "",                // filled when title === "Other"
  "sex":            "Female",          // Male | Female
  "dob":            "1990-04-22",      // YYYY-MM-DD
  "nationality":    "Nigerian",
  "maritalStatus":  "Married",         // Single | Married | Divorced | Widowed
  "stateOfOrigin":  "Anambra",
  "lga":            "Onitsha North",
  "maidenName":     "",
  "motherMaiden":   "Eze",
  "bvn":            "12345678901",     // exactly 11 digits
  "nin":            "98765432100",     // exactly 11 digits (optional)
  "taxId":          "",

  // ── Step 2: Contact & next of kin ────────────────────
  "residentialAddress": "24 Broad Street, Lagos Island, Lagos",
  "mailingAddress":     "",
  "email":              "adaeze@example.com",
  "mobile":             "08030000000",
  "mobile2":            "",
  "nokName":            "Emeka Okonkwo",
  "nokRelationship":    "Spouse",
  "nokEmail":           "emeka@example.com",
  "nokPhone":           "08031111111",
  "nokAddress":         "24 Broad Street, Lagos Island, Lagos",

  // ── Step 3: Identification ───────────────────────────
  "idType":    "International Passport",   // or National ID Card | Driver's Licence | INEC Voter's Card
  "idNumber":  "A12345678",
  "idIssue":   "2018-06-01",               // YYYY-MM-DD; empty if not entered
  "idExpiry":  "2028-05-31",

  // ── Step 4: Financial & investment ───────────────────
  "occupation":          "Financial Analyst",
  "natureOfBusiness":    "Capital Markets",
  "employer":            "ABC Asset Management, 10 Marina, Lagos",
  "income":              "₦10M – ₦25M",
  "bankName":            "Zenith Bank",
  "bankBranch":          "Marina",
  "bankAccountNumber":   "2012345678",    // exactly 10 digits (NUBAN)
  "bankAccountName":     "Adaeze Grace Okonkwo",
  "dcs":                 "Yes",           // Yes | No
  "countryOfFunds":      "Nigeria",
  "sourceOfFunds":       ["Employment","Business activities"],   // array
  "sourceDetails":       "Salary and consulting fees",
  "investorCategory":    ["Retail","Local"],                     // array
  "investmentOption":    ["NGX"],                                // array
  "cscsNumber":          "",
  "chn":                 "",
  "referralSource":      "Referral",

  // ── Step 5: Products & funding ───────────────────────
  "products": [
    {
      "product": "securities",    // matches PRODUCTS[].key in the JS
      "amount":  "500000"         // raw numeric string (Naira, no commas)
    }
  ],

  // ── Step 6: Declarations & signature ─────────────────
  "declarations": {
    "accurateAndTrue":     true,
    "termsAndConditions":  true,
    "indemnityMandate":    true,
    "riskDisclosure":      true,
    "privacyConsent":      true
  },
  "pep":        "No",            // No | Yes
  "pepDetails": "",              // free text when pep === "Yes"
  "signature": {
    "name":  "Adaeze Grace Okonkwo",
    "date":  "22 January 2025",
    "image": "data:image/png;base64,iVBORw0KGgo…"  // full PNG data-URL
  },

  // ── Documents (base64-encoded files) ─────────────────
  "documents": [
    {
      "key":  "passportPhoto",     // passportPhoto | validId | proofOfAddress | residencePermit
      "name": "passport.jpg",
      "type": "image/jpeg",
      "data": "data:image/jpeg;base64,/9j/4AAQSkZJRg…"  // full data-URL
    },
    {
      "key":  "validId",
      "name": "national_id.pdf",
      "type": "application/pdf",
      "data": "data:application/pdf;base64,JVBERi0x…"
    },
    {
      "key":  "proofOfAddress",
      "name": "utility_bill.pdf",
      "type": "application/pdf",
      "data": "data:application/pdf;base64,JVBERi0x…"
    }
    // residencePermit only present for non-Nigerian nationals
  ]
}
```

### Notes for the Power Automate flow

| Field | PA expression |
|---|---|
| Applicant full name | `concat(triggerBody()?['firstName'], ' ', triggerBody()?['surname'])` |
| Reference | `triggerBody()?['reference']` |
| Email | `triggerBody()?['email']` |
| Signature PNG | `triggerBody()?['signature']?['image']` (base64 data-URL) |
| First document data | `triggerBody()?['documents']?[0]?['data']` |

To save documents to SharePoint, use **Create file** with the `data` field value passed through `base64ToBinary()` (strip the `data:…;base64,` prefix first with `split(…)[1]`).

---

## Adding / changing ENDPOINT_URL and SHARED_SECRET

Both constants live in a single clearly-commented block at the very top of the `<script>` element in `account-opening.html`:

```js
var ENDPOINT_URL  = "";   // ← your Power Automate URL
var SHARED_SECRET = "";   // ← pre-shared key
```

If you need to rotate the secret, update both the HTML and your Power Automate condition check simultaneously to avoid a gap.

---

## NDPA / PII handling notes

The form collects **Category A (general) personal data** including BVN, NIN, photographs, and financial information — all regulated under the **Nigeria Data Protection Act 2023**.

**Minimum required controls before go-live:**

1. **TLS only** — serve the page and the Power Automate endpoint over HTTPS exclusively; never HTTP.
2. **No public URL for the payload** — the HTTP trigger URL must not be shared publicly; treat it as a secret.
3. **Restrict SharePoint/OneDrive folder** — limit access to the back-office team members who need it for account onboarding; disable link sharing.
4. **Retention policy** — define and document a retention period for completed applications (e.g. 7 years per SEC requirements); configure auto-deletion or archiving in SharePoint after that period.
5. **Right to access / erasure** — ensure a process exists to locate and delete a person's data on request, as required by NDPA s.34-35.
6. **Remove the demo payload viewer** — the `<details class="payload">` block in the success screen prints the full payload to the page; delete it before going live.
7. **Audit log** — enable Power Automate run history retention and SharePoint audit logging so you have a record of who accessed submitted data.
8. **Privacy notice** — ensure your website's privacy notice (linked from the form's consent checkbox) describes this processing, including the lawful basis, data categories, and recipients.

> **This form does not store any data in the browser** (no `localStorage`, no cookies). All data exists only in the browser's memory for the duration of the session and is transmitted once to your configured endpoint on submission.
