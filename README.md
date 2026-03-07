# FoodFlow Connect MVP

FoodFlow Connect is a role-based food rescue web application for providers, NGOs, and consumers. This workspace version is a dependency-free Node MVP backed by SQLite so it can run locally without package installation.

## What is included

- Home page with overview, leaderboards, sign in, sign up, and role-based onboarding.
- Provider dashboard with inventory CRUD, availability controls, provider network view, and a quick trash/donation flow.
- NGO dashboard with listing discovery, category/expiry/distance filters, item request flow, request history, and per-request messaging.
- Consumer dashboard with browse, persistent cart, reserve-only checkout, and reservation history.
- SQLite-backed data model with seeded demo users, listings, requests, messages, reservations, and transactions.

## Run locally

1. Open a terminal in [my_web_app](C:/Users/udayp/.picoclaw/workspace/my_web_app).
2. Start the app with `node server.js`.
3. Open [http://localhost:3000](http://localhost:3000).
4. Optional verification: run `node scripts/smoke-test.js`.

## Deployment

The app supports two Render deployment modes.

- [render.yaml](C:/Users/udayp/.picoclaw/workspace/my_web_app/render.yaml): paid/stable deploy with a persistent disk mounted at `/app/data`
- [render-demo.yaml](C:/Users/udayp/.picoclaw/workspace/my_web_app/render-demo.yaml): free demo deploy with ephemeral storage at `/tmp/foodflow-data`
- [Dockerfile](C:/Users/udayp/.picoclaw/workspace/my_web_app/Dockerfile): container image for both paths
- [server.js](C:/Users/udayp/.picoclaw/workspace/my_web_app/server.js): supports `DATA_DIR` and `DB_PATH` environment overrides

Important:

- The free demo path uses SQLite on ephemeral storage. Demo data can reset on restart, redeploy, or service spin-down.
- The paid path keeps data by mounting a persistent disk.
- To deploy from Render, you still need this project in a Git repo or a Docker image in a registry.
## Demo accounts

- Provider: `provider@freshplate.demo` / `demo12345`
- NGO: `ngo@carebridge.demo` / `demo12345`
- Consumer: `consumer@neighbor.demo` / `demo12345`

## Data model

Primary tables:

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
- [scripts/smoke-test.js](C:/Users/udayp/.picoclaw/workspace/my_web_app/scripts/smoke-test.js): local verification script
- [docs/openapi.yaml](C:/Users/udayp/.picoclaw/workspace/my_web_app/docs/openapi.yaml): lightweight API contract

## Notes

- Consumer checkout is reservation-only; there is no payment flow in this MVP.
- Distance filtering uses latitude/longitude if the user profile and listing both have coordinates.
- The app seeds sample data automatically when the SQLite database is first created.


