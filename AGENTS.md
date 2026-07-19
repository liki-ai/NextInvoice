# AGENTS.md

## Cursor Cloud specific instructions

NextInvoice is a small npm monorepo with three independent projects (no root `package.json`); run npm commands inside each folder. See `README.md` for the standard run/deploy flow and `landingpage/README.md` for the site.

- `app/` — the core product: an Expo (React Native) invoicing app. Standard scripts in `app/package.json`.
- `server/` — a tiny Express proxy holding the OpenAI key, exposing `/health`, `/api/extract-client`, `/api/extract-company`. Scripts in `server/package.json`.
- `landingpage/` — a Vite + React marketing site (optional; unrelated to app runtime). Scripts in `landingpage/package.json`; lint via `npm run lint` (oxlint).

Non-obvious caveats:

- Server won't boot without a key: `server/src/openaiClient.js` constructs the OpenAI client at import time, so `npm start` crashes if `OPENAI_API_KEY` is unset. Create `server/.env` from `server/.env.example` (git-ignored). A placeholder key lets the server boot and serve `/health`, but the `/api/extract-*` endpoints need a real `OPENAI_API_KEY` (external dependency) to return data.
- The app has no bundled backend/DB — invoices persist locally via AsyncStorage. Manual invoice creation, PDF generation, and sharing all work without the server; only the "AI detect" features call the server.
- Running the app in this headless VM: use the web target, `cd app && npx expo start --web` (serves on `http://localhost:8081`). This requires `react-dom`, `react-native-web`, and `@expo/metro-runtime` (added to `app/package.json`). If those are ever missing, run `npx expo install react-dom react-native-web @expo/metro-runtime`. On web, "Save and generate PDF" opens the browser print dialog instead of a native share sheet.
- To exercise the app's AI feature against the local server on web, open the Profile tab and set "API Base URL" to `http://localhost:4000`.
