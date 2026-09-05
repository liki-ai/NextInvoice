# Next Invoice

**Fatura profesionale, direkt nga telefoni.**

Create, preview, and share invoices from your phone or the web — built for freelancers, studios, and small businesses. The UI is Albanian by default, with English one tap away.

Live site: [mynextinvoice.com](https://mynextinvoice.com)

## What’s in this repo

| Folder | What it is |
|--------|------------|
| [`faturimiapp/app/`](faturimiapp/app/) | Mobile app (iOS) — Expo 54, React Native |
| [`faturimiapp/server/`](faturimiapp/server/) | Node/Express proxy for AI extraction (OpenAI key stays server-side) |
| [`landingpage/`](landingpage/) | Marketing site — Vite, React, TypeScript, Tailwind |
| [`docs/`](docs/) | Published GitHub Pages build for [mynextinvoice.com](https://mynextinvoice.com) |

## Features

- Manual invoicing or AI fill from pasted client text
- Line items, discounts, notes, and monthly numbers like `INV-JUL-001`
- PDF preview and share (email, WhatsApp, Files)
- Company profile extracted once from a sample invoice
- Bilingual UI: Shqip / English
- Core invoice and PDF flow works offline; AI is optional

## Quick start

### AI proxy server

```bash
cd faturimiapp/server
npm install
cp .env.example .env   # then set OPENAI_API_KEY
npm start
```

Listens on `http://localhost:4000` (`/health`, `/api/auth/*`, `/api/invoices`, `/api/profile`, `/api/extract-client`, `/api/extract-company`). Set `JWT_SECRET` in `.env` for web accounts.

### Mobile app

```bash
cd faturimiapp/app
npm install
npx expo start
```

In the **Profile** tab, set API Base URL to your server (`http://<LAN-IP>:4000` on a physical device).

See [faturimiapp/README.md](faturimiapp/README.md) for emulator URLs, deploy notes, and how the extract endpoints work.

### Landing page

```bash
cd landingpage
npm install
npm run dev
# http://localhost:5180
```

## Stack

- **Mobile:** Expo, React Native, React Navigation, expo-print / expo-sharing
- **Web:** Vite, React 19, Tailwind, Framer Motion
- **Backend:** Express + OpenAI structured outputs (client and company extraction)
