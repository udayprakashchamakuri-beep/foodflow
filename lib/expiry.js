"use strict";

// ---------------------------------------------------------------------------
// Expiry automation
//
// Nothing in the original codebase ever transitioned a listing into the
// already-defined 'expired' status, and providers only found out an item
// went unclaimed by noticing it themselves. This module adds two behaviours,
// run on a timer:
//
//   1. Auto-expire listings whose expiration_date/available_until has
//      passed, so stale items stop showing up as "available".
//   2. Warn the provider (via the existing notifications table) when an
//      active listing is about to expire and still has zero claims, giving
//      them a window to donate it free or discount it before it's wasted.
// ---------------------------------------------------------------------------

const DEFAULT_ALERT_WINDOW_HOURS = 6;

function ensureExpiryColumns(db) {
  try {
    db.exec("ALTER TABLE items ADD COLUMN expiry_alert_sent_at TEXT");
  } catch (_error) {
    // Column already exists.
  }
}

function runExpirySweep(db, { alertWindowHours = DEFAULT_ALERT_WINDOW_HOURS } = {}) {
  ensureExpiryColumns(db);
  const nowIsoValue = new Date().toISOString();
  const alertHorizon = new Date(Date.now() + alertWindowHours * 60 * 60 * 1000).toISOString();

  // 1. Auto-expire anything whose window has passed.
  const expireResult = db.prepare(`
    UPDATE items
    SET status = 'expired', updated_at = ?
    WHERE status IN ('available', 'reserved')
      AND (
        (expiration_date IS NOT NULL AND expiration_date < ?)
        OR (available_until IS NOT NULL AND available_until < ?)
      )
  `).run(nowIsoValue, nowIsoValue, nowIsoValue);

  // 2. Warn providers about items about to expire that are still fully unclaimed.
  const atRiskItems = db.prepare(`
    SELECT items.id, items.provider_id, items.name, items.expiration_date, items.available_until
    FROM items
    WHERE items.status = 'available'
      AND items.expiry_alert_sent_at IS NULL
      AND (
        (items.expiration_date IS NOT NULL AND items.expiration_date <= ? AND items.expiration_date >= ?)
        OR (items.available_until IS NOT NULL AND items.available_until <= ? AND items.available_until >= ?)
      )
  `).all(alertHorizon, nowIsoValue, alertHorizon, nowIsoValue);

  const insertNotification = db.prepare(`
    INSERT INTO notifications (recipient_user_id, provider_id, item_id, title, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const markAlerted = db.prepare("UPDATE items SET expiry_alert_sent_at = ? WHERE id = ?");

  atRiskItems.forEach((item) => {
    const deadline = item.expiration_date || item.available_until;
    const label = deadline ? new Date(deadline).toLocaleString() : "soon";
    insertNotification.run(
      item.provider_id,
      item.provider_id,
      item.id,
      "Listing expiring soon",
      `${item.name} is still unclaimed and expires around ${label}. Consider marking it free/public or lowering the price.`,
      nowIsoValue
    );
    markAlerted.run(nowIsoValue, item.id);
  });

  return {
    expiredCount: expireResult.changes,
    alertsSent: atRiskItems.length,
    ranAt: nowIsoValue
  };
}

function scheduleExpirySweep(db, intervalMs = 15 * 60 * 1000) {
  runExpirySweep(db);
  const timer = setInterval(() => {
    try {
      runExpirySweep(db);
    } catch (error) {
      process.stderr.write(`Expiry sweep failed: ${error.message}\n`);
    }
  }, intervalMs);

  // Don't let this background timer keep the process alive on its own
  // (matters for the smoke test / any short-lived script that spins up
  // createAppServer() and expects to exit cleanly after server.close()).
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return timer;
}

module.exports = { runExpirySweep, scheduleExpirySweep, ensureExpiryColumns, DEFAULT_ALERT_WINDOW_HOURS };
