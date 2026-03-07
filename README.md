# FoodFlow Connect MVP

FoodFlow Connect is a role-based food rescue web application for providers, NGOs, and consumers. This workspace includes both a dependency-free Node + SQLite app for local/full demos and a static GitHub Pages demo that runs entirely in the browser with seeded local data.

## What is included

- Home page with overview, leaderboards, sign in, sign up, and role-based onboarding.
- Provider dashboard with inventory CRUD, availability controls, provider network view, and a quick trash/donation flow.
- NGO dashboard with listing discovery, category/expiry/distance filters, item request flow, request history, and per-request messaging.
- Consumer dashboard with browse, persistent cart, reserve-only checkout, and reservation history.
- SQLite-backed local app with seeded demo users, listings, requests, messages, reservations, and transactions.
- GitHub Pages demo bundle under [docs](C:/Users/udayp/.picoclaw/workspace/my_web_app/docs) that uses browser `localStorage` instead of the backend.

## Run locally

1. Open a terminal in [my_web_app](C:/Users/udayp/.picoclaw/workspace/my_web_app).
2. Start the app with `node server.js`.
3. Open [http://localhost:3000](http://localhost:3000).
4. Optional verification: run `node scripts/smoke-test.js`.

## GitHub Pages demo

The static Pages build is generated into [docs](C:/Users/udayp/.picoclaw/workspace/my_web_app/docs) and can be published directly from GitHub.

Build or refresh it locally:

- Run `npm run build:pages`

How it works:

- [scripts/build-gh-pages.js](C:/Users/udayp/.picoclaw/workspace/my_web_app/scripts/build-gh-pages.js) replaces the frontend `api()` layer with a browser-only demo API.
- [docs/app.js](C:/Users/udayp/.picoclaw/workspace/my_web_app/docs/app.js) stores demo users, items, requests, carts, and reservations in `localStorage`.
- [docs/index.html](C:/Users/udayp/.picoclaw/workspace/my_web_app/docs/index.html) includes a reset button that clears demo data.

Publish on GitHub Pages:

1. Open your repo on GitHub.
2. Go to `Settings` > `Pages`.
3. Under `Build and deployment`, choose `Deploy from a branch`.
4. Select branch `codex/deploy`.
5. Select folder `/docs`.
6. Click `Save`.
7. Wait for GitHub Pages to publish the site.
8. Open the generated `https://<username>.github.io/<repo>/` URL.

GitHub Pages demo limits:

- No backend runs on Pages; all data is browser-local demo data.
- Changes persist only in that browser until the user clears storage or clicks `Reset demo`.
- Demo data is not shared across devices or users.

## Render deployment

The app also supports two Render deployment modes for the Node server build.

- [render.yaml](C:/Users/udayp/.picoclaw/workspace/my_web_app/render.yaml): paid/stable deploy with a persistent disk mounted at `/app/data`
- [render-demo.yaml](C:/Users/udayp/.picoclaw/workspace/my_web_app/render-demo.yaml): free demo deploy with ephemeral storage at `/tmp/foodflow-data`
- [Dockerfile](C:/Users/udayp/.picoclaw/workspace/my_web_app/Dockerfile): container image for both paths
- [server.js](C:/Users/udayp/.picoclaw/workspace/my_web_app/server.js): supports `DATA_DIR` and `DB_PATH` environment overrides

Important:

- The free Render demo path uses SQLite on ephemeral storage. Demo data can reset on restart, redeploy, or service spin-down.
- The paid Render path keeps data by mounting a persistent disk.
- To deploy on Render, you still need this project in a Git repo or a Docker image in a registry.

## Demo accounts

- Provider: `provider@freshplate.demo` / `demo12345`
- NGO: `ngo@carebridge.demo` / `demo12345`
- Consumer: `consumer@neighbor.demo` / `demo12345`

## Data model

Primary tables in the Node app:

- `users`: shared auth and profile fields for all three roles
- `items`: provider inventory and public/donation listings
- `ngo_requests`: NGO claim workflow and pickup status
- `messages`: coordination thread attached to a request
- `cart_items`: persistent consumer cart
- `reservations`: consumer reserve-and-collect workflow
- `transactions`: completed impact records for leaderboards
- `sessions`: cookie-backed login sessions

## Files

- [server.js](C:/Users/udayp/.picoclaw/workspace/my_web_app/server.js): HTTP server, SQLite schema, seed data, API routes
- [public/app.js](C:/Users/udayp/.picoclaw/workspace/my_web_app/public/app.js): frontend routing, data fetching, form handlers
- [public/styles.css](C:/Users/udayp/.picoclaw/workspace/my_web_app/public/styles.css): responsive UI styling
- [scripts/build-gh-pages.js](C:/Users/udayp/.picoclaw/workspace/my_web_app/scripts/build-gh-pages.js): static GitHub Pages demo builder
- [scripts/smoke-test.js](C:/Users/udayp/.picoclaw/workspace/my_web_app/scripts/smoke-test.js): local verification script
- [docs/openapi.yaml](C:/Users/udayp/.picoclaw/workspace/my_web_app/docs/openapi.yaml): lightweight API contract

## Notes

- Consumer checkout is reservation-only; there is no payment flow in this MVP.
- Distance filtering uses latitude/longitude if the user profile and listing both have coordinates.
- The Node app seeds sample data automatically when the SQLite database is first created.
