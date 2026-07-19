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
2. Company fields are pre-filled with sample business data on first launch (works offline — recommended for App Review). Either:
   - Edit fields manually, or
   - Tap **Merr të dhënat me AI / Get data with AI** to take a photo, pick a photo, or pick a PDF and auto-fill instead.
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

### E. AI company import from photo or file (optional — needs network)
1. In **Profili**, tap **Merr të dhënat me AI / Get data with AI**.
2. Choose **Bëj foto / Take photo**, **Zgjidh foto / Choose photo**, or **Zgjidh skedar (PDF) / Choose file (PDF)**.
3. A highlighted banner appears above the company fields once extraction succeeds, showing the values were just filled in.
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
1. Profile → company fields are already filled with sample business data by default.
2. New Invoice (Manual) → use default item `Fustan Solemn/ Dress` at `80` → Preview → Share PDF.

**Optional AI path:**
1. The app calls a hosted AI proxy by default (no user-visible URL field; not user-configurable).
2. Use **Load sample client text** then **Detect with AI**, and/or **Get data with AI** with a photo or `docs/sample-invoice.html` printed to PDF, if testing photo/file import.

Bundled reference sample markup: `docs/sample-invoice.html`.

---

## 6. External services, APIs, AI providers

| Service | Used for | Where key lives | Called from |
|--------|----------|-----------------|-------------|
| Node proxy (`server/`), hosted default URL baked into the app | `/api/extract-client`, `/api/extract-company` | Server `.env` only | App only when AI features used |
| OpenAI API | Structured extraction via proxy | `OPENAI_API_KEY` on server — **never in the app** | Server only |
| iOS Share Sheet / Files apps | Sharing generated PDF | N/A | After PDF generate |

**Not used:** analytics SDKs, ads, auth providers, cloud storage SDKs, payments, subscriptions.

The AI server URL is no longer user-configurable in the app; it defaults to the developer's hosted proxy.

---

## 7. Device permissions

| Permission | Requested? | Why |
|-----------|------------|-----|
| Camera (`NSCameraUsageDescription`) | **Yes** | User taps **Bëj foto / Take photo** in **Merr të dhënat me AI / Get data with AI**, to photograph a document for AI extraction |
| Photo Library (`NSPhotoLibraryUsageDescription`) | **Yes** | User taps **Zgjidh foto / Choose photo** in the same flow, to pick an existing photo for AI extraction |
| Microphone / Location / Contacts / Tracking | **No** | Not used |

Permissions are not requested at launch — only when the user taps **Bëj foto** or **Zgjidh foto** inside **Merr të dhënat me AI**. The system document picker (for PDF) does not require a usage string.

Denied / canceled picker or permission: the app continues without crashing (shows an alert for denied camera/photo permission).

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
1. Open Profile — company fields are already pre-filled with sample business data. Tap “Save”.
2. Open New Invoice (Manual).
3. Enter any client name (e.g. Almedina Sadiku).
4. Keep/edit the default item (Fustan Solemn/Dress, 80).
5. Tap “Preview invoice”, then “Save and Share PDF”.
6. Use the iOS share sheet to Save to Files or dismiss.

Optional AI features ("Get data with AI" in Profile, "Detect details with AI" in New Invoice) call a hosted backend (OpenAI key is server-side only, never in the app). For review, AI is not required to demonstrate the core invoice/PDF flow.

Privacy Policy: https://liki-ai.github.io/NextInvoice/privacy-policy.html
Terms of Use: https://liki-ai.github.io/NextInvoice/terms-of-use.html
Support: lirim.sylejmani@tretek.io
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
3. Show company fields already pre-filled with sample data → **Save**.
4. Open **New Invoice** → Manual mode → enter client name/address/phone.
5. Show invoice number `INV-…` and date.
6. Show item, quantity, price; optionally open discount/notes link and set a discount.
7. Show totals.
8. Tap **Preview invoice** → close preview.
9. Tap **Save and Share PDF** → show share sheet → Save to Files or Cancel.
10. (Optional) If testing AI: tap **Get data with AI** → **Take photo** (shows camera permission prompt) or **Choose photo** / **Choose file** → show the highlighted banner confirming the import.
11. Open Profile → tap **Privacy Policy**, **Terms of Use**, **Support**.
12. End recording.

---

## Manual App Store Connect actions (not done by code)

- [ ] Set App Store display name to **Faturimi**
- [ ] Paste Privacy Policy URL (after merging docs to `master` or hosting publicly)
- [ ] Complete App Privacy nutrition labels (data collected: user-entered invoice/company content; camera/photo library access for optional AI import; optional AI transmission to developer server/OpenAI)
- [ ] Confirm encryption export compliance (app sets `ITSAppUsesNonExemptEncryption: false`)
- [ ] Attach demo video for Guideline 2.1 if requested
- [ ] Fill physical device table in section 8 above

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
