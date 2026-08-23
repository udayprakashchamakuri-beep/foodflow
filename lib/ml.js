"use strict";

// ---------------------------------------------------------------------------
// Waste-risk model
//
// Predicts the probability that an active listing will go unclaimed before
// it expires, so providers can act early (drop price, switch to free/public,
// or push it into quick rescue) instead of finding out only after the item
// has already expired.
//
// This is a small logistic regression trained from scratch with batch
// gradient descent -- no ML library, just the math -- on the platform's own
// history: items that ended up in a transaction are labelled "claimed" (1),
// items that expired or were archived with no linked transaction are
// labelled "unclaimed" (0). When there isn't enough labelled history yet
// (a classic cold-start problem for any new marketplace), the model falls
// back to a transparent, documented heuristic instead of producing a
// meaningless prediction, and switches back to the trained model
// automatically once enough transactions accumulate.
// ---------------------------------------------------------------------------

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function hoursBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / (1000 * 60 * 60);
}

function encodeListingType(listingType) {
  return { donation: 0, free_public: 0.5, sale: 1 }[listingType] ?? 0.5;
}

function encodeAudience(audience) {
  return { ngo: 0, both: 0.5, consumer: 1 }[audience] ?? 0.5;
}

function extractFeatures(item) {
  const deadline = item.expiration_date || item.available_until;
  const listedWindowHours = hoursBetween(item.created_at, deadline);
  return [
    listedWindowHours === null ? 48 : Math.max(0, Math.min(listedWindowHours, 240)), // hours given to move it
    Math.log1p(Math.max(0, Number(item.quantity_available) || 0)),                    // quantity, log-scaled
    Math.max(0, Number(item.price_per_unit) || 0),                                     // price friction
    item.is_packed ? 1 : 0,
    encodeListingType(item.listing_type),
    encodeAudience(item.audience)
  ];
}

function fitScaler(matrix) {
  const dims = matrix[0].length;
  const mins = new Array(dims).fill(Infinity);
  const maxs = new Array(dims).fill(-Infinity);
  matrix.forEach((row) => {
    row.forEach((value, i) => {
      if (value < mins[i]) mins[i] = value;
      if (value > maxs[i]) maxs[i] = value;
    });
  });
  return { mins, maxs };
}

function applyScaler(row, scaler) {
  return row.map((value, i) => {
    const range = scaler.maxs[i] - scaler.mins[i];
    return range > 0 ? (value - scaler.mins[i]) / range : 0.5;
  });
}

function trainLogisticRegression(features, labels, { epochs = 600, learningRate = 0.35 } = {}) {
  const n = features.length;
  const dims = features[0].length;
  const weights = new Array(dims).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradW = new Array(dims).fill(0);
    let gradB = 0;

    for (let i = 0; i < n; i += 1) {
      const z = features[i].reduce((sum, value, j) => sum + value * weights[j], bias);
      const prediction = sigmoid(z);
      const error = prediction - labels[i];
      for (let j = 0; j < dims; j += 1) {
        gradW[j] += error * features[i][j];
      }
      gradB += error;
    }

    for (let j = 0; j < dims; j += 1) {
      weights[j] -= (learningRate * gradW[j]) / n;
    }
    bias -= (learningRate * gradB) / n;
  }

  return { weights, bias };
}

function heuristicRisk(item) {
  const deadline = item.expiration_date || item.available_until;
  const hoursLeft = deadline ? hoursBetween(new Date().toISOString(), deadline) : 48;
  const urgency = hoursLeft === null ? 0.5 : Math.max(0, Math.min(1, 1 - hoursLeft / 72));
  const priceFriction = Number(item.price_per_unit) > 0 ? 0.25 : 0;
  const quantityBurden = Math.max(0, Math.min(1, (Number(item.quantity_available) || 0) / 50)) * 0.2;
  return Math.max(0, Math.min(1, 0.55 * urgency + priceFriction + quantityBurden));
}

function riskLabel(score) {
  if (score >= 0.67) return "high";
  if (score >= 0.34) return "medium";
  return "low";
}

const MIN_TRAINING_EXAMPLES = 8;

function getWasteRiskForProvider(db, providerId) {
  const resolved = db.prepare(`
    SELECT items.*, EXISTS(
      SELECT 1 FROM transactions WHERE transactions.item_id = items.id
    ) AS was_claimed
    FROM items
    WHERE items.status IN ('fulfilled', 'expired', 'archived')
  `).all();

  const activeItems = db.prepare(`
    SELECT * FROM items
    WHERE provider_id = ? AND status IN ('available', 'reserved')
    ORDER BY COALESCE(expiration_date, available_until) IS NULL, COALESCE(expiration_date, available_until) ASC
  `).all(providerId);

  if (!activeItems.length) {
    return { modelType: "none", trainingExamples: resolved.length, items: [] };
  }

  const labels = resolved.map((row) => (row.was_claimed ? 1 : 0));
  const classCount = new Set(labels).size;

  let modelType = "heuristic";
  let scoreFn = heuristicRisk;

  if (resolved.length >= MIN_TRAINING_EXAMPLES && classCount === 2) {
    const trainMatrix = resolved.map(extractFeatures);
    const scaler = fitScaler(trainMatrix);
    const normalized = trainMatrix.map((row) => applyScaler(row, scaler));
    const model = trainLogisticRegression(normalized, labels);

    modelType = "trained-logistic-regression";
    scoreFn = (item) => {
      const raw = extractFeatures(item);
      const normalizedRow = applyScaler(raw, scaler);
      const z = normalizedRow.reduce((sum, value, j) => sum + value * model.weights[j], model.bias);
      // z scores probability of being CLAIMED; risk of waste is the inverse.
      return 1 - sigmoid(z);
    };
  }

  const items = activeItems.map((item) => {
    const risk = Math.max(0, Math.min(1, scoreFn(item)));
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      quantityAvailable: item.quantity_available,
      expirationDate: item.expiration_date,
      availableUntil: item.available_until,
      riskScore: Number(risk.toFixed(3)),
      riskLabel: riskLabel(risk)
    };
  });

  return { modelType, trainingExamples: resolved.length, items };
}

// ---------------------------------------------------------------------------
// Content-based recommendations
//
// Ranks currently available listings for an NGO/consumer using: how well the
// item's category matches their own request/reservation history, how urgent
// the pickup window is (so high-impact, about-to-expire items surface),
// and proximity when coordinates are available. A brand-new user with no
// history gets a neutral category score so they still see a sensible,
// urgency-led ranking instead of an empty or arbitrary list -- the same
// cold-start idea as the waste-risk fallback above.
// ---------------------------------------------------------------------------

function haversineKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined)) return null;
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildCategoryAffinity(historyRows) {
  const counts = {};
  let total = 0;
  historyRows.forEach((row) => {
    counts[row.category] = (counts[row.category] || 0) + 1;
    total += 1;
  });
  if (!total) return {};
  const affinity = {};
  Object.entries(counts).forEach(([category, count]) => {
    affinity[category] = count / total;
  });
  return affinity;
}

function getRecommendations(db, user, { limit = 6 } = {}) {
  let historyRows = [];
  let audienceValues;

  if (user.role === "ngo") {
    historyRows = db.prepare(`
      SELECT items.category AS category
      FROM ngo_requests
      JOIN items ON items.id = ngo_requests.item_id
      WHERE ngo_requests.ngo_id = ?
    `).all(user.id);
    audienceValues = ["ngo", "both"];
  } else {
    historyRows = db.prepare(`
      SELECT items.category AS category
      FROM reservations
      JOIN items ON items.id = reservations.item_id
      WHERE reservations.consumer_id = ?
    `).all(user.id);
    audienceValues = ["consumer", "both"];
  }

  const affinity = buildCategoryAffinity(historyRows);
  const hasHistory = Object.keys(affinity).length > 0;

  const candidates = db.prepare(`
    SELECT items.*, providers.latitude AS provider_latitude, providers.longitude AS provider_longitude
    FROM items
    JOIN users AS providers ON providers.id = items.provider_id
    WHERE items.status = 'available' AND items.audience IN (?, ?)
  `).all(audienceValues[0], audienceValues[1]);

  const scored = candidates.map((item) => {
    const categoryScore = hasHistory ? (affinity[item.category] || 0) : 0.5;

    const deadline = item.expiration_date || item.available_until;
    const hoursLeft = deadline ? hoursBetween(new Date().toISOString(), deadline) : 72;
    const urgencyScore = hoursLeft === null ? 0.5 : Math.max(0, Math.min(1, 1 - hoursLeft / 96));

    const lat = item.latitude ?? item.provider_latitude;
    const lng = item.longitude ?? item.provider_longitude;
    const distanceKm = haversineKm(user.latitude, user.longitude, lat, lng);
    const proximityScore = distanceKm === null ? 0.5 : Math.max(0, Math.min(1, 1 - distanceKm / 25));

    const matchScore = 0.5 * categoryScore + 0.3 * urgencyScore + 0.2 * proximityScore;

    let reason = "Fits your usual browsing pattern";
    if (hasHistory && (affinity[item.category] || 0) >= 0.34) {
      reason = `Matches your usual category: ${item.category}`;
    } else if (urgencyScore >= 0.6) {
      reason = "Expiring soon - high rescue impact";
    } else if (distanceKm !== null && distanceKm <= 5) {
      reason = "Close to your location";
    }

    return {
      id: item.id,
      name: item.name,
      category: item.category,
      quantityAvailable: item.quantity_available,
      unit: item.unit,
      pricePerUnit: item.price_per_unit,
      expirationDate: item.expiration_date,
      distanceKm: distanceKm === null ? null : Number(distanceKm.toFixed(1)),
      matchScore: Number(matchScore.toFixed(3)),
      reason
    };
  });

  scored.sort((a, b) => b.matchScore - a.matchScore);
  return { hasHistory, items: scored.slice(0, limit) };
}

module.exports = { getWasteRiskForProvider, getRecommendations, MIN_TRAINING_EXAMPLES };
