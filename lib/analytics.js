"use strict";

// ---------------------------------------------------------------------------
// Impact analytics
//
// Turns raw transaction/listing rows into the numbers a food-rescue platform
// actually wants to report: units rescued, an estimated weight in kg, an
// estimated CO2-equivalent avoided, trend over time, and who is driving the
// impact. The kg-per-unit and CO2-per-kg figures are documented, editable
// assumptions (not measured data) -- call this out explicitly in the report.
// ---------------------------------------------------------------------------

// Rough average kilograms represented by one "unit" of a listing, by
// category. A unit means whatever the provider's chosen unit is (box, crate,
// loaf, pack...), so this is necessarily an approximation used only to make
// the impact numbers legible, not a precise weight measurement.
const KG_PER_UNIT_BY_CATEGORY = {
  "Prepared Food": 0.6,
  "Produce": 3,
  "Bakery": 0.4,
  "Dairy": 1,
  "Grains": 1.5,
  "Beverages": 1,
  "default": 0.8
};

// Commonly cited estimates for food waste put avoided emissions around
// 2-2.5 kg CO2-equivalent per kg of food diverted from landfill. We use a
// conservative midpoint; treat this as illustrative, not audited.
const CO2_PER_KG = 2.5;

function estimateKg(category, units) {
  const perUnit = KG_PER_UNIT_BY_CATEGORY[category] || KG_PER_UNIT_BY_CATEGORY.default;
  return perUnit * units;
}

function getImpactAnalytics(db) {
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total_transactions,
      COALESCE(SUM(quantity), 0) AS total_units,
      COALESCE(SUM(CASE WHEN kind = 'donation' THEN quantity ELSE 0 END), 0) AS donation_units,
      COALESCE(SUM(CASE WHEN kind = 'reservation' THEN quantity ELSE 0 END), 0) AS reservation_units
    FROM transactions
  `).get();

  const categoryRows = db.prepare(`
    SELECT items.category AS category, COALESCE(SUM(transactions.quantity), 0) AS units
    FROM transactions
    JOIN items ON items.id = transactions.item_id
    GROUP BY items.category
    ORDER BY units DESC
  `).all();

  let estimatedKg = 0;
  const categoryBreakdown = categoryRows.map((row) => {
    const kg = estimateKg(row.category, row.units);
    estimatedKg += kg;
    return { category: row.category, units: row.units, estimatedKg: Number(kg.toFixed(1)) };
  });

  const trendRows = db.prepare(`
    SELECT substr(completed_at, 1, 10) AS day,
           COALESCE(SUM(quantity), 0) AS units,
           COUNT(*) AS transactions
    FROM transactions
    GROUP BY day
    ORDER BY day ASC
  `).all();

  const topProviders = db.prepare(`
    SELECT users.id, users.display_name, COALESCE(SUM(transactions.quantity), 0) AS units, COUNT(transactions.id) AS transactions
    FROM users
    JOIN transactions ON transactions.provider_id = users.id
    GROUP BY users.id, users.display_name
    ORDER BY units DESC
    LIMIT 5
  `).all();

  const topNgos = db.prepare(`
    SELECT users.id, users.display_name, COALESCE(SUM(transactions.quantity), 0) AS units, COUNT(transactions.id) AS transactions
    FROM users
    JOIN transactions ON transactions.ngo_id = users.id
    WHERE transactions.kind = 'donation'
    GROUP BY users.id, users.display_name
    ORDER BY units DESC
    LIMIT 5
  `).all();

  const listingStatusRows = db.prepare(`
    SELECT status, COUNT(*) AS total FROM items GROUP BY status
  `).all();

  return {
    totals: {
      totalTransactions: totals.total_transactions,
      totalUnitsSaved: totals.total_units,
      donationUnits: totals.donation_units,
      reservationUnits: totals.reservation_units,
      estimatedKgSaved: Number(estimatedKg.toFixed(1)),
      estimatedCo2SavedKg: Number((estimatedKg * CO2_PER_KG).toFixed(1)),
      estimatedMealsEquivalent: Math.round(estimatedKg / 0.6)
    },
    categoryBreakdown,
    trend: trendRows.map((row) => ({ day: row.day, units: row.units, transactions: row.transactions })),
    topProviders: topProviders.map((row) => ({ id: row.id, name: row.display_name, units: row.units, transactions: row.transactions })),
    topNgos: topNgos.map((row) => ({ id: row.id, name: row.display_name, units: row.units, transactions: row.transactions })),
    listingStatusBreakdown: listingStatusRows.map((row) => ({ status: row.status, total: row.total }))
  };
}

module.exports = { getImpactAnalytics, estimateKg, KG_PER_UNIT_BY_CATEGORY, CO2_PER_KG };
