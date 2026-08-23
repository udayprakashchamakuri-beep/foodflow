const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { getImpactAnalytics } = require("./lib/analytics");
const { runExpirySweep, scheduleExpirySweep } = require("./lib/expiry");
const { getWasteRiskForProvider, getRecommendations } = require("./lib/ml");

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "foodflow.sqlite");
const SESSION_COOKIE = "foodflow_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

const ROUTES = [];

function addRoute(method, pattern, handler) {
  ROUTES.push({ method, pattern, handler });
}

function nowIso() {
  return new Date().toISOString();
}

function startOfFuture(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

function verifyPassword(password, storedHash) {
  const [salt, digest] = String(storedHash || "").split(":");
  if (!salt || !digest) {
    return false;
  }

  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(derived, "hex"));
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIsoOrNull(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeAudience(value) {
  return ["ngo", "consumer", "both"].includes(value) ? value : "both";
}

function normalizeListingType(value) {
  return ["donation", "sale", "free_public"].includes(value) ? value : "donation";
}

function normalizeItemStatus(value) {
  return ["draft", "available", "reserved", "fulfilled", "expired", "archived"].includes(value)
    ? value
    : "available";
}

function normalizeItemSource(value) {
  return ["inventory", "quick_rescue"].includes(value) ? value : "inventory";
}

function normalizeCategory(value) {
  return value ? String(value).trim().slice(0, 60) : "Prepared Food";
}

function parseCookies(cookieHeader) {
  const cookieMap = {};
  if (!cookieHeader) {
    return cookieMap;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) {
      continue;
    }
    cookieMap[rawKey] = decodeURIComponent(rawValue.join("="));
  }

  return cookieMap;
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("Invalid JSON body.");
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendEmpty(res, statusCode = 204) {
  res.writeHead(statusCode);
  res.end();
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function setCookie(res, token) {
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
  res.setHeader("Set-Cookie", cookie);
}

function clearCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function serializeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.display_name,
    contactName: user.contact_name,
    phone: user.phone,
    address: user.address,
    businessType: user.business_type,
    certificateUrl: user.certificate_url,
    latitude: user.latitude,
    longitude: user.longitude
  };
}

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((value) => value === null || value === undefined)) {
    return null;
  }

  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((earthRadiusKm * c).toFixed(1));
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function openDatabase() {
  ensureDataDir();
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('provider', 'ngo', 'consumer')),
      display_name TEXT NOT NULL,
      contact_name TEXT,
      phone TEXT,
      address TEXT,
      business_type TEXT,
      certificate_url TEXT,
      latitude REAL,
      longitude REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      quantity_available REAL NOT NULL,
      unit TEXT NOT NULL,
      expiration_date TEXT,
      is_packed INTEGER NOT NULL DEFAULT 1,
      location_text TEXT,
      latitude REAL,
      longitude REAL,
      available_from TEXT,
      available_until TEXT,
      listing_type TEXT NOT NULL DEFAULT 'donation',
      audience TEXT NOT NULL DEFAULT 'ngo',
      source TEXT NOT NULL DEFAULT 'inventory',
      price_per_unit REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'available',
      donor_notes TEXT,
      image_url TEXT,
      barcode_image_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (provider_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ngo_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      ngo_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT,
      pickup_window_start TEXT,
      pickup_window_end TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE,
      FOREIGN KEY (ngo_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES ngo_requests (id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consumer_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (consumer_id, item_id),
      FOREIGN KEY (consumer_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consumer_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'reserved',
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (consumer_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      ngo_id INTEGER,
      consumer_id INTEGER,
      item_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('donation', 'reservation')),
      status TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (provider_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (ngo_id) REFERENCES users (id) ON DELETE SET NULL,
      FOREIGN KEY (consumer_id) REFERENCES users (id) ON DELETE SET NULL,
      FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_user_id INTEGER NOT NULL,
      provider_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (recipient_user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (provider_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_items_provider ON items (provider_id);
    CREATE INDEX IF NOT EXISTS idx_items_status ON items (status);
    CREATE INDEX IF NOT EXISTS idx_items_expiration ON items (expiration_date);
    CREATE INDEX IF NOT EXISTS idx_requests_ngo ON ngo_requests (ngo_id);
    CREATE INDEX IF NOT EXISTS idx_requests_item ON ngo_requests (item_id);
    CREATE INDEX IF NOT EXISTS idx_reservations_consumer ON reservations (consumer_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_provider ON transactions (provider_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_user_id, created_at DESC);
  `);

  try {
    db.exec("ALTER TABLE items ADD COLUMN image_url TEXT");
  } catch (_error) {
    // Column already exists.
  }

  try {
    db.exec("ALTER TABLE items ADD COLUMN barcode_image_url TEXT");
  } catch (_error) {
    // Column already exists.
  }

  try {
    db.exec("ALTER TABLE items ADD COLUMN source TEXT");
  } catch (_error) {
    // Column already exists.
  }

  try {
    db.exec("ALTER TABLE users ADD COLUMN certificate_url TEXT");
  } catch (_error) {
    // Column already exists.
  }

  const countRow = db.prepare("SELECT COUNT(*) AS total FROM users").get();
  if (!countRow.total) {
    seedDatabase(db);
  }

  ensureShowcaseRequests(db);

  return db;
}

function insertUser(db, user) {
  const statement = db.prepare(`
    INSERT INTO users (email, password_hash, role, display_name, contact_name, phone, address, business_type, certificate_url, latitude, longitude)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = statement.run(
    user.email,
    hashPassword(user.password),
    user.role,
    user.displayName,
    user.contactName,
    user.phone,
    user.address,
    user.businessType || null,
    user.certificateUrl || null,
    user.latitude ?? null,
    user.longitude ?? null
  );
  return Number(result.lastInsertRowid);
}

function insertItem(db, item) {
  const statement = db.prepare(`
    INSERT INTO items (
      provider_id,
      name,
      description,
      category,
      quantity_available,
      unit,
      expiration_date,
      is_packed,
      location_text,
      latitude,
      longitude,
      available_from,
      available_until,
      listing_type,
      audience,
      source,
      price_per_unit,
      status,
      donor_notes,
      image_url,
      barcode_image_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = statement.run(
    item.providerId,
    item.name,
    item.description,
    item.category,
    item.quantityAvailable,
    item.unit,
    item.expirationDate,
    item.isPacked ? 1 : 0,
    item.locationText,
    item.latitude ?? null,
    item.longitude ?? null,
    item.availableFrom,
    item.availableUntil,
    item.listingType,
    item.audience,
    item.source || "inventory",
    item.pricePerUnit,
    item.status || "available",
    item.donorNotes || null,
    item.imageUrl || null,
    item.barcodeImageUrl || null
  );
  return Number(result.lastInsertRowid);
}

function ensureShowcaseRequests(db) {
  const showcase = db.prepare(`
    SELECT items.id AS item_id, ngos.id AS ngo_id
    FROM items
    JOIN users AS providers ON providers.id = items.provider_id
    JOIN users AS ngos ON ngos.email = 'ngo@hopeharvest.demo'
    WHERE providers.email = 'provider@freshplate.demo'
      AND items.name = 'Packed Veg Biryani'
    LIMIT 1
  `).get();

  if (!showcase) {
    return;
  }

  const existingPending = db.prepare(`
    SELECT id
    FROM ngo_requests
    WHERE item_id = ? AND ngo_id = ? AND status = 'pending'
    LIMIT 1
  `).get(showcase.item_id, showcase.ngo_id);

  if (existingPending) {
    return;
  }

  db.prepare(`
    INSERT INTO ngo_requests (item_id, ngo_id, quantity, status, note, pickup_window_start, pickup_window_end, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)
  `).run(
    showcase.item_id,
    showcase.ngo_id,
    6,
    'Can pick up before noon.',
    startOfFuture(2),
    startOfFuture(5),
    nowIso(),
    nowIso()
  );
}
function seedDatabase(db) {
  const providerA = insertUser(db, {
    email: "provider@freshplate.demo",
    password: "demo12345",
    role: "provider",
    displayName: "Fresh Plate Kitchen",
    contactName: "Asha Menon",
    phone: "+91 90000 10001",
    address: "Koramangala, Bengaluru",
    businessType: "restaurant",
    latitude: 12.9352,
    longitude: 77.6245
  });

  const providerB = insertUser(db, {
    email: "grocer@greenbasket.demo",
    password: "demo12345",
    role: "provider",
    displayName: "Green Basket Grocery",
    contactName: "Rahul Das",
    phone: "+91 90000 10002",
    address: "Indiranagar, Bengaluru",
    businessType: "grocery",
    latitude: 12.9784,
    longitude: 77.6408
  });

  const providerC = insertUser(db, {
    email: "banquet@grandlotus.demo",
    password: "demo12345",
    role: "provider",
    displayName: "Grand Lotus Banquet",
    contactName: "Neha Sethi",
    phone: "+91 90000 10003",
    address: "HSR Layout, Bengaluru",
    businessType: "banquet",
    latitude: 12.9116,
    longitude: 77.6474
  });

  const ngoA = insertUser(db, {
    email: "ngo@carebridge.demo",
    password: "demo12345",
    role: "ngo",
    displayName: "CareBridge Foundation",
    contactName: "Vikram Rao",
    phone: "+91 90000 20001",
    address: "BTM Layout, Bengaluru",
    latitude: 12.9166,
    longitude: 77.6101
  });

  const ngoB = insertUser(db, {
    email: "ngo@hopeharvest.demo",
    password: "demo12345",
    role: "ngo",
    displayName: "Hope Harvest NGO",
    contactName: "Sana Khan",
    phone: "+91 90000 20002",
    address: "Domlur, Bengaluru",
    latitude: 12.9611,
    longitude: 77.6387
  });

  const consumer = insertUser(db, {
    email: "consumer@neighbor.demo",
    password: "demo12345",
    role: "consumer",
    displayName: "Maya Patel",
    contactName: "Maya Patel",
    phone: "+91 90000 30001",
    address: "Bellandur, Bengaluru",
    latitude: 12.9304,
    longitude: 77.6784
  });

  const itemA = insertItem(db, {
    providerId: providerA,
    name: "Packed Veg Biryani",
    description: "Freshly packed portions from lunch service.",
    category: "Prepared Food",
    quantityAvailable: 35,
    unit: "boxes",
    expirationDate: startOfFuture(14),
    isPacked: true,
    locationText: "Koramangala pickup counter",
    latitude: 12.9352,
    longitude: 77.6245,
    availableFrom: nowIso(),
    availableUntil: startOfFuture(8),
    listingType: "donation",
    audience: "ngo",
    pricePerUnit: 0,
    status: "available",
    donorNotes: "Best collected before evening."
  });

  const itemB = insertItem(db, {
    providerId: providerB,
    name: "Seasonal Fruit Crates",
    description: "Mixed fruit close to sell-by but still fresh.",
    category: "Produce",
    quantityAvailable: 12,
    unit: "crates",
    expirationDate: startOfFuture(36),
    isPacked: false,
    locationText: "Indiranagar loading bay",
    latitude: 12.9784,
    longitude: 77.6408,
    availableFrom: nowIso(),
    availableUntil: startOfFuture(24),
    listingType: "sale",
    audience: "both",
    pricePerUnit: 120,
    status: "available",
    donorNotes: "Can split into smaller lots."
  });

  const itemC = insertItem(db, {
    providerId: providerC,
    name: "Paneer Wrap Platters",
    description: "Event surplus, safe for same-day distribution.",
    category: "Prepared Food",
    quantityAvailable: 48,
    unit: "packs",
    expirationDate: startOfFuture(10),
    isPacked: true,
    locationText: "HSR banquet dispatch desk",
    latitude: 12.9116,
    longitude: 77.6474,
    availableFrom: nowIso(),
    availableUntil: startOfFuture(6),
    listingType: "free_public",
    audience: "both",
    pricePerUnit: 0,
    status: "available",
    donorNotes: "Quick rescue listing from wedding event."
  });

  const itemD = insertItem(db, {
    providerId: providerA,
    name: "Bread Loaves",
    description: "Same-day bakery overproduction.",
    category: "Bakery",
    quantityAvailable: 20,
    unit: "loaves",
    expirationDate: startOfFuture(20),
    isPacked: false,
    locationText: "Koramangala bakery entrance",
    latitude: 12.9352,
    longitude: 77.6245,
    availableFrom: nowIso(),
    availableUntil: startOfFuture(10),
    listingType: "sale",
    audience: "consumer",
    pricePerUnit: 35,
    status: "available",
    donorNotes: "Available for same-day collection."
  });

  const requestId = Number(
    db.prepare(`
      INSERT INTO ngo_requests (item_id, ngo_id, quantity, status, note, pickup_window_start, pickup_window_end, created_at, updated_at)
      VALUES (?, ?, ?, 'approved', ?, ?, ?, ?, ?)
    `).run(
      itemA,
      ngoA,
      10,
      "Can pick up with insulated van.",
      startOfFuture(1),
      startOfFuture(4),
      nowIso(),
      nowIso()
    ).lastInsertRowid
  );

  db.prepare(`
    INSERT INTO messages (request_id, sender_id, body, created_at)
    VALUES (?, ?, ?, ?), (?, ?, ?, ?)
  `).run(
    requestId,
    ngoA,
    "Our driver can reach by 5 PM.",
    nowIso(),
    requestId,
    providerA,
    "Confirmed. Ask for the loading team at the back gate.",
    nowIso()
  );

  db.prepare(`
    INSERT INTO reservations (consumer_id, item_id, quantity, total_amount, note, status, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'collected', ?, ?, ?)
  `).run(
    consumer,
    itemD,
    2,
    70,
    "Picking up after work.",
    startOfFuture(6),
    nowIso(),
    nowIso()
  );

  db.prepare(`
    INSERT INTO transactions (provider_id, ngo_id, item_id, quantity, kind, status, completed_at)
    VALUES (?, ?, ?, ?, 'donation', 'delivered', ?)
  `).run(providerA, ngoA, itemA, 10, nowIso());

  db.prepare(`
    INSERT INTO transactions (provider_id, ngo_id, item_id, quantity, kind, status, completed_at)
    VALUES (?, ?, ?, ?, 'donation', 'delivered', ?)
  `).run(providerC, ngoB, itemC, 20, nowIso());

  db.prepare(`
    INSERT INTO transactions (provider_id, consumer_id, item_id, quantity, kind, status, completed_at)
    VALUES (?, ?, ?, ?, 'reservation', 'collected', ?)
  `).run(providerA, consumer, itemD, 2, nowIso());
}

function getUserById(db, userId) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}

function getCurrentUser(db, req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) {
    return null;
  }

  const session = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
  if (!session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }

  return getUserById(db, session.user_id);
}

function requireUser(db, req, res, allowedRoles = null) {
  const user = getCurrentUser(db, req);
  if (!user) {
    sendError(res, 401, "Authentication required.");
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    sendError(res, 403, "You do not have access to this resource.");
    return null;
  }

  return user;
}

function createSession(db, userId) {
  const token = generateToken();
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    new Date(Date.now() + SESSION_TTL_MS).toISOString()
  );
  return token;
}

function mapItemRow(row, viewer = null) {
  const providerLat = row.provider_latitude ?? row.latitude;
  const providerLng = row.provider_longitude ?? row.longitude;
  const distanceKm =
    viewer && viewer.latitude !== null && viewer.longitude !== null
      ? haversineDistanceKm(viewer.latitude, viewer.longitude, providerLat, providerLng)
      : null;

  return {
    id: row.id,
    providerId: row.provider_id,
    providerName: row.provider_name,
    providerContact: row.provider_contact,
    providerPhone: row.provider_phone,
    providerAddress: row.provider_address,
    providerBusinessType: row.provider_business_type,
    name: row.name,
    description: row.description,
    category: row.category,
    quantityAvailable: row.quantity_available,
    unit: row.unit,
    expirationDate: row.expiration_date,
    isPacked: Boolean(row.is_packed),
    locationText: row.location_text,
    latitude: row.latitude,
    longitude: row.longitude,
    availableFrom: row.available_from,
    availableUntil: row.available_until,
    listingType: row.listing_type,
    audience: row.audience,
    source: row.source || "inventory",
    pricePerUnit: row.price_per_unit,
    status: row.status,
    donorNotes: row.donor_notes,
    imageUrl: row.image_url,
    barcodeImageUrl: row.barcode_image_url,
    distanceKm
  };
}

function getItemById(db, itemId, viewer = null) {
  const row = db.prepare(`
    SELECT
      items.*,
      users.display_name AS provider_name,
      users.contact_name AS provider_contact,
      users.phone AS provider_phone,
      users.address AS provider_address,
      users.business_type AS provider_business_type,
      users.latitude AS provider_latitude,
      users.longitude AS provider_longitude
    FROM items
    JOIN users ON users.id = items.provider_id
    WHERE items.id = ?
  `).get(itemId);

  return row ? mapItemRow(row, viewer) : null;
}

function getAvailableItems(db, viewer, filters = {}) {
  const conditions = [
    "items.status = 'available'",
    "items.quantity_available > 0"
  ];
  const values = [];

  if (filters.scope === "mine" && viewer?.role === "provider") {
    conditions.length = 0;
    conditions.push("items.provider_id = ?");
    values.push(viewer.id);
    if (filters.status) {
      conditions.push("items.status = ?");
      values.push(filters.status);
    }
  } else if (filters.audience) {
    conditions.push("(items.audience = ? OR items.audience = 'both')");
    values.push(filters.audience);
  }

  if (filters.search) {
    conditions.push("(items.name LIKE ? OR items.description LIKE ? OR items.category LIKE ?)");
    const token = `%${filters.search.trim()}%`;
    values.push(token, token, token);
  }

  if (filters.category) {
    conditions.push("items.category = ?");
    values.push(filters.category);
  }

  const query = `
    SELECT
      items.*,
      users.display_name AS provider_name,
      users.contact_name AS provider_contact,
      users.phone AS provider_phone,
      users.address AS provider_address,
      users.business_type AS provider_business_type,
      users.latitude AS provider_latitude,
      users.longitude AS provider_longitude
    FROM items
    JOIN users ON users.id = items.provider_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY items.expiration_date IS NULL, items.expiration_date ASC, items.created_at DESC
  `;

  let items = db.prepare(query).all(...values).map((row) => mapItemRow(row, viewer));

  if (filters.expirationDays) {
    const maxDays = Number(filters.expirationDays);
    const now = Date.now();
    items = items.filter((item) => {
      if (!item.expirationDate) {
        return false;
      }
      const distanceDays = (new Date(item.expirationDate).getTime() - now) / (1000 * 60 * 60 * 24);
      return distanceDays >= 0 && distanceDays <= maxDays;
    });
  }

  if (filters.distanceKm && viewer?.latitude !== null && viewer?.longitude !== null) {
    const maxDistance = Number(filters.distanceKm);
    items = items.filter((item) => item.distanceKm !== null && item.distanceKm <= maxDistance);
  }

  if (filters.sort === "closest") {
    items.sort((left, right) => {
      if (left.distanceKm === null) {
        return 1;
      }
      if (right.distanceKm === null) {
        return -1;
      }
      return left.distanceKm - right.distanceKm;
    });
  } else if (filters.sort === "quantity") {
    items.sort((left, right) => right.quantityAvailable - left.quantityAvailable);
  }

  return items;
}

function getMessagesForRequest(db, requestId) {
  return db.prepare(`
    SELECT messages.*, users.display_name AS sender_name, users.role AS sender_role
    FROM messages
    JOIN users ON users.id = messages.sender_id
    WHERE messages.request_id = ?
    ORDER BY messages.created_at ASC
  `).all(requestId).map((message) => ({
    id: message.id,
    requestId: message.request_id,
    senderId: message.sender_id,
    senderName: message.sender_name,
    senderRole: message.sender_role,
    body: message.body,
    createdAt: message.created_at
  }));
}
function getRequestsForUser(db, user) {
  const rows =
    user.role === "ngo"
      ? db.prepare(`
          SELECT
            ngo_requests.*,
            items.name AS item_name,
            items.unit AS item_unit,
            items.provider_id,
            items.location_text,
            items.expiration_date,
            providers.display_name AS provider_name,
            providers.contact_name AS provider_contact,
            providers.phone AS provider_phone,
            ngos.display_name AS ngo_name
          FROM ngo_requests
          JOIN items ON items.id = ngo_requests.item_id
          JOIN users AS providers ON providers.id = items.provider_id
          JOIN users AS ngos ON ngos.id = ngo_requests.ngo_id
          WHERE ngo_requests.ngo_id = ?
          ORDER BY ngo_requests.created_at DESC
        `).all(user.id)
      : db.prepare(`
          SELECT
            ngo_requests.*,
            items.name AS item_name,
            items.unit AS item_unit,
            items.provider_id,
            items.location_text,
            items.expiration_date,
            providers.display_name AS provider_name,
            providers.contact_name AS provider_contact,
            providers.phone AS provider_phone,
            ngos.display_name AS ngo_name
          FROM ngo_requests
          JOIN items ON items.id = ngo_requests.item_id
          JOIN users AS providers ON providers.id = items.provider_id
          JOIN users AS ngos ON ngos.id = ngo_requests.ngo_id
          WHERE items.provider_id = ?
          ORDER BY ngo_requests.created_at DESC
        `).all(user.id);

  return rows.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    itemName: row.item_name,
    itemUnit: row.item_unit,
    providerId: row.provider_id,
    providerName: row.provider_name,
    providerContact: row.provider_contact,
    providerPhone: row.provider_phone,
    ngoId: row.ngo_id,
    ngoName: row.ngo_name,
    quantity: row.quantity,
    status: row.status,
    note: row.note,
    pickupWindowStart: row.pickup_window_start,
    pickupWindowEnd: row.pickup_window_end,
    locationText: row.location_text,
    expirationDate: row.expiration_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages: getMessagesForRequest(db, row.id)
  }));
}

function getReservationsForUser(db, user) {
  const rows =
    user.role === "consumer"
      ? db.prepare(`
          SELECT
            reservations.*,
            items.name AS item_name,
            items.unit AS item_unit,
            items.provider_id,
            items.location_text,
            items.price_per_unit,
            items.image_url,
            providers.display_name AS provider_name,
            providers.contact_name AS provider_contact,
            providers.phone AS provider_phone
          FROM reservations
          JOIN items ON items.id = reservations.item_id
          JOIN users AS providers ON providers.id = items.provider_id
          WHERE reservations.consumer_id = ?
          ORDER BY reservations.created_at DESC
        `).all(user.id)
      : db.prepare(`
          SELECT
            reservations.*,
            items.name AS item_name,
            items.unit AS item_unit,
            items.provider_id,
            items.location_text,
            items.price_per_unit,
            items.image_url,
            providers.display_name AS provider_name,
            providers.contact_name AS provider_contact,
            providers.phone AS provider_phone,
            consumers.display_name AS consumer_name
          FROM reservations
          JOIN items ON items.id = reservations.item_id
          JOIN users AS providers ON providers.id = items.provider_id
          JOIN users AS consumers ON consumers.id = reservations.consumer_id
          WHERE items.provider_id = ?
          ORDER BY reservations.created_at DESC
        `).all(user.id);

  return rows.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    itemName: row.item_name,
    itemUnit: row.item_unit,
    providerId: row.provider_id,
    providerName: row.provider_name,
    providerContact: row.provider_contact,
    providerPhone: row.provider_phone,
    consumerId: row.consumer_id,
    consumerName: row.consumer_name,
    quantity: row.quantity,
    totalAmount: row.total_amount,
    note: row.note,
    status: row.status,
    locationText: row.location_text,
    imageUrl: row.image_url,
    expiresAt: row.expires_at,
    pricePerUnit: row.price_per_unit,
    createdAt: row.created_at
  }));
}

function getCart(db, consumerId) {
  const items = db.prepare(`
    SELECT
      cart_items.*,
      items.name AS item_name,
      items.quantity_available,
      items.unit,
      items.price_per_unit,
      items.expiration_date,
      items.location_text,
      items.image_url,
      providers.display_name AS provider_name
    FROM cart_items
    JOIN items ON items.id = cart_items.item_id
    JOIN users AS providers ON providers.id = items.provider_id
    WHERE cart_items.consumer_id = ?
    ORDER BY cart_items.updated_at DESC
  `).all(consumerId).map((row) => ({
    itemId: row.item_id,
    name: row.item_name,
    quantity: row.quantity,
    availableQuantity: row.quantity_available,
    unit: row.unit,
    pricePerUnit: row.price_per_unit,
    expirationDate: row.expiration_date,
    imageUrl: row.image_url,
    providerName: row.provider_name,
    locationText: row.location_text,
    lineTotal: Number((row.quantity * row.price_per_unit).toFixed(2))
  }));

  return {
    items,
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2))
  };
}

function getNotificationTargetRoles(item) {
  if (!item) {
    return [];
  }

  if (item.audience === "ngo") {
    return ["ngo"];
  }

  if (item.audience === "consumer") {
    return ["consumer"];
  }

  return ["ngo", "consumer"];
}

function getNotificationsForUser(db, userId, limit = 6) {
  return db.prepare(`
    SELECT
      notifications.*,
      items.name AS item_name,
      items.location_text,
      providers.display_name AS provider_name
    FROM notifications
    JOIN items ON items.id = notifications.item_id
    JOIN users AS providers ON providers.id = notifications.provider_id
    WHERE notifications.recipient_user_id = ?
    ORDER BY notifications.created_at DESC
    LIMIT ?
  `).all(userId, limit).map((row) => ({
    id: row.id,
    itemId: row.item_id,
    providerId: row.provider_id,
    providerName: row.provider_name,
    itemName: row.item_name,
    title: row.title,
    message: row.message,
    locationText: row.location_text,
    createdAt: row.created_at
  }));
}

function createNearbyNotifications(db, itemId) {
  const item = db.prepare(`
    SELECT
      items.id,
      items.provider_id,
      items.name,
      items.audience,
      items.location_text,
      items.available_until,
      items.latitude,
      items.longitude,
      providers.display_name AS provider_name,
      providers.latitude AS provider_latitude,
      providers.longitude AS provider_longitude
    FROM items
    JOIN users AS providers ON providers.id = items.provider_id
    WHERE items.id = ?
  `).get(itemId);

  if (!item) {
    return;
  }

  const sourceLat = item.latitude ?? item.provider_latitude;
  const sourceLng = item.longitude ?? item.provider_longitude;
  const targetRoles = getNotificationTargetRoles(item);
  if (!targetRoles.length || sourceLat === null || sourceLng === null) {
    return;
  }

  const candidates = db.prepare(`
    SELECT id, role, latitude, longitude
    FROM users
    WHERE id != ? AND role IN ('ngo', 'consumer')
  `).all(item.provider_id);

  const insertNotification = db.prepare(`
    INSERT INTO notifications (recipient_user_id, provider_id, item_id, title, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const expiresLabel = item.available_until
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.available_until))
    : "soon";
  const title = `${item.provider_name} posted a quick rescue alert`;
  const message = `${item.name} is available near ${item.location_text || "the pickup point"} until ${expiresLabel}.`;

  candidates
    .filter((candidate) => targetRoles.includes(candidate.role))
    .forEach((candidate) => {
      if (candidate.latitude === null || candidate.longitude === null) {
        return;
      }

      const distanceKm = haversineDistanceKm(candidate.latitude, candidate.longitude, sourceLat, sourceLng);
      if (distanceKm === null || distanceKm > 15) {
        return;
      }

      insertNotification.run(candidate.id, item.provider_id, item.id, title, message, nowIso());
    });
}

function getLeaderboards(db) {
  const providerLeaderboard = db.prepare(`
    SELECT
      users.id,
      users.display_name,
      users.business_type,
      COALESCE(SUM(transactions.quantity), 0) AS total_units,
      COUNT(transactions.id) AS total_transactions
    FROM users
    LEFT JOIN transactions ON transactions.provider_id = users.id
    WHERE users.role = 'provider'
    GROUP BY users.id, users.display_name, users.business_type
    ORDER BY total_units DESC, total_transactions DESC, users.display_name ASC
    LIMIT 5
  `).all().map((row) => ({
    id: row.id,
    name: row.display_name,
    businessType: row.business_type,
    totalUnits: row.total_units,
    totalTransactions: row.total_transactions
  }));

  const ngoLeaderboard = db.prepare(`
    SELECT
      users.id,
      users.display_name,
      COALESCE(SUM(transactions.quantity), 0) AS total_units,
      COUNT(transactions.id) AS total_transactions
    FROM users
    LEFT JOIN transactions ON transactions.ngo_id = users.id AND transactions.kind = 'donation'
    WHERE users.role = 'ngo'
    GROUP BY users.id, users.display_name
    ORDER BY total_units DESC, total_transactions DESC, users.display_name ASC
    LIMIT 5
  `).all().map((row) => ({
    id: row.id,
    name: row.display_name,
    totalUnits: row.total_units,
    totalTransactions: row.total_transactions
  }));

  const globalStats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM items WHERE status = 'available') AS active_listings,
      (SELECT COUNT(*) FROM users WHERE role = 'provider') AS total_providers,
      (SELECT COUNT(*) FROM users WHERE role = 'ngo') AS total_ngos,
      (SELECT COALESCE(SUM(quantity), 0) FROM transactions) AS total_units_saved
  `).get();

  return {
    providerLeaderboard,
    ngoLeaderboard,
    stats: {
      activeListings: globalStats.active_listings,
      totalProviders: globalStats.total_providers,
      totalNgos: globalStats.total_ngos,
      totalUnitsSaved: globalStats.total_units_saved
    }
  };
}

function getDashboard(db, user) {
  if (user.role === "provider") {
    const metrics = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM items WHERE provider_id = ? AND status = 'available') AS active_listings,
        (SELECT COUNT(*) FROM ngo_requests
          JOIN items ON items.id = ngo_requests.item_id
          WHERE items.provider_id = ? AND ngo_requests.status = 'pending') AS pending_requests,
        (SELECT COUNT(*) FROM reservations
          JOIN items ON items.id = reservations.item_id
          WHERE items.provider_id = ? AND reservations.status = 'reserved') AS reserved_orders,
        (SELECT COALESCE(SUM(quantity), 0) FROM transactions WHERE provider_id = ?) AS rescued_units
    `).get(user.id, user.id, user.id, user.id);

    return {
      metrics: {
        activeListings: metrics.active_listings,
        pendingRequests: metrics.pending_requests,
        reservedOrders: metrics.reserved_orders,
        rescuedUnits: metrics.rescued_units
      },
      recentRequests: getRequestsForUser(db, user).slice(0, 5),
      recentReservations: getReservationsForUser(db, user).slice(0, 5)
    };
  }

  if (user.role === "ngo") {
    const metrics = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM ngo_requests WHERE ngo_id = ? AND status = 'pending') AS pending_requests,
        (SELECT COUNT(*) FROM ngo_requests WHERE ngo_id = ?) AS total_requests,
        (SELECT COALESCE(SUM(quantity), 0) FROM transactions WHERE ngo_id = ? AND kind = 'donation') AS delivered_units,
        (SELECT COUNT(*) FROM items WHERE status = 'available' AND (audience = 'ngo' OR audience = 'both')) AS discoverable_items
    `).get(user.id, user.id, user.id);

    return {
      metrics: {
        pendingRequests: metrics.pending_requests,
        totalRequests: metrics.total_requests,
        deliveredUnits: metrics.delivered_units,
        discoverableItems: metrics.discoverable_items
      },
      recentRequests: getRequestsForUser(db, user).slice(0, 6)
    };
  }

  const metrics = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM reservations WHERE consumer_id = ? AND status = 'reserved') AS active_reservations,
      (SELECT COUNT(*) FROM cart_items WHERE consumer_id = ?) AS cart_items,
      (SELECT COUNT(*) FROM items WHERE status = 'available' AND (audience = 'consumer' OR audience = 'both')) AS browse_items,
      (SELECT COALESCE(SUM(quantity), 0) FROM transactions WHERE consumer_id = ? AND kind = 'reservation') AS collected_units
  `).get(user.id, user.id, user.id);

  return {
    metrics: {
      activeReservations: metrics.active_reservations,
      cartItems: metrics.cart_items,
      browseItems: metrics.browse_items,
      collectedUnits: metrics.collected_units
    },
    recentReservations: getReservationsForUser(db, user).slice(0, 6)
  };
}

function canViewItem(user, item) {
  if (!user || !item) {
    return false;
  }

  if (user.role === "provider") {
    return item.providerId === user.id;
  }

  if (user.role === "ngo") {
    return item.audience === "ngo" || item.audience === "both";
  }

  return item.audience === "consumer" || item.audience === "both";
}

function createTransactionIfMissing(db, transaction) {
  const existing = db.prepare(`
    SELECT id FROM transactions
    WHERE provider_id = ?
      AND COALESCE(ngo_id, 0) = COALESCE(?, 0)
      AND COALESCE(consumer_id, 0) = COALESCE(?, 0)
      AND item_id = ?
      AND kind = ?
      AND status = ?
  `).get(
    transaction.providerId,
    transaction.ngoId || null,
    transaction.consumerId || null,
    transaction.itemId,
    transaction.kind,
    transaction.status
  );

  if (!existing) {
    db.prepare(`
      INSERT INTO transactions (provider_id, ngo_id, consumer_id, item_id, quantity, kind, status, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      transaction.providerId,
      transaction.ngoId || null,
      transaction.consumerId || null,
      transaction.itemId,
      transaction.quantity,
      transaction.kind,
      transaction.status,
      nowIso()
    );
  }
}
addRoute("GET", /^\/api\/health$/, async (_req, res) => {
  sendJson(res, 200, { ok: true, timestamp: nowIso() });
});

addRoute("GET", /^\/api\/leaderboards$/, async (req, res, db) => {
  const user = getCurrentUser(db, req);
  sendJson(res, 200, {
    user: serializeUser(user),
    ...getLeaderboards(db)
  });
});

addRoute("GET", /^\/api\/auth\/me$/, async (req, res, db) => {
  const user = getCurrentUser(db, req);
  sendJson(res, 200, { user: serializeUser(user) });
});

addRoute("POST", /^\/api\/auth\/register$/, async (req, res, db) => {
  const body = await readJsonBody(req);
  const role = body.role;

  if (!["provider", "ngo", "consumer"].includes(role)) {
    return sendError(res, 400, "Choose a valid role.");
  }

  if (!body.email || !body.password || body.password.length < 8) {
    return sendError(res, 400, "Email and a password of at least 8 characters are required.");
  }

  const email = String(body.email).toLowerCase().trim();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return sendError(res, 409, "An account with this email already exists.");
  }

  const displayName = String(body.displayName || "").trim();
  const contactName = String(body.contactName || displayName).trim();
  const phone = String(body.phone || "").trim();
  const address = String(body.address || "").trim();
  const certificateUrl = String(body.certificateUrl || "").trim();

  if (!displayName || !phone || !address) {
    return sendError(res, 400, "Name, phone, and address are required.");
  }

  if (role === "provider" && !body.businessType) {
    return sendError(res, 400, "Providers must choose a business type.");
  }

  if (["provider", "ngo"].includes(role) && !certificateUrl) {
    return sendError(res, 400, "Providers and NGOs must upload a government certificate.");
  }

  const userId = Number(
    db.prepare(`
      INSERT INTO users (email, password_hash, role, display_name, contact_name, phone, address, business_type, certificate_url, latitude, longitude)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      email,
      hashPassword(String(body.password)),
      role,
      displayName,
      contactName,
      phone,
      address,
      role === "provider" ? String(body.businessType).trim() : null,
      ["provider", "ngo"].includes(role) ? certificateUrl : null,
      toNumber(body.latitude, null),
      toNumber(body.longitude, null)
    ).lastInsertRowid
  );

  const token = createSession(db, userId);
  setCookie(res, token);
  sendJson(res, 201, { user: serializeUser(getUserById(db, userId)) });
});

addRoute("POST", /^\/api\/auth\/login$/, async (req, res, db) => {
  const body = await readJsonBody(req);
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(String(body.email || "").toLowerCase().trim());
  if (!user || !verifyPassword(String(body.password || ""), user.password_hash)) {
    return sendError(res, 401, "Incorrect email or password.");
  }

  const token = createSession(db, user.id);
  setCookie(res, token);
  sendJson(res, 200, { user: serializeUser(user) });
});

addRoute("POST", /^\/api\/auth\/logout$/, async (req, res, db) => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[SESSION_COOKIE]) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(cookies[SESSION_COOKIE]);
  }
  clearCookie(res);
  sendEmpty(res, 204);
});

addRoute("GET", /^\/api\/dashboard$/, async (req, res, db) => {
  const user = requireUser(db, req, res);
  if (!user) {
    return;
  }

  sendJson(res, 200, { user: serializeUser(user), ...getDashboard(db, user) });
});

addRoute("GET", /^\/api\/notifications$/, async (req, res, db) => {
  // Providers need this too: the expiry-automation sweep (lib/expiry.js)
  // writes "listing expiring soon" alerts with the provider as recipient,
  // so this endpoint has to be reachable by all three roles, not just
  // ngo/consumer (who get the separate "nearby quick rescue" alerts).
  const user = requireUser(db, req, res, ["provider", "ngo", "consumer"]);
  if (!user) {
    return;
  }

  sendJson(res, 200, { notifications: getNotificationsForUser(db, user.id) });
});

addRoute("GET", /^\/api\/providers\/network$/, async (req, res, db) => {
  const user = requireUser(db, req, res, ["provider"]);
  if (!user) {
    return;
  }

  const providers = db.prepare(`
    SELECT
      users.id,
      users.display_name,
      users.contact_name,
      users.phone,
      users.address,
      users.business_type,
      COUNT(items.id) AS active_listings
    FROM users
    LEFT JOIN items ON items.provider_id = users.id AND items.status = 'available'
    WHERE users.role = 'provider' AND users.id != ?
    GROUP BY users.id, users.display_name, users.contact_name, users.phone, users.address, users.business_type
    ORDER BY active_listings DESC, users.display_name ASC
  `).all(user.id);

  sendJson(res, 200, { providers });
});

addRoute("GET", /^\/api\/items$/, async (req, res, db) => {
  const url = new URL(req.url, "http://localhost");
  const scope = url.searchParams.get("scope");
  const viewer = getCurrentUser(db, req);

  if (scope === "mine") {
    const user = requireUser(db, req, res, ["provider"]);
    if (!user) {
      return;
    }

    return sendJson(res, 200, {
      items: getAvailableItems(db, user, {
        scope,
        status: url.searchParams.get("status") || undefined,
        search: url.searchParams.get("search") || undefined
      })
    });
  }

  const user = requireUser(db, req, res, ["ngo", "consumer"]);
  if (!user) {
    return;
  }

  const items = getAvailableItems(db, viewer, {
    audience: url.searchParams.get("audience") || user.role,
    search: url.searchParams.get("search") || undefined,
    category: url.searchParams.get("category") || undefined,
    expirationDays: url.searchParams.get("expirationDays") || undefined,
    distanceKm: url.searchParams.get("distanceKm") || undefined,
    sort: url.searchParams.get("sort") || undefined
  });

  sendJson(res, 200, { items });
});

addRoute("GET", /^\/api\/items\/(\d+)$/, async (req, res, db, match) => {
  const user = requireUser(db, req, res);
  if (!user) {
    return;
  }

  const item = getItemById(db, Number(match[1]), user);
  if (!item || !canViewItem(user, item)) {
    return sendError(res, 404, "Item not found.");
  }

  sendJson(res, 200, { item });
});

addRoute("POST", /^\/api\/items$/, async (req, res, db) => {
  const user = requireUser(db, req, res, ["provider"]);
  if (!user) {
    return;
  }

  const body = await readJsonBody(req);
  const name = String(body.name || "").trim();
  const unit = String(body.unit || "").trim();
  const quantityAvailable = toNumber(body.quantityAvailable, null);
  const priceRaw = body.pricePerUnit;
  const pricePerUnit = priceRaw === "" || priceRaw === undefined || priceRaw === null ? 0 : toNumber(priceRaw, null);
  const availableFrom = toIsoOrNull(body.availableFrom) || nowIso();
  const availableUntil = toIsoOrNull(body.availableUntil);
  const source = normalizeItemSource(body.source || "inventory");

  if (!name) {
    return sendError(res, 400, "Enter an item name.");
  }
  if (!unit) {
    return sendError(res, 400, "Choose a unit for this listing.");
  }
  if (!quantityAvailable || quantityAvailable <= 0) {
    return sendError(res, 400, "Enter a quantity greater than 0.");
  }
  if (pricePerUnit === null || pricePerUnit < 0) {
    return sendError(res, 400, "Price per unit must be 0 or more.");
  }
  if (availableUntil && availableFrom && new Date(availableUntil).getTime() < new Date(availableFrom).getTime()) {
    return sendError(res, 400, "Available until must be later than available from.");
  }

  const itemId = insertItem(db, {
    providerId: user.id,
    name,
    description: String(body.description || "").trim(),
    category: normalizeCategory(body.category),
    quantityAvailable,
    unit,
    expirationDate: toIsoOrNull(body.expirationDate),
    isPacked: Boolean(body.isPacked),
    locationText: String(body.locationText || user.address || "").trim(),
    latitude: toNumber(body.latitude, user.latitude),
    longitude: toNumber(body.longitude, user.longitude),
    availableFrom,
    availableUntil,
    listingType: normalizeListingType(body.listingType),
    audience: normalizeAudience(body.audience),
    source,
    pricePerUnit,
    status: normalizeItemStatus(body.status),
    donorNotes: String(body.donorNotes || "").trim(),
    imageUrl: String(body.imageUrl || "").trim(),
    barcodeImageUrl: String(body.barcodeImageUrl || "").trim()
  });

  if (String(body.source || "").trim() === "quick_rescue") {
    createNearbyNotifications(db, itemId);
  }

  sendJson(res, 201, { item: getItemById(db, itemId, user) });
});

addRoute("PUT", /^\/api\/items\/(\d+)$/, async (req, res, db, match) => {
  const user = requireUser(db, req, res, ["provider"]);
  if (!user) {
    return;
  }

  const itemId = Number(match[1]);
  const existing = db.prepare("SELECT * FROM items WHERE id = ? AND provider_id = ?").get(itemId, user.id);
  if (!existing) {
    return sendError(res, 404, "Item not found.");
  }

  const body = await readJsonBody(req);
  db.prepare(`
    UPDATE items
    SET
      name = ?,
      description = ?,
      category = ?,
      quantity_available = ?,
      unit = ?,
      expiration_date = ?,
      is_packed = ?,
      location_text = ?,
      latitude = ?,
      longitude = ?,
      available_from = ?,
      available_until = ?,
      listing_type = ?,
      audience = ?,
      source = ?,
      price_per_unit = ?,
      status = ?,
      donor_notes = ?,
      image_url = ?,
      barcode_image_url = ?,
      updated_at = ?
    WHERE id = ? AND provider_id = ?
  `).run(
    String(body.name || existing.name).trim(),
    String(body.description ?? existing.description ?? "").trim(),
    normalizeCategory(body.category || existing.category),
    toNumber(body.quantityAvailable, existing.quantity_available),
    String(body.unit || existing.unit).trim(),
    toIsoOrNull(body.expirationDate) || existing.expiration_date,
    body.isPacked === undefined ? existing.is_packed : body.isPacked ? 1 : 0,
    String(body.locationText || existing.location_text || user.address || "").trim(),
    toNumber(body.latitude, existing.latitude),
    toNumber(body.longitude, existing.longitude),
    toIsoOrNull(body.availableFrom) || existing.available_from,
    toIsoOrNull(body.availableUntil) || existing.available_until,
    normalizeListingType(body.listingType || existing.listing_type),
    normalizeAudience(body.audience || existing.audience),
    normalizeItemSource(body.source || existing.source || "inventory"),
    toNumber(body.pricePerUnit, existing.price_per_unit),
    normalizeItemStatus(body.status || existing.status),
    String(body.donorNotes ?? existing.donor_notes ?? "").trim(),
    String(body.imageUrl ?? existing.image_url ?? "").trim(),
    String(body.barcodeImageUrl ?? existing.barcode_image_url ?? "").trim(),
    nowIso(),
    itemId,
    user.id
  );

  sendJson(res, 200, { item: getItemById(db, itemId, user) });
});

addRoute("PATCH", /^\/api\/items\/(\d+)\/status$/, async (req, res, db, match) => {
  const user = requireUser(db, req, res, ["provider"]);
  if (!user) {
    return;
  }

  const body = await readJsonBody(req);
  const status = normalizeItemStatus(body.status);
  db.prepare("UPDATE items SET status = ?, updated_at = ? WHERE id = ? AND provider_id = ?").run(
    status,
    nowIso(),
    Number(match[1]),
    user.id
  );
  sendJson(res, 200, { status });
});
addRoute("GET", /^\/api\/requests$/, async (req, res, db) => {
  const user = requireUser(db, req, res, ["provider", "ngo"]);
  if (!user) {
    return;
  }

  sendJson(res, 200, { requests: getRequestsForUser(db, user) });
});

addRoute("POST", /^\/api\/requests$/, async (req, res, db) => {
  const user = requireUser(db, req, res, ["ngo"]);
  if (!user) {
    return;
  }

  const body = await readJsonBody(req);
  const item = getItemById(db, Number(body.itemId), user);
  const quantity = toNumber(body.quantity, null);
  if (!item || !canViewItem(user, item)) {
    return sendError(res, 404, "Item not found.");
  }
  if (!quantity || quantity <= 0 || quantity > item.quantityAvailable) {
    return sendError(res, 400, "Choose a valid quantity.");
  }

  const requestId = Number(
    db.prepare(`
      INSERT INTO ngo_requests (item_id, ngo_id, quantity, status, note, pickup_window_start, pickup_window_end, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)
    `).run(
      item.id,
      user.id,
      quantity,
      String(body.note || "").trim(),
      toIsoOrNull(body.pickupWindowStart),
      toIsoOrNull(body.pickupWindowEnd),
      nowIso(),
      nowIso()
    ).lastInsertRowid
  );

  if (body.note) {
    db.prepare(`
      INSERT INTO messages (request_id, sender_id, body, created_at)
      VALUES (?, ?, ?, ?)
    `).run(requestId, user.id, String(body.note).trim(), nowIso());
  }

  const requests = getRequestsForUser(db, user);
  const createdRequest = requests.find((request) => request.id === requestId);
  sendJson(res, 201, { request: createdRequest });
});

addRoute("PATCH", /^\/api\/requests\/(\d+)$/, async (req, res, db, match) => {
  const user = requireUser(db, req, res, ["provider", "ngo"]);
  if (!user) {
    return;
  }

  const requestId = Number(match[1]);
  const body = await readJsonBody(req);
  const requestRow = db.prepare(`
    SELECT ngo_requests.*, items.provider_id, items.quantity_available
    FROM ngo_requests
    JOIN items ON items.id = ngo_requests.item_id
    WHERE ngo_requests.id = ?
  `).get(requestId);

  if (!requestRow) {
    return sendError(res, 404, "Request not found.");
  }

  if (user.role === "ngo" && requestRow.ngo_id !== user.id) {
    return sendError(res, 403, "This request does not belong to your NGO.");
  }

  if (user.role === "provider" && requestRow.provider_id !== user.id) {
    return sendError(res, 403, "This request is not for your inventory.");
  }

  const nextStatus = String(body.status || "").trim();
  const allowedForProvider = ["approved", "rejected", "fulfilled", "delivered"];
  const allowedForNgo = ["cancelled", "delivered"];
  const allowedStatuses = user.role === "provider" ? allowedForProvider : allowedForNgo;
  if (!allowedStatuses.includes(nextStatus)) {
    return sendError(res, 400, "Invalid request status transition.");
  }

  if (nextStatus === "approved") {
    if (requestRow.status !== "pending") {
      return sendError(res, 400, "Only pending requests can be approved.");
    }
    if (requestRow.quantity > requestRow.quantity_available) {
      return sendError(res, 400, "Not enough quantity left to approve this request.");
    }

    db.prepare(`
      UPDATE items
      SET quantity_available = quantity_available - ?, updated_at = ?, status = CASE WHEN quantity_available - ? <= 0 THEN 'reserved' ELSE status END
      WHERE id = ?
    `).run(requestRow.quantity, nowIso(), requestRow.quantity, requestRow.item_id);
  }

  if (nextStatus === "fulfilled" && requestRow.status !== "approved") {
    return sendError(res, 400, "Only approved requests can be marked fulfilled.");
  }

  if (nextStatus === "delivered" && !["approved", "fulfilled"].includes(requestRow.status)) {
    return sendError(res, 400, "Only approved or fulfilled requests can be marked delivered.");
  }

  if (nextStatus === "cancelled" && requestRow.status !== "pending") {
    return sendError(res, 400, "Only pending requests can be cancelled.");
  }

  db.prepare("UPDATE ngo_requests SET status = ?, updated_at = ? WHERE id = ?").run(nextStatus, nowIso(), requestId);

  if (nextStatus === "delivered") {
    createTransactionIfMissing(db, {
      providerId: requestRow.provider_id,
      ngoId: requestRow.ngo_id,
      itemId: requestRow.item_id,
      quantity: requestRow.quantity,
      kind: "donation",
      status: "delivered"
    });
  }

  const refreshed = getRequestsForUser(db, getUserById(db, user.id)).find((request) => request.id === requestId);
  sendJson(res, 200, { request: refreshed });
});

addRoute("GET", /^\/api\/requests\/(\d+)\/messages$/, async (req, res, db, match) => {
  const user = requireUser(db, req, res, ["provider", "ngo"]);
  if (!user) {
    return;
  }

  const requestRow = db.prepare(`
    SELECT ngo_requests.id, ngo_requests.ngo_id, items.provider_id
    FROM ngo_requests
    JOIN items ON items.id = ngo_requests.item_id
    WHERE ngo_requests.id = ?
  `).get(Number(match[1]));

  if (!requestRow) {
    return sendError(res, 404, "Request not found.");
  }

  const allowed = requestRow.ngo_id === user.id || requestRow.provider_id === user.id;
  if (!allowed) {
    return sendError(res, 403, "You are not part of this thread.");
  }

  sendJson(res, 200, { messages: getMessagesForRequest(db, Number(match[1])) });
});

addRoute("POST", /^\/api\/requests\/(\d+)\/messages$/, async (req, res, db, match) => {
  const user = requireUser(db, req, res, ["provider", "ngo"]);
  if (!user) {
    return;
  }

  const requestId = Number(match[1]);
  const requestRow = db.prepare(`
    SELECT ngo_requests.id, ngo_requests.ngo_id, items.provider_id
    FROM ngo_requests
    JOIN items ON items.id = ngo_requests.item_id
    WHERE ngo_requests.id = ?
  `).get(requestId);

  if (!requestRow) {
    return sendError(res, 404, "Request not found.");
  }

  const allowed = requestRow.ngo_id === user.id || requestRow.provider_id === user.id;
  if (!allowed) {
    return sendError(res, 403, "You are not part of this thread.");
  }

  const body = await readJsonBody(req);
  if (!String(body.body || "").trim()) {
    return sendError(res, 400, "Message body is required.");
  }

  db.prepare("INSERT INTO messages (request_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)").run(
    requestId,
    user.id,
    String(body.body).trim(),
    nowIso()
  );

  sendJson(res, 201, { messages: getMessagesForRequest(db, requestId) });
});

addRoute("GET", /^\/api\/cart$/, async (req, res, db) => {
  const user = requireUser(db, req, res, ["consumer"]);
  if (!user) {
    return;
  }

  sendJson(res, 200, { cart: getCart(db, user.id) });
});

addRoute("POST", /^\/api\/cart\/items$/, async (req, res, db) => {
  const user = requireUser(db, req, res, ["consumer"]);
  if (!user) {
    return;
  }

  const body = await readJsonBody(req);
  const item = getItemById(db, Number(body.itemId), user);
  const quantity = toNumber(body.quantity, null);
  if (!item || !canViewItem(user, item)) {
    return sendError(res, 404, "Item not found.");
  }
  if (!quantity || quantity <= 0 || quantity > item.quantityAvailable) {
    return sendError(res, 400, "Choose a valid quantity.");
  }

  db.prepare(`
    INSERT INTO cart_items (consumer_id, item_id, quantity, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(consumer_id, item_id) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at
  `).run(user.id, item.id, quantity, nowIso(), nowIso());

  sendJson(res, 200, { cart: getCart(db, user.id) });
});

addRoute("PATCH", /^\/api\/cart\/items\/(\d+)$/, async (req, res, db, match) => {
  const user = requireUser(db, req, res, ["consumer"]);
  if (!user) {
    return;
  }

  const itemId = Number(match[1]);
  const body = await readJsonBody(req);
  const quantity = toNumber(body.quantity, null);

  if (!quantity || quantity <= 0) {
    db.prepare("DELETE FROM cart_items WHERE consumer_id = ? AND item_id = ?").run(user.id, itemId);
    return sendJson(res, 200, { cart: getCart(db, user.id) });
  }

  const item = getItemById(db, itemId, user);
  if (!item || quantity > item.quantityAvailable) {
    return sendError(res, 400, "Quantity exceeds available stock.");
  }

  db.prepare("UPDATE cart_items SET quantity = ?, updated_at = ? WHERE consumer_id = ? AND item_id = ?").run(
    quantity,
    nowIso(),
    user.id,
    itemId
  );

  sendJson(res, 200, { cart: getCart(db, user.id) });
});

addRoute("DELETE", /^\/api\/cart\/items\/(\d+)$/, async (req, res, db, match) => {
  const user = requireUser(db, req, res, ["consumer"]);
  if (!user) {
    return;
  }

  db.prepare("DELETE FROM cart_items WHERE consumer_id = ? AND item_id = ?").run(user.id, Number(match[1]));
  sendJson(res, 200, { cart: getCart(db, user.id) });
});

addRoute("POST", /^\/api\/reservations\/checkout$/, async (req, res, db) => {
  const user = requireUser(db, req, res, ["consumer"]);
  if (!user) {
    return;
  }

  const body = await readJsonBody(req);
  const cart = getCart(db, user.id);
  if (!cart.items.length) {
    return sendError(res, 400, "Your cart is empty.");
  }

  const createdReservations = [];
  for (const cartItem of cart.items) {
    const item = getItemById(db, cartItem.itemId, user);
    if (!item || cartItem.quantity > item.quantityAvailable) {
      return sendError(res, 400, `Not enough quantity left for ${cartItem.name}.`);
    }

    const totalAmount = Number((cartItem.quantity * item.pricePerUnit).toFixed(2));
    const result = db.prepare(`
      INSERT INTO reservations (consumer_id, item_id, quantity, total_amount, note, status, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?, ?)
    `).run(
      user.id,
      item.id,
      cartItem.quantity,
      totalAmount,
      String(body.note || "").trim(),
      startOfFuture(12),
      nowIso(),
      nowIso()
    );

    db.prepare(`
      UPDATE items
      SET quantity_available = quantity_available - ?, updated_at = ?, status = CASE WHEN quantity_available - ? <= 0 THEN 'reserved' ELSE status END
      WHERE id = ?
    `).run(cartItem.quantity, nowIso(), cartItem.quantity, item.id);

    createdReservations.push(Number(result.lastInsertRowid));
  }

  db.prepare("DELETE FROM cart_items WHERE consumer_id = ?").run(user.id);
  const reservations = getReservationsForUser(db, user).filter((reservation) => createdReservations.includes(reservation.id));
  sendJson(res, 201, { reservations });
});

addRoute("GET", /^\/api\/reservations$/, async (req, res, db) => {
  const user = requireUser(db, req, res, ["provider", "consumer"]);
  if (!user) {
    return;
  }

  sendJson(res, 200, { reservations: getReservationsForUser(db, user) });
});

addRoute("PATCH", /^\/api\/reservations\/(\d+)$/, async (req, res, db, match) => {
  const user = requireUser(db, req, res, ["provider", "consumer"]);
  if (!user) {
    return;
  }

  const reservationId = Number(match[1]);
  const body = await readJsonBody(req);
  const reservationRow = db.prepare(`
    SELECT reservations.*, items.provider_id
    FROM reservations
    JOIN items ON items.id = reservations.item_id
    WHERE reservations.id = ?
  `).get(reservationId);

  if (!reservationRow) {
    return sendError(res, 404, "Reservation not found.");
  }

  const isOwner = user.role === "consumer" ? reservationRow.consumer_id === user.id : reservationRow.provider_id === user.id;
  if (!isOwner) {
    return sendError(res, 403, "You do not have access to this reservation.");
  }

  const status = String(body.status || "").trim();
  if (!["collected", "cancelled"].includes(status)) {
    return sendError(res, 400, "Invalid reservation status.");
  }
  if (reservationRow.status !== "reserved") {
    return sendError(res, 400, "Only active reservations can be updated.");
  }

  db.prepare("UPDATE reservations SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), reservationId);

  if (status === "cancelled") {
    db.prepare("UPDATE items SET quantity_available = quantity_available + ?, updated_at = ?, status = 'available' WHERE id = ?").run(
      reservationRow.quantity,
      nowIso(),
      reservationRow.item_id
    );
  }

  if (status === "collected") {
    createTransactionIfMissing(db, {
      providerId: reservationRow.provider_id,
      consumerId: reservationRow.consumer_id,
      itemId: reservationRow.item_id,
      quantity: reservationRow.quantity,
      kind: "reservation",
      status: "collected"
    });
  }

  const reservations = getReservationsForUser(db, getUserById(db, user.id));
  sendJson(res, 200, { reservation: reservations.find((entry) => entry.id === reservationId) });
});

addRoute("GET", /^\/api\/analytics\/impact$/, async (req, res, db) => {
  const user = requireUser(db, req, res);
  if (!user) {
    return;
  }

  sendJson(res, 200, getImpactAnalytics(db));
});

addRoute("GET", /^\/api\/ml\/waste-risk$/, async (req, res, db) => {
  const user = requireUser(db, req, res, ["provider"]);
  if (!user) {
    return;
  }

  sendJson(res, 200, getWasteRiskForProvider(db, user.id));
});

addRoute("GET", /^\/api\/recommendations$/, async (req, res, db) => {
  const user = requireUser(db, req, res, ["ngo", "consumer"]);
  if (!user) {
    return;
  }

  sendJson(res, 200, getRecommendations(db, user));
});

addRoute("POST", /^\/api\/maintenance\/expiry-sweep$/, async (req, res, db) => {
  // Any authenticated user can trigger this manually (there is no admin
  // role in this MVP); a real deployment would restrict this to an admin
  // role or a signed cron/worker request instead of the general user pool.
  // It also runs automatically on a timer -- see scheduleExpirySweep below --
  // this endpoint exists so the behaviour can be demonstrated on demand.
  const user = requireUser(db, req, res);
  if (!user) {
    return;
  }

  sendJson(res, 200, runExpirySweep(db));
});

async function handleApi(req, res, db) {
  const pathname = new URL(req.url, "http://localhost").pathname;

  for (const route of ROUTES) {
    if (route.method !== req.method) {
      continue;
    }

    const match = pathname.match(route.pattern);
    if (match) {
      try {
        await route.handler(req, res, db, match);
      } catch (error) {
        sendError(res, 500, error.message || "Unexpected server error.");
      }
      return true;
    }
  }

  return false;
}

function serveStaticFile(req, res) {
  const parsed = new URL(req.url, "http://localhost");
  let filePath = path.join(PUBLIC_DIR, parsed.pathname === "/" ? "index.html" : parsed.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendError(res, 403, "Forbidden.");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }

  const extension = path.extname(filePath);
  const mimeType = MIME_TYPES[extension] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": mimeType,
    "Content-Length": content.length
  });
  res.end(content);
}

function createAppServer() {
  const db = openDatabase();
  scheduleExpirySweep(db);

  return http.createServer(async (req, res) => {
    if (!req.url) {
      return sendError(res, 400, "Bad request.");
    }

    if (req.url.startsWith("/api/")) {
      const handled = await handleApi(req, res, db);
      if (!handled && !res.writableEnded) {
        sendError(res, 404, "Endpoint not found.");
      }
      return;
    }

    if (req.method !== "GET") {
      return sendError(res, 405, "Method not allowed.");
    }

    serveStaticFile(req, res);
  });
}

if (require.main === module) {
  const server = createAppServer();
  server.listen(PORT, () => {
    process.stdout.write(`FoodFlow Connect running at http://localhost:${PORT}\n`);
  });
}

module.exports = {
  createAppServer,
  openDatabase
};


