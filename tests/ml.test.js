"use strict";

// Focused unit tests for the waste-risk / recommendation logic in lib/ml.js,
// exercised directly against a real (but isolated, temp) SQLite database
// rather than through HTTP. These specifically pin down the cold-start
// behaviour described in the report: heuristic fallback with little history,
// automatic switch to the trained logistic regression once enough labelled
// outcomes exist.

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

let openDatabase;
let getWasteRiskForProvider;
let getRecommendations;
let tempDataDir;
let dbCounter = 0;

test.before(() => {
  tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "foodflow-ml-test-"));
  ({ getWasteRiskForProvider, getRecommendations } = require("../lib/ml"));
});

test.after(() => {
  removeTempDir(tempDataDir);
});

// Each test gets its own fresh, seeded database file so tests don't leak
// state into one another (seeding happens automatically the first time
// openDatabase() sees an empty `users` table). server.js reads DATA_DIR/
// DB_PATH from process.env at module load time (that's the env-override fix
// from earlier), so we have to re-require it fresh -- with the cache cleared
// -- every time we want a genuinely new database file.
function freshDb() {
  dbCounter += 1;
  process.env.DATA_DIR = tempDataDir;
  process.env.DB_PATH = path.join(tempDataDir, `ml-${dbCounter}.sqlite`);
  delete require.cache[require.resolve("../server")];
  ({ openDatabase } = require("../server"));
  return openDatabase();
}

function insertUser(db, role, emailSuffix) {
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, role, display_name, contact_name, phone, address, latitude, longitude)
    VALUES (?, 'x:y', ?, ?, ?, ?, ?, ?, ?)
  `).run(`${role}-${emailSuffix}@ml.test`, role, `${role} ${emailSuffix}`, "Contact", "0000000000", "Address", 12.93, 77.61);
  return Number(result.lastInsertRowid);
}

function insertItem(db, { providerId, status, category, hoursFromNow, priceUnit = 0, quantity = 5, audience = "ngo" }) {
  const deadline = new Date(Date.now() + hoursFromNow * 3600000).toISOString();
  const result = db.prepare(`
    INSERT INTO items (
      provider_id, name, category, quantity_available, unit, expiration_date,
      is_packed, available_from, available_until, listing_type, audience,
      source, price_per_unit, status
    ) VALUES (?, ?, ?, ?, 'units', ?, 1, ?, ?, 'donation', ?, 'inventory', ?, ?)
  `).run(providerId, `Item ${category} ${hoursFromNow}h`, category, quantity, deadline, new Date().toISOString(), deadline, audience, priceUnit, status);
  return Number(result.lastInsertRowid);
}

function markClaimed(db, itemId, providerId) {
  db.prepare(`
    INSERT INTO transactions (provider_id, item_id, quantity, kind, status)
    VALUES (?, ?, 1, 'donation', 'delivered')
  `).run(providerId, itemId);
}

// --- waste-risk cold start -------------------------------------------------

test("waste-risk falls back to the heuristic when there is little resolved history", () => {
  const db = freshDb();
  const providerId = insertUser(db, "provider", "a");
  insertItem(db, { providerId, status: "available", category: "Prepared Food", hoursFromNow: 5 });

  const result = getWasteRiskForProvider(db, providerId);
  assert.equal(result.modelType, "heuristic");
  assert.equal(result.items.length, 1);
  assert.ok(result.items[0].riskScore >= 0 && result.items[0].riskScore <= 1);
});

test("waste-risk switches to the trained logistic regression once enough labelled outcomes exist", () => {
  const db = freshDb();
  const providerId = insertUser(db, "provider", "b");

  // 5 items that got claimed (label 1), 5 that expired unclaimed (label 0) --
  // enough of both classes to clear MIN_TRAINING_EXAMPLES.
  for (let i = 0; i < 5; i += 1) {
    const claimedId = insertItem(db, { providerId, status: "fulfilled", category: "Prepared Food", hoursFromNow: -10 - i });
    markClaimed(db, claimedId, providerId);
    insertItem(db, { providerId, status: "expired", category: "Bakery", hoursFromNow: -20 - i, priceUnit: 50 });
  }

  insertItem(db, { providerId, status: "available", category: "Prepared Food", hoursFromNow: 4 });

  const result = getWasteRiskForProvider(db, providerId);
  assert.equal(result.modelType, "trained-logistic-regression");
  assert.equal(result.trainingExamples, 10);
  assert.equal(result.items.length, 1);
  assert.ok(result.items[0].riskScore >= 0 && result.items[0].riskScore <= 1);
});

test("waste-risk returns nothing for a provider with no active listings", () => {
  const db = freshDb();
  const providerId = insertUser(db, "provider", "c");
  const result = getWasteRiskForProvider(db, providerId);
  assert.equal(result.modelType, "none");
  assert.deepEqual(result.items, []);
});

// --- recommendations --------------------------------------------------------

test("recommendations rank by urgency/proximity when the user has no history", () => {
  const db = freshDb();
  const providerId = insertUser(db, "provider", "d");
  const ngoId = insertUser(db, "ngo", "a");

  // Use a category the demo seed data doesn't touch, so this test's
  // assertions aren't coupled to how many seed listings happen to share an
  // audience -- we only care about our own two items' relative ranking.
  insertItem(db, { providerId, status: "available", category: "Grains", hoursFromNow: 48, audience: "ngo" });
  insertItem(db, { providerId, status: "available", category: "Dairy", hoursFromNow: 2, audience: "ngo" });

  const ngo = { id: ngoId, role: "ngo", latitude: 12.93, longitude: 77.61 };
  const result = getRecommendations(db, ngo, { limit: 50 });

  assert.equal(result.hasHistory, false);
  assert.ok(result.items.length >= 2, "should at least include the two items just created");

  // the item expiring sooner should score at least as high (urgency-weighted)
  const bySoonExpiry = result.items.find((item) => item.category === "Dairy");
  const byFarExpiry = result.items.find((item) => item.category === "Grains");
  assert.ok(bySoonExpiry, "the soon-to-expire item should be present in the results");
  assert.ok(byFarExpiry, "the far-from-expiry item should be present in the results");
  assert.ok(bySoonExpiry.matchScore >= byFarExpiry.matchScore);
});

test("recommendations favour categories the NGO has requested before", () => {
  const db = freshDb();
  const providerId = insertUser(db, "provider", "e");
  const ngoId = insertUser(db, "ngo", "b");

  // Non-overlapping categories vs. the demo seed data again, so this test's
  // find()-by-category assertions can't accidentally latch onto a seed item.
  const grainsPastItemId = insertItem(db, { providerId, status: "fulfilled", category: "Grains", hoursFromNow: -5 });
  db.prepare(`
    INSERT INTO ngo_requests (item_id, ngo_id, quantity, status)
    VALUES (?, ?, 1, 'delivered')
  `).run(grainsPastItemId, ngoId);

  insertItem(db, { providerId, status: "available", category: "Grains", hoursFromNow: 48, audience: "ngo" });
  insertItem(db, { providerId, status: "available", category: "Dairy", hoursFromNow: 48, audience: "ngo" });

  const ngo = { id: ngoId, role: "ngo", latitude: 12.93, longitude: 77.61 };
  const result = getRecommendations(db, ngo, { limit: 50 });

  assert.equal(result.hasHistory, true);
  const grainsEntry = result.items.find((item) => item.category === "Grains" && item.matchScore !== undefined);
  const dairyEntry = result.items.find((item) => item.category === "Dairy");
  assert.ok(grainsEntry, "the grains item should be present in the results");
  assert.ok(dairyEntry, "the dairy item should be present in the results");
  assert.ok(grainsEntry.matchScore > dairyEntry.matchScore, "past-requested category should outrank an unrelated one");
  assert.match(grainsEntry.reason, /Grains/);
});
