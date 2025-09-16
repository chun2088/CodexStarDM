# Codex Star DM Starter

A Next.js App Router starter pre-configured with TypeScript, Tailwind CSS, progressive web app capabilities, TanStack Query, and a lightweight auth/session context.

## Getting started

```bash
npm install
npm run dev
```

## Features

- ⚡️ Next.js 15 App Router with TypeScript and Tailwind CSS 4
- 📱 PWA ready via `next-pwa`, including custom runtime caching and an offline fallback route
- 🔄 TanStack Query with sensible defaults for server state management
- 🔐 React context for managing auth/session data with optional persistence
- 💳 Toss Payments billing integration with invite-based store onboarding

## Environment variables

The billing endpoints rely on Toss Payments credentials. Configure the following variables in your runtime environment:

- `TOSS_SECRET_KEY` (required) — Toss Payments secret key used for server-to-server requests.
- `TOSS_API_BASE_URL` (optional) — Override the Toss API base URL; defaults to `https://api.tosspayments.com`.
