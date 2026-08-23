"use strict";

// Integration test suite for the FoodFlow Connect HTTP API.
//
// Uses Node's built-in test runner (node:test) -- no external test
// dependencies, matching the rest of this project's dependency-free
// philosophy. Each test file gets its own isolated SQLite database via the
// DATA_DIR environment override (see server.js), so tests never touch the
// developer's real `data/` directory and can run in parallel-safe isolation.
//
// Run with: npm test  (or: node --test tests/)

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Windows keeps a lock on SQLite files while their handles are open, so
// removing the temp directory can fail with EPERM even though every test
// has finished. The OS reclaims its own temp space, so a failed cleanup is
// not worth failing the run over; anything else still propagates.
function removeTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    if (err.code !== "EPERM") throw err;
  }
}

let createAppServer;
let server;
let baseUrl;
let tempDataDir;

test.before(async () => {
  tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "foodflow-test-"));
  process.env.DATA_DIR = tempDataDir;
  process.env.DB_PATH = path.join(tempDataDir, "test.sqlite");

  // Require after setting env vars so server.js picks up the isolated paths.
  delete require.cache[require.resolve("../server")];
  ({ createAppServer } = require("../server"));

  server = createAppServer();
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  removeTempDir(tempDataDir);
});

// --- helpers ---------------------------------------------------------------

function extractCookie(response) {
  const raw = response.headers.get("set-cookie");
  return raw ? raw.split(";")[0] : null;
}

async function api(pathname, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.cookie = cookie;

  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, payload, cookie: extractCookie(response) };
}

async function registerAndLogin(role, overrides = {}) {
  const email = `${role}-${Math.random().toString(36).slice(2, 10)}@test.local`;
  const body = Object.assign(
    {
      role,
      email,
      password: "testpass123",
      displayName: `Test ${role}`,
      contactName: "Test Contact",
      phone: "+91 90000 00000",
      address: "Test Address, Bengaluru",
      businessType: role === "provider" ? "restaurant" : undefined,
      certificateUrl: ["provider", "ngo"].includes(role) ? "https://example.com/cert.pdf" : undefined,
      latitude: 12.93,
      longitude: 77.61
    },
    overrides
  );

  const registerResponse = await api("/api/auth/register", { method: "POST", body });
  assert.equal(registerResponse.status, 201, `registration failed: ${JSON.stringify(registerResponse.payload)}`);
  return { user: registerResponse.payload.user, cookie: registerResponse.cookie, email };
}

// --- health / auth -----------------------------------------------------

test("GET /api/health reports ok", async () => {
  const { status, payload } = await api("/api/health");
  assert.equal(status, 200);
  assert.equal(payload.ok, true);
});

test("registration rejects a short password", async () => {
  const { status, payload } = await api("/api/auth/register", {
    method: "POST",
    body: { role: "consumer", email: "short@test.local", password: "abc", displayName: "X", phone: "1", address: "A" }
  });
  assert.equal(status, 400);
  assert.match(payload.error, /8 characters/);
});

test("registration rejects a duplicate email", async () => {
  const { user, email } = await registerAndLogin("consumer");
  const { status, payload } = await api("/api/auth/register", {
    method: "POST",
    body: { role: "consumer", email, password: "testpass123", displayName: "Dup", phone: "1", address: "A" }
  });
  assert.equal(status, 409);
  assert.match(payload.error, /already exists/);
  assert.ok(user.id);
});

test("login with wrong password is rejected, correct password succeeds", async () => {
  const { email } = await registerAndLogin("consumer");

  const bad = await api("/api/auth/login", { method: "POST", body: { email, password: "wrong-password" } });
  assert.equal(bad.status, 401);

  const good = await api("/api/auth/login", { method: "POST", body: { email, password: "testpass123" } });
  assert.equal(good.status, 200);
  assert.equal(good.payload.user.email, email);
});

test("GET /api/auth/me reflects session state", async () => {
  const anon = await api("/api/auth/me");
  assert.equal(anon.payload.user, null);

  const { cookie, user } = await registerAndLogin("ngo");
  const me = await api("/api/auth/me", { cookie });
  assert.equal(me.payload.user.id, user.id);
});

// --- item CRUD (provider) -----------------------------------------------

test("provider can create, list, update, and status-patch an item", async () => {
  const { cookie } = await registerAndLogin("provider");

  const create = await api("/api/items", {
    method: "POST",
    cookie,
    body: {
      name: "Test Rice Packets",
      category: "Grains",
      quantityAvailable: 10,
      unit: "packs",
      listingType: "donation",
      audience: "ngo",
      isPacked: true
    }
  });
  assert.equal(create.status, 201);
  const itemId = create.payload.item.id;
  assert.equal(create.payload.item.status, "available");

  const list = await api("/api/items?scope=mine", { cookie });
  assert.equal(list.status, 200);
  assert.ok(list.payload.items.some((item) => item.id === itemId));

  const update = await api(`/api/items/${itemId}`, {
    method: "PUT",
    cookie,
    body: { name: "Test Rice Packets (Updated)", quantityAvailable: 8 }
  });
  assert.equal(update.status, 200);
  assert.equal(update.payload.item.name, "Test Rice Packets (Updated)");
  assert.equal(update.payload.item.quantityAvailable, 8);

  const patch = await api(`/api/items/${itemId}/status`, { method: "PATCH", cookie, body: { status: "archived" } });
  assert.equal(patch.status, 200);
  assert.equal(patch.payload.status, "archived");
});

test("a consumer cannot create items (role-gated)", async () => {
  const { cookie } = await registerAndLogin("consumer");
  const response = await api("/api/items", {
    method: "POST",
    cookie,
    body: { name: "Should fail", category: "Grains", quantityAvailable: 1, unit: "packs" }
  });
  assert.equal(response.status, 403);
});

// --- NGO request workflow ------------------------------------------------

test("ngo can request an item and the provider can approve it, creating a transaction", async () => {
  const provider = await registerAndLogin("provider");
  const ngo = await registerAndLogin("ngo");

  const item = await api("/api/items", {
    method: "POST",
    cookie: provider.cookie,
    body: {
      name: "Donation Batch",
      category: "Prepared Food",
      quantityAvailable: 20,
      unit: "boxes",
      listingType: "donation",
      audience: "ngo"
    }
  });
  const itemId = item.payload.item.id;

  const request = await api("/api/requests", {
    method: "POST",
    cookie: ngo.cookie,
    body: { itemId, quantity: 5, pickupWindowStart: new Date(Date.now() + 3600000).toISOString() }
  });
  assert.equal(request.status, 201);
  const requestId = request.payload.request.id;
  assert.equal(request.payload.request.status, "pending");

  const approve = await api(`/api/requests/${requestId}`, {
    method: "PATCH",
    cookie: provider.cookie,
    body: { status: "approved" }
  });
  assert.equal(approve.status, 200);
  assert.equal(approve.payload.request.status, "approved");

  const deliver = await api(`/api/requests/${requestId}`, {
    method: "PATCH",
    cookie: provider.cookie,
    body: { status: "delivered" }
  });
  assert.equal(deliver.status, 200);
  assert.equal(deliver.payload.request.status, "delivered");

  const leaderboards = await api("/api/leaderboards");
  const providerEntry = leaderboards.payload.providerLeaderboard.find((row) => row.id === provider.user.id);
  assert.ok(providerEntry, "provider should now appear on the leaderboard after a delivered donation");
});

// --- consumer cart -> checkout -> reservation ----------------------------

test("consumer can add to cart, checkout, and collect a reservation", async () => {
  const provider = await registerAndLogin("provider");
  const consumer = await registerAndLogin("consumer");

  const item = await api("/api/items", {
    method: "POST",
    cookie: provider.cookie,
    body: {
      name: "Discounted Bread",
      category: "Bakery",
      quantityAvailable: 15,
      unit: "loaves",
      listingType: "sale",
      audience: "consumer",
      pricePerUnit: 20
    }
  });
  const itemId = item.payload.item.id;

  const addToCart = await api("/api/cart/items", { method: "POST", cookie: consumer.cookie, body: { itemId, quantity: 3 } });
  assert.equal(addToCart.status, 200);

  const checkout = await api("/api/reservations/checkout", { method: "POST", cookie: consumer.cookie, body: {} });
  assert.equal(checkout.status, 201);
  assert.ok(checkout.payload.reservations.length >= 1);
  const reservationId = checkout.payload.reservations[0].id;

  const collect = await api(`/api/reservations/${reservationId}`, {
    method: "PATCH",
    cookie: consumer.cookie,
    body: { status: "collected" }
  });
  assert.equal(collect.status, 200);
  assert.equal(collect.payload.reservation.status, "collected");
});

// --- impact analytics, ML, and expiry automation --------------------------

test("GET /api/analytics/impact returns a well-shaped payload for any logged-in role", async () => {
  const { cookie } = await registerAndLogin("consumer");
  const { status, payload } = await api("/api/analytics/impact", { cookie });
  assert.equal(status, 200);
  assert.ok("totalUnitsSaved" in payload.totals);
  assert.ok("estimatedKgSaved" in payload.totals);
  assert.ok("estimatedCo2SavedKg" in payload.totals);
  assert.ok(Array.isArray(payload.trend));
  assert.ok(Array.isArray(payload.categoryBreakdown));
});

test("GET /api/analytics/impact requires authentication", async () => {
  const { status } = await api("/api/analytics/impact");
  assert.equal(status, 401);
});

test("GET /api/ml/waste-risk is provider-only and scores active listings", async () => {
  const provider = await registerAndLogin("provider");
  const ngo = await registerAndLogin("ngo");

  await api("/api/items", {
    method: "POST",
    cookie: provider.cookie,
    body: { name: "Risk Test Item", category: "Prepared Food", quantityAvailable: 5, unit: "boxes", listingType: "donation", audience: "ngo" }
  });

  const forbidden = await api("/api/ml/waste-risk", { cookie: ngo.cookie });
  assert.equal(forbidden.status, 403);

  const { status, payload } = await api("/api/ml/waste-risk", { cookie: provider.cookie });
  assert.equal(status, 200);
  assert.ok(["heuristic", "trained-logistic-regression", "none"].includes(payload.modelType));
  assert.ok(payload.items.length >= 1);
  for (const entry of payload.items) {
    assert.ok(entry.riskScore >= 0 && entry.riskScore <= 1, "riskScore must be a 0-1 probability");
    assert.ok(["low", "medium", "high"].includes(entry.riskLabel));
  }
});

test("GET /api/recommendations is ngo/consumer-only and respects audience", async () => {
  const provider = await registerAndLogin("provider");

  const forbidden = await api("/api/recommendations", { cookie: provider.cookie });
  assert.equal(forbidden.status, 403);

  const ngo = await registerAndLogin("ngo");
  await api("/api/items", {
    method: "POST",
    cookie: provider.cookie,
    body: { name: "NGO-only item", category: "Produce", quantityAvailable: 5, unit: "crates", listingType: "donation", audience: "ngo" }
  });

  const { status, payload } = await api("/api/recommendations", { cookie: ngo.cookie });
  assert.equal(status, 200);
  assert.ok(Array.isArray(payload.items));
  assert.ok(payload.items.every((entry) => entry.matchScore >= 0 && entry.matchScore <= 1));
});

test("POST /api/maintenance/expiry-sweep auto-expires past-due listings and alerts near-due ones", async () => {
  const provider = await registerAndLogin("provider");
  const now = Date.now();

  const expiredItem = await api("/api/items", {
    method: "POST",
    cookie: provider.cookie,
    body: {
      name: "Already Past Due",
      category: "Prepared Food",
      quantityAvailable: 4,
      unit: "boxes",
      listingType: "donation",
      audience: "ngo",
      availableFrom: new Date(now - 3 * 3600000).toISOString(),
      availableUntil: new Date(now - 1 * 3600000).toISOString(),
      expirationDate: new Date(now - 1 * 3600000).toISOString()
    }
  });
  assert.equal(expiredItem.status, 201);

  const soonItem = await api("/api/items", {
    method: "POST",
    cookie: provider.cookie,
    body: {
      name: "Expiring In A Bit",
      category: "Bakery",
      quantityAvailable: 4,
      unit: "loaves",
      listingType: "donation",
      audience: "ngo",
      availableFrom: new Date(now - 3600000).toISOString(),
      availableUntil: new Date(now + 2 * 3600000).toISOString(),
      expirationDate: new Date(now + 2 * 3600000).toISOString()
    }
  });
  assert.equal(soonItem.status, 201);

  const sweep = await api("/api/maintenance/expiry-sweep", { method: "POST", cookie: provider.cookie });
  assert.equal(sweep.status, 200);
  assert.ok(sweep.payload.expiredCount >= 1, "the past-due item should have been auto-expired");
  assert.ok(sweep.payload.alertsSent >= 1, "the soon-to-expire, unclaimed item should have triggered a notification");

  const afterExpired = await api(`/api/items/${expiredItem.payload.item.id}`, { cookie: provider.cookie });
  assert.equal(afterExpired.payload.item.status, "expired");

  const notifications = await api("/api/notifications", { cookie: provider.cookie });
  assert.ok(notifications.payload.notifications.some((n) => n.title === "Listing expiring soon"));
});

test("maintenance/expiry-sweep requires authentication", async () => {
  const { status } = await api("/api/maintenance/expiry-sweep", { method: "POST" });
  assert.equal(status, 401);
});
