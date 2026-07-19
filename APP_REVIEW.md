# Faturimi — App Store Review Notes

**App display name:** Faturimi  
**Bundle ID:** `com.lirim123.nextinvoice` (unchanged)  
**Expo project slug:** `nextinvoice`  
**Version in app.json:** `1.1.0`  
**Last updated:** 2026-07-18

---

## 1. App purpose and target audience

**Faturimi** is a mobile invoicing app for small businesses, freelancers, and studios (for example fashion / boutique businesses). Users create invoices on their phone, optionally fill client details with AI, preview a PDF, and share it via the iOS share sheet.

**Target audience:** Independent sellers, studios, and freelancers who need simple on-device invoices in Albanian or English.

---

## 2. Problem solved and user value

- Create professional invoices without a desktop tool.
- Keep company profile and past invoices on the device.
- Optional AI to speed up filling client/company fields from pasted text or an uploaded PDF/image.
- Preview and share PDF invoices immediately.

---

## 3. Step-by-step: accessing every core feature

### A. Launch and language
1. Open **Faturimi**.
2. Go to the **Profili / Profile** tab.
3. Under **Gjuha / Language**, select **Shqip** or **English**.

### B. Company information
1. Open **Profili / Profile**.
2. Either:
   - Tap **Ngarko të dhëna shembull / Load sample company data** (works offline — recommended for App Review), or
   - Edit company fields manually.
3. Tap **Ruaj / Save**.

### C. Create a new invoice (manual — no account, no AI required)
1. Open the center tab **Fatura e Re / New Invoice**.
2. Keep mode **Manualisht / Manual**.
3. Enter client full name (required), address, phone.
4. Confirm invoice number (format `INV-JUL-001`) and date.
5. Edit the default item (description/qty/price) or add another item via **+ Shto artikull tjetër**.
6. Optional: tap **+ Shto zbritje / shënime** to add discount/notes.
7. Confirm **Nëntotali / Totali**.
8. Tap **Shiko pamjen e faturës** to preview.
9. Tap **Ruaj dhe Shpërndaj PDF** to save locally and open the share sheet.

### D. AI client extract (optional — needs configured AI server)
1. On **Fatura e Re**, choose **Me AI / AI**.
2. Tap **Ngarko tekst shembull klienti / Load sample client text** or paste your own text.
3. Tap **Zbulo të dhënat me AI**.
4. After success, review/edit the revealed form and continue as in section C.

### E. AI company import from file (optional — needs configured AI server)
1. In **Profili**, set **API Base URL** to your deployed Faturimi proxy server.
2. Tap **Importo faturë me AI / Import invoice with AI**.
3. Pick a PDF or image via the system document picker.
4. Review filled company fields and tap **Ruaj**.

### F. Invoice list / detail
1. Open **Faturat / Invoices**.
2. Tap an invoice to preview again, share PDF, or delete.

---

## 4. Login required? Demo credentials?

**No login / registration / accounts.**  
The full main flow works without any user account.

**Demo credentials:** N/A

---

## 5. Sample invoice / sample data instructions

**Primary App Review path (no server):**
1. Profile → **Load sample company data**.
2. New Invoice (Manual) → use default item `Fustan Solemn/ Dress` at `80` → Preview → Share PDF.

**Optional AI path:**
1. Deploy `server/` with `OPENAI_API_KEY` (see repo README).
2. Set API Base URL in Profile.
3. Use **Load sample client text** then **Detect with AI**, and/or import `docs/sample-invoice.html` exported/printed to PDF if testing file import.

Bundled reference sample markup: `docs/sample-invoice.html`.

---

## 6. External services, APIs, AI providers

| Service | Used for | Where key lives | Called from |
|--------|----------|-----------------|-------------|
| User-configured Node proxy (`server/`) | `/api/extract-client`, `/api/extract-company` | Server `.env` only | App only when AI features used |
| OpenAI API | Structured extraction via proxy | `OPENAI_API_KEY` on server — **never in the app** | Server only |
| iOS Share Sheet / Files apps | Sharing generated PDF | N/A | After PDF generate |

**Not used:** analytics SDKs, ads, auth providers, cloud storage SDKs, payments, subscriptions.

**TODO (manual):** Public production API Base URL for reviewers (if AI path should be tested live): `______________________________`

---

## 7. Device permissions

| Permission | Requested? | Why |
|-----------|------------|-----|
| Camera (`NSCameraUsageDescription`) | **No** — removed; unused | App does not use camera |
| Photo Library | **No** explicit usage string — import uses system **document picker** | User picks PDF/image when using optional AI import |
| Microphone / Location / Contacts / Tracking | **No** | Not used |

Permissions are not requested at launch. Document picker is only opened when the user taps **Import invoice with AI**.

Denied / canceled picker: the app continues without crashing.

---

## 8. Physical-device test results (fill in)

| Device | iOS version | Result | Tester | Date |
|--------|-------------|--------|--------|------|
| TODO: e.g. iPhone 15 | TODO: e.g. iOS 18.x | TODO: Pass/Fail | TODO | TODO |
| TODO: iPad (if claimed) | TODO | TODO | TODO | TODO |

`supportsTablet` is currently `true` in `app.json` — verify iPad layout before submission.

---

## 9. Regional feature differences

**None known.** Albanian and English are UI languages only; no geo-restricted features.

**TODO:** Confirm no region-specific App Store pricing/availability beyond standard ASC settings.

---

## 10. Regulated industry / protected third-party content

- **Not** a banking, healthcare, gambling, or other regulated industry app.
- Does **not** embed protected third-party media catalogs, brand trademarks beyond the developer’s own business sample data (Nina Fashion Studio demo content owned/controlled by the developer).

---

## 11. Ready-to-paste App Store Review Notes

```text
App name: Faturimi
Bundle ID: com.lirim123.nextinvoice

No login required. No subscriptions or IAP.

How to test the main flow (offline):
1. Open Profile → tap “Load sample company data” → Save.
2. Open New Invoice (Manual).
3. Enter any client name (e.g. Almedina Sadiku).
4. Keep/edit the default item (Fustan Solemn/Dress, 80).
5. Tap “Preview invoice”, then “Save and Share PDF”.
6. Use the iOS share sheet to Save to Files or dismiss.

Optional AI features require a backend URL in Profile (OpenAI key is server-side only). For review, AI is not required to demonstrate the core invoice/PDF flow.

Privacy Policy: https://liki-ai.github.io/NextInvoice/privacy-policy.html
Terms of Use: https://liki-ai.github.io/NextInvoice/terms-of-use.html
Support: lirim.sylejmani@tretek.io

TODO if AI should be reviewed live — API Base URL: ____________________
```

---

## 12. Physical-device demo video — checklist & script

### Checklist before recording
- [ ] App installed from TestFlight / production build named **Faturimi**
- [ ] Start with app **force-quit / completely closed**
- [ ] Airplane mode optional for proving offline sample path
- [ ] Screen Recording on; do not cover permission dialogs if any appear

### Recording script (speak or on-screen captions)
1. Show Home Screen → tap **Faturimi** (cold launch).
2. Open **Profile** → switch language Shqip ↔ English.
3. Tap **Load sample company data** → show fields filled → **Save**.
4. Open **New Invoice** → Manual mode → enter client name/address/phone.
5. Show invoice number `INV-…` and date.
6. Show item, quantity, price; optionally open discount/notes link and set a discount.
7. Show totals.
8. Tap **Preview invoice** → close preview.
9. Tap **Save and Share PDF** → show share sheet → Save to Files or Cancel.
10. (Optional) If testing AI: set API URL → Import with AI / Detect with AI; if a document picker appears, show it. **Camera is not used.**
11. Open Profile → tap **Privacy Policy**, **Terms of Use**, **Support**.
12. End recording.

---

## Manual App Store Connect actions (not done by code)

- [ ] Set App Store display name to **Faturimi**
- [ ] Paste Privacy Policy URL (after merging docs to `master` or hosting publicly)
- [ ] Complete App Privacy nutrition labels (data collected: user-entered invoice/company content; optional AI transmission to developer server/OpenAI)
- [ ] Confirm encryption export compliance (app sets `ITSAppUsesNonExemptEncryption: false`)
- [ ] Attach demo video for Guideline 2.1 if requested
- [ ] Fill physical device table in section 8 above
- [ ] TODO: Deploy production AI proxy URL if AI features should be live for reviewers

---

## Accounts / payments confirmation

| Feature | Present? |
|---------|----------|
| Registration / login | No |
| Account deletion | N/A (no accounts) |
| Paid features / IAP / subscriptions | No |
| Misleading paywall/login UI | None in app |

---

## Privacy accuracy notes for App Privacy questionnaire

- Invoice & company data stored **on device** (AsyncStorage).
- Optional AI: text/files sent to **user-configured backend**, which may call **OpenAI**.
- Do **not** claim “data never leaves the device” if AI features are enabled.
- No tracking SDKs / ads identified in this codebase.
