# iOS publish reference (App Store Connect)

Saved from prior TestFlight setup work (branch `cursor/fix-ios-testflight-white-screen-b8f3`) so future
"publish to iOS" requests already have the data needed, without hunting through history again.

## App identity

- **App name (app.json):** NextInvoice
- **Bundle ID:** `com.lirim123.nextinvoice`
- **Expo project slug:** `nextinvoice`
- **Expo project ID (`extra.eas.projectId`):** `ac954ef6-cf98-46bc-8811-41ae697dc89d`
- **Expo owner account:** `lirim123`
- **App Store Connect App ID (`ascAppId`):** `6792242040` — configured in `app/eas.json` under
  `submit.production.ios.ascAppId`, so `eas submit --platform ios` targets the right ASC app record.

## What's already wired up in `app/eas.json` / `app/app.json` / `app/package.json`

- `eas.json`: `build.production.ios.resourceClass = m-medium`, `submit.production.ios.ascAppId` set.
- `app.json`: `ITSAppUsesNonExemptEncryption: false` (avoids an App Store Connect export-compliance prompt).
- `babel.config.js` + `babel-preset-expo` dependency — required or EAS Build's "Bundle JavaScript" phase fails.
- `react-native-gesture-handler` dependency + `GestureHandlerRootView` wrapper in `App.js` — React Navigation
  needs this in standalone/TestFlight builds (Expo Go bundles it for free, standalone builds don't); missing it
  previously caused a white screen on launch.
- `@expo/vector-icons` pinned to `15.0.3` with an `expo-font: ~14.0.12` override — newer `@expo/vector-icons`
  pulls an incompatible `expo-font` on Expo SDK 54 that crashes at launch.

## Still required before an actual publish can run (not available in this environment)

- `EXPO_TOKEN` (or interactive `eas login`) for the `lirim123` Expo account.
- Apple credentials for code signing + submission: either an App Store Connect API key
  (`ASC_API_KEY_ID`, `ASC_API_KEY_ISSUER_ID`, `.p8` key) or an Apple ID + app-specific password + Apple Team ID.

Once those secrets are added (Cursor Dashboard → Cloud Agents → Secrets), publish from `app/`:

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production --latest
```

(`npm run build:ios` / `npm run submit:ios` are shortcuts for the same two commands.)

## App Store Connect review notes (reusable, adjust if features change)

```text
App name: NextInvoice
Bundle ID: com.lirim123.nextinvoice

No login required. No subscriptions or IAP.

How to test the main flow (offline):
1. Open Profile — company fields are pre-filled with sample business data. Tap "Save".
2. Open New Invoice (Manual).
3. Enter any client name.
4. Keep/edit the default item, then confirm totals.
5. Tap "Preview invoice", then "Save and Share PDF".
6. Use the iOS share sheet to save to Files or dismiss.

Optional AI features call a hosted backend proxy; the OpenAI key is server-side only, never in the app.
AI is not required to demonstrate the core invoice/PDF flow.
```

Manual App Store Connect steps that can't be automated from code:
- Confirm App Privacy nutrition labels (invoice/company data stored on device; optional AI text/file upload).
- Attach Privacy Policy / Terms of Use URLs once hosted.
- Confirm encryption export compliance answer matches `ITSAppUsesNonExemptEncryption: false`.
