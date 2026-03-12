const ROOT = document.getElementById("app");
const state = {
  me: null,
  flash: null,
  authMode: "register",
  shortcutsOpen: false
};

const motion = {
  observer: null,
  reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches
};


const cursorFx = {
  raf: null,
  x: -999,
  y: -999,
  ringX: -999,
  ringY: -999,
  enabled: window.matchMedia("(pointer: fine)").matches
};

const NAV_ITEMS = {
  provider: [
    ["home", "Home"],
    ["inventory", "Inventory"],
    ["availability", "Availability"],
    ["network", "Network"],
    ["trash", "Trash/Donation"]
  ],
  ngo: [
    ["home", "Home"],
    ["discover", "Discover"],
    ["requests", "Requests"],
    ["history", "History"]
  ],
  consumer: [
    ["home", "Home"],
    ["browse", "Browse"],
    ["cart", "Cart"],
    ["checkout", "Checkout"],
    ["orders", "Orders"]
  ]
};

const DEMO_ACCOUNTS = {
  provider: { email: "provider@freshplate.demo", password: "demo12345" },
  ngo: { email: "ngo@carebridge.demo", password: "demo12345" },
  consumer: { email: "consumer@neighbor.demo", password: "demo12345" }
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  if (!value) {
    return "Not specified";
  }
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatMoney(value) {
  return Number(value || 0) <= 0
    ? "Free"
    : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function formatQty(value, unit = "units") {
  return `${Number(value || 0)} ${unit}`;
}

function setFlash(message, tone = "success") {
  state.flash = { message, tone };
}

function consumeFlash() {
  if (!state.flash) {
    return "";
  }
  const flash = `<div class="flash flash-${state.flash.tone}">${escapeHtml(state.flash.message)}</div>`;
  state.flash = null;
  return flash;
}

const DEMO_STORAGE_KEY = "foodflow-demo-db-v1";
const DEMO_SESSION_KEY = "foodflow-demo-session-v1";
const DEMO_VERSION = 1;

function demoNowIso() {
  return new Date().toISOString();
}

function demoFutureHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function demoClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function demoDelay(ms = 90) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function demoToNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function demoToIsoOrNull(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function demoNormalizeAudience(value) {
  return ["ngo", "consumer", "both"].includes(value) ? value : "ngo";
}

function demoNormalizeListingType(value) {
  return ["donation", "sale", "free_public"].includes(value) ? value : "donation";
}

function demoNormalizeStatus(value) {
  return ["draft", "available", "reserved", "fulfilled", "expired", "archived"].includes(value)
    ? value
    : "available";
}

function demoNormalizeCategory(value) {
  return value ? String(value).trim().slice(0, 60) : "Prepared Food";
}

function demoHaversineDistanceKm(lat1, lng1, lat2, lng2) {
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

function createDemoSeed() {
  const users = [
    {
      id: 1,
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
    },
    {
      id: 2,
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
    },
    {
      id: 3,
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
    },
    {
      id: 4,
      email: "ngo@carebridge.demo",
      password: "demo12345",
      role: "ngo",
      displayName: "CareBridge Foundation",
      contactName: "Vikram Rao",
      phone: "+91 90000 20001",
      address: "BTM Layout, Bengaluru",
      businessType: null,
      latitude: 12.9166,
      longitude: 77.6101
    },
    {
      id: 5,
      email: "ngo@hopeharvest.demo",
      password: "demo12345",
      role: "ngo",
      displayName: "Hope Harvest NGO",
      contactName: "Sana Khan",
      phone: "+91 90000 20002",
      address: "Domlur, Bengaluru",
      businessType: null,
      latitude: 12.9611,
      longitude: 77.6387
    },
    {
      id: 6,
      email: "consumer@neighbor.demo",
      password: "demo12345",
      role: "consumer",
      displayName: "Maya Patel",
      contactName: "Maya Patel",
      phone: "+91 90000 30001",
      address: "Bellandur, Bengaluru",
      businessType: null,
      latitude: 12.9304,
      longitude: 77.6784
    }
  ];

  const items = [
    {
      id: 1,
      providerId: 1,
      name: "Packed Veg Biryani",
      description: "Freshly packed portions from lunch service.",
      category: "Prepared Food",
      quantityAvailable: 35,
      unit: "boxes",
      expirationDate: demoFutureHours(14),
      isPacked: true,
      locationText: "Koramangala pickup counter",
      latitude: 12.9352,
      longitude: 77.6245,
      availableFrom: demoNowIso(),
      availableUntil: demoFutureHours(8),
      listingType: "donation",
      audience: "ngo",
      pricePerUnit: 0,
      status: "available",
      donorNotes: "Best collected before evening."
    },
    {
      id: 2,
      providerId: 2,
      name: "Seasonal Fruit Crates",
      description: "Mixed fruit close to sell-by but still fresh.",
      category: "Produce",
      quantityAvailable: 12,
      unit: "crates",
      expirationDate: demoFutureHours(36),
      isPacked: false,
      locationText: "Indiranagar loading bay",
      latitude: 12.9784,
      longitude: 77.6408,
      availableFrom: demoNowIso(),
      availableUntil: demoFutureHours(24),
      listingType: "sale",
      audience: "both",
      pricePerUnit: 120,
      status: "available",
      donorNotes: "Can split into smaller lots."
    },
    {
      id: 3,
      providerId: 3,
      name: "Paneer Wrap Platters",
      description: "Event surplus, safe for same-day distribution.",
      category: "Prepared Food",
      quantityAvailable: 48,
      unit: "packs",
      expirationDate: demoFutureHours(10),
      isPacked: true,
      locationText: "HSR banquet dispatch desk",
      latitude: 12.9116,
      longitude: 77.6474,
      availableFrom: demoNowIso(),
      availableUntil: demoFutureHours(6),
      listingType: "free_public",
      audience: "both",
      pricePerUnit: 0,
      status: "available",
      donorNotes: "Quick rescue listing from wedding event."
    },
    {
      id: 4,
      providerId: 1,
      name: "Bread Loaves",
      description: "Same-day bakery overproduction.",
      category: "Bakery",
      quantityAvailable: 20,
      unit: "loaves",
      expirationDate: demoFutureHours(20),
      isPacked: false,
      locationText: "Koramangala bakery entrance",
      latitude: 12.9352,
      longitude: 77.6245,
      availableFrom: demoNowIso(),
      availableUntil: demoFutureHours(10),
      listingType: "sale",
      audience: "consumer",
      pricePerUnit: 35,
      status: "available",
      donorNotes: "Available for same-day collection."
    }
  ];

  const requests = [
    {
      id: 1,
      itemId: 1,
      ngoId: 4,
      quantity: 10,
      status: "approved",
      note: "Can pick up with insulated van.",
      pickupWindowStart: demoFutureHours(1),
      pickupWindowEnd: demoFutureHours(4),
      createdAt: demoNowIso(),
      updatedAt: demoNowIso(),
      messages: [
        {
          id: 1,
          requestId: 1,
          senderId: 4,
          senderName: "CareBridge Foundation",
          senderRole: "ngo",
          body: "Our driver can reach by 5 PM.",
          createdAt: demoNowIso()
        },
        {
          id: 2,
          requestId: 1,
          senderId: 1,
          senderName: "Fresh Plate Kitchen",
          senderRole: "provider",
          body: "Confirmed. Ask for the loading team at the back gate.",
          createdAt: demoNowIso()
        }
      ]
    }
  ];

  const reservations = [
    {
      id: 1,
      consumerId: 6,
      itemId: 4,
      quantity: 2,
      totalAmount: 70,
      note: "Picking up after work.",
      status: "collected",
      expiresAt: demoFutureHours(6),
      createdAt: demoNowIso(),
      updatedAt: demoNowIso()
    }
  ];

  const transactions = [
    {
      id: 1,
      providerId: 1,
      ngoId: 4,
      consumerId: null,
      itemId: 1,
      quantity: 10,
      kind: "donation",
      status: "delivered",
      completedAt: demoNowIso()
    },
    {
      id: 2,
      providerId: 3,
      ngoId: 5,
      consumerId: null,
      itemId: 3,
      quantity: 20,
      kind: "donation",
      status: "delivered",
      completedAt: demoNowIso()
    },
    {
      id: 3,
      providerId: 1,
      ngoId: null,
      consumerId: 6,
      itemId: 4,
      quantity: 2,
      kind: "reservation",
      status: "collected",
      completedAt: demoNowIso()
    }
  ];

  return {
    version: DEMO_VERSION,
    users,
    items,
    requests,
    reservations,
    transactions,
    cartItems: [],
    counters: {
      users: 7,
      items: 5,
      requests: 2,
      messages: 3,
      reservations: 2,
      transactions: 4
    }
  };
}

function loadDemoStore() {
  const raw = localStorage.getItem(DEMO_STORAGE_KEY);
  if (!raw) {
    const seeded = createDemoSeed();
    saveDemoStore(seeded);
    return seeded;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== DEMO_VERSION) {
      const seeded = createDemoSeed();
      saveDemoStore(seeded);
      return seeded;
    }
    return parsed;
  } catch (_error) {
    const seeded = createDemoSeed();
    saveDemoStore(seeded);
    return seeded;
  }
}

function saveDemoStore(store) {
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(store));
}

function getDemoSessionUserId() {
  return Number(localStorage.getItem(DEMO_SESSION_KEY) || 0);
}

function setDemoSessionUserId(userId) {
  if (userId) {
    localStorage.setItem(DEMO_SESSION_KEY, String(userId));
  } else {
    localStorage.removeItem(DEMO_SESSION_KEY);
  }
}

function serializeDemoUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    contactName: user.contactName,
    phone: user.phone,
    address: user.address,
    businessType: user.businessType,
    latitude: user.latitude,
    longitude: user.longitude
  };
}

function getDemoUser(store, userId) {
  return store.users.find((user) => user.id === userId) || null;
}

function getCurrentDemoUser(store) {
  return getDemoUser(store, getDemoSessionUserId());
}

function nextDemoId(store, key) {
  const current = store.counters[key] || 1;
  store.counters[key] = current + 1;
  return current;
}

function buildDemoItemView(store, item, viewer = null) {
  const provider = getDemoUser(store, item.providerId);
  const sourceLat = item.latitude ?? provider?.latitude ?? null;
  const sourceLng = item.longitude ?? provider?.longitude ?? null;
  const distanceKm = viewer && viewer.latitude !== null && viewer.longitude !== null
    ? demoHaversineDistanceKm(viewer.latitude, viewer.longitude, sourceLat, sourceLng)
    : null;

  return {
    id: item.id,
    providerId: item.providerId,
    providerName: provider?.displayName || "Provider",
    providerContact: provider?.contactName || "",
    providerPhone: provider?.phone || "",
    providerAddress: provider?.address || "",
    providerBusinessType: provider?.businessType || null,
    name: item.name,
    description: item.description,
    category: item.category,
    quantityAvailable: item.quantityAvailable,
    unit: item.unit,
    expirationDate: item.expirationDate,
    isPacked: Boolean(item.isPacked),
    locationText: item.locationText,
    latitude: item.latitude,
    longitude: item.longitude,
    availableFrom: item.availableFrom,
    availableUntil: item.availableUntil,
    listingType: item.listingType,
    audience: item.audience,
    pricePerUnit: item.pricePerUnit,
    status: item.status,
    donorNotes: item.donorNotes,
    distanceKm
  };
}

function buildDemoRequestView(store, request) {
  const item = store.items.find((entry) => entry.id === request.itemId);
  const provider = item ? getDemoUser(store, item.providerId) : null;
  const ngo = getDemoUser(store, request.ngoId);

  return {
    id: request.id,
    itemId: request.itemId,
    itemName: item?.name || "Item",
    itemUnit: item?.unit || "units",
    providerId: provider?.id || null,
    providerName: provider?.displayName || "Provider",
    providerContact: provider?.contactName || "",
    providerPhone: provider?.phone || "",
    ngoId: ngo?.id || null,
    ngoName: ngo?.displayName || "NGO",
    quantity: request.quantity,
    status: request.status,
    note: request.note,
    pickupWindowStart: request.pickupWindowStart,
    pickupWindowEnd: request.pickupWindowEnd,
    locationText: item?.locationText || provider?.address || "",
    expirationDate: item?.expirationDate || null,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    messages: demoClone(request.messages || []).map((message) => ({
      ...message,
      senderName: getDemoUser(store, message.senderId)?.displayName || message.senderName,
      senderRole: getDemoUser(store, message.senderId)?.role || message.senderRole
    }))
  };
}

function buildDemoReservationView(store, reservation) {
  const item = store.items.find((entry) => entry.id === reservation.itemId);
  const provider = item ? getDemoUser(store, item.providerId) : null;
  const consumer = getDemoUser(store, reservation.consumerId);

  return {
    id: reservation.id,
    itemId: reservation.itemId,
    itemName: item?.name || "Item",
    itemUnit: item?.unit || "units",
    providerId: provider?.id || null,
    providerName: provider?.displayName || "Provider",
    providerContact: provider?.contactName || "",
    providerPhone: provider?.phone || "",
    consumerId: consumer?.id || null,
    consumerName: consumer?.displayName || "Consumer",
    quantity: reservation.quantity,
    totalAmount: reservation.totalAmount,
    note: reservation.note,
    status: reservation.status,
    locationText: item?.locationText || provider?.address || "",
    expiresAt: reservation.expiresAt,
    pricePerUnit: item?.pricePerUnit || 0,
    createdAt: reservation.createdAt
  };
}

function getDemoCart(store, consumerId) {
  const items = store.cartItems
    .filter((entry) => entry.consumerId === consumerId)
    .map((entry) => {
      const item = store.items.find((candidate) => candidate.id === entry.itemId);
      const provider = item ? getDemoUser(store, item.providerId) : null;
      return {
        itemId: entry.itemId,
        name: item?.name || "Item",
        quantity: entry.quantity,
        availableQuantity: item?.quantityAvailable || 0,
        unit: item?.unit || "units",
        pricePerUnit: item?.pricePerUnit || 0,
        expirationDate: item?.expirationDate || null,
        providerName: provider?.displayName || "Provider",
        locationText: item?.locationText || provider?.address || "",
        lineTotal: Number(((item?.pricePerUnit || 0) * entry.quantity).toFixed(2))
      };
    });

  return {
    items,
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2))
  };
}

function getDemoLeaderboards(store) {
  const providerLeaderboard = store.users
    .filter((user) => user.role === "provider")
    .map((user) => {
      const providerTransactions = store.transactions.filter((transaction) => transaction.providerId === user.id);
      return {
        id: user.id,
        name: user.displayName,
        businessType: user.businessType,
        totalUnits: providerTransactions.reduce((sum, transaction) => sum + transaction.quantity, 0),
        totalTransactions: providerTransactions.length
      };
    })
    .sort((left, right) => right.totalUnits - left.totalUnits || right.totalTransactions - left.totalTransactions || left.name.localeCompare(right.name))
    .slice(0, 5);

  const ngoLeaderboard = store.users
    .filter((user) => user.role === "ngo")
    .map((user) => {
      const ngoTransactions = store.transactions.filter((transaction) => transaction.ngoId === user.id && transaction.kind === "donation");
      return {
        id: user.id,
        name: user.displayName,
        totalUnits: ngoTransactions.reduce((sum, transaction) => sum + transaction.quantity, 0),
        totalTransactions: ngoTransactions.length
      };
    })
    .sort((left, right) => right.totalUnits - left.totalUnits || right.totalTransactions - left.totalTransactions || left.name.localeCompare(right.name))
    .slice(0, 5);

  return {
    providerLeaderboard,
    ngoLeaderboard,
    stats: {
      activeListings: store.items.filter((item) => item.status === "available" && item.quantityAvailable > 0).length,
      totalProviders: store.users.filter((user) => user.role === "provider").length,
      totalNgos: store.users.filter((user) => user.role === "ngo").length,
      totalUnitsSaved: store.transactions.reduce((sum, transaction) => sum + transaction.quantity, 0)
    }
  };
}

function filterDemoItems(store, viewer, filters = {}) {
  let items = store.items.filter((item) => {
    if (filters.scope === "mine") {
      return item.providerId === viewer.id && (!filters.status || item.status === filters.status);
    }

    if (item.status !== "available" || item.quantityAvailable <= 0) {
      return false;
    }

    if (filters.audience) {
      return item.audience === filters.audience || item.audience === "both";
    }

    return true;
  }).map((item) => buildDemoItemView(store, item, viewer));

  if (filters.search) {
    const token = String(filters.search).trim().toLowerCase();
    items = items.filter((item) => [item.name, item.description, item.category].some((value) => String(value || "").toLowerCase().includes(token)));
  }

  if (filters.category) {
    items = items.filter((item) => item.category === filters.category);
  }

  if (filters.expirationDays) {
    const maxDays = Number(filters.expirationDays);
    const now = Date.now();
    items = items.filter((item) => {
      if (!item.expirationDate) {
        return false;
      }
      const days = (new Date(item.expirationDate).getTime() - now) / (1000 * 60 * 60 * 24);
      return days >= 0 && days <= maxDays;
    });
  }

  if (filters.distanceKm && viewer?.latitude !== null && viewer?.longitude !== null) {
    const limit = Number(filters.distanceKm);
    items = items.filter((item) => item.distanceKm !== null && item.distanceKm <= limit);
  }

  if (filters.sort === "closest") {
    items.sort((left, right) => (left.distanceKm ?? 9999) - (right.distanceKm ?? 9999));
  } else if (filters.sort === "quantity") {
    items.sort((left, right) => right.quantityAvailable - left.quantityAvailable);
  } else {
    items.sort((left, right) => {
      const leftTime = left.expirationDate ? new Date(left.expirationDate).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.expirationDate ? new Date(right.expirationDate).getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });
  }

  return items;
}

function getDemoRequestsForUser(store, user) {
  return store.requests
    .filter((request) => {
      const item = store.items.find((entry) => entry.id === request.itemId);
      if (!item) {
        return false;
      }
      return user.role === "ngo" ? request.ngoId === user.id : item.providerId === user.id;
    })
    .map((request) => buildDemoRequestView(store, request))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function getDemoReservationsForUser(store, user) {
  return store.reservations
    .filter((reservation) => {
      const item = store.items.find((entry) => entry.id === reservation.itemId);
      if (!item) {
        return false;
      }
      return user.role === "consumer" ? reservation.consumerId === user.id : item.providerId === user.id;
    })
    .map((reservation) => buildDemoReservationView(store, reservation))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function buildDemoDashboard(store, user) {
  if (user.role === "provider") {
    const providerItems = store.items.filter((item) => item.providerId === user.id);
    const providerRequests = getDemoRequestsForUser(store, user);
    const providerReservations = getDemoReservationsForUser(store, user);
    return {
      metrics: {
        activeListings: providerItems.filter((item) => item.status === "available").length,
        pendingRequests: providerRequests.filter((request) => request.status === "pending").length,
        reservedOrders: providerReservations.filter((reservation) => reservation.status === "reserved").length,
        rescuedUnits: store.transactions.filter((transaction) => transaction.providerId === user.id).reduce((sum, transaction) => sum + transaction.quantity, 0)
      },
      recentRequests: providerRequests.slice(0, 5),
      recentReservations: providerReservations.slice(0, 5)
    };
  }

  if (user.role === "ngo") {
    const ngoRequests = getDemoRequestsForUser(store, user);
    return {
      metrics: {
        pendingRequests: ngoRequests.filter((request) => request.status === "pending").length,
        totalRequests: ngoRequests.length,
        deliveredUnits: store.transactions.filter((transaction) => transaction.ngoId === user.id && transaction.kind === "donation").reduce((sum, transaction) => sum + transaction.quantity, 0),
        discoverableItems: filterDemoItems(store, user, { audience: "ngo" }).length
      },
      recentRequests: ngoRequests.slice(0, 6)
    };
  }

  const reservations = getDemoReservationsForUser(store, user);
  const cart = getDemoCart(store, user.id);
  return {
    metrics: {
      activeReservations: reservations.filter((reservation) => reservation.status === "reserved").length,
      cartItems: cart.items.length,
      browseItems: filterDemoItems(store, user, { audience: "consumer" }).length,
      collectedUnits: store.transactions.filter((transaction) => transaction.consumerId === user.id && transaction.kind === "reservation").reduce((sum, transaction) => sum + transaction.quantity, 0)
    },
    recentReservations: reservations.slice(0, 6)
  };
}

function requireDemoUser(store, allowedRoles = null) {
  const user = getCurrentDemoUser(store);
  if (!user) {
    throw new Error("Authentication required.");
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new Error("You do not have access to this resource.");
  }
  return user;
}

function canViewDemoItem(user, item) {
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

function ensureDemoTransaction(store, payload) {
  const exists = store.transactions.some((transaction) =>
    transaction.providerId === payload.providerId &&
    transaction.ngoId === (payload.ngoId ?? null) &&
    transaction.consumerId === (payload.consumerId ?? null) &&
    transaction.itemId === payload.itemId &&
    transaction.kind === payload.kind &&
    transaction.status === payload.status
  );

  if (!exists) {
    store.transactions.push({
      id: nextDemoId(store, "transactions"),
      providerId: payload.providerId,
      ngoId: payload.ngoId ?? null,
      consumerId: payload.consumerId ?? null,
      itemId: payload.itemId,
      quantity: payload.quantity,
      kind: payload.kind,
      status: payload.status,
      completedAt: demoNowIso()
    });
  }
}

async function api(path, options = {}) {
  await demoDelay();

  const url = new URL(path, "https://demo.foodflow.local");
  const method = String(options.method || "GET").toUpperCase();
  const body = options.body || {};
  const store = loadDemoStore();

  if (url.pathname === "/api/leaderboards" && method === "GET") {
    return demoClone({ user: serializeDemoUser(getCurrentDemoUser(store)), ...getDemoLeaderboards(store) });
  }

  if (url.pathname === "/api/auth/me" && method === "GET") {
    return { user: serializeDemoUser(getCurrentDemoUser(store)) };
  }

  if (url.pathname === "/api/auth/login" && method === "POST") {
    const user = store.users.find((entry) => entry.email.toLowerCase() === String(body.email || "").toLowerCase().trim());
    if (!user || user.password !== String(body.password || "")) {
      throw new Error("Incorrect email or password.");
    }
    setDemoSessionUserId(user.id);
    return { user: serializeDemoUser(user) };
  }

  if (url.pathname === "/api/auth/register" && method === "POST") {
    const email = String(body.email || "").toLowerCase().trim();
    if (!email || !body.password || String(body.password).length < 8) {
      throw new Error("Email and a password of at least 8 characters are required.");
    }
    if (store.users.some((entry) => entry.email === email)) {
      throw new Error("An account with this email already exists.");
    }
    if (!["provider", "ngo", "consumer"].includes(body.role)) {
      throw new Error("Choose a valid role.");
    }
    if (!body.displayName || !body.phone || !body.address) {
      throw new Error("Name, phone, and address are required.");
    }
    if (body.role === "provider" && !body.businessType) {
      throw new Error("Providers must choose a business type.");
    }

    const user = {
      id: nextDemoId(store, "users"),
      email,
      password: String(body.password),
      role: body.role,
      displayName: String(body.displayName).trim(),
      contactName: String(body.contactName || body.displayName).trim(),
      phone: String(body.phone).trim(),
      address: String(body.address).trim(),
      businessType: body.role === "provider" ? String(body.businessType).trim() : null,
      latitude: demoToNumber(body.latitude, null),
      longitude: demoToNumber(body.longitude, null)
    };
    store.users.push(user);
    saveDemoStore(store);
    setDemoSessionUserId(user.id);
    return { user: serializeDemoUser(user) };
  }

  if (url.pathname === "/api/auth/logout" && method === "POST") {
    setDemoSessionUserId(null);
    return null;
  }

  if (url.pathname === "/api/dashboard" && method === "GET") {
    const user = requireDemoUser(store);
    return demoClone({ user: serializeDemoUser(user), ...buildDemoDashboard(store, user) });
  }

  if (url.pathname === "/api/providers/network" && method === "GET") {
    const user = requireDemoUser(store, ["provider"]);
    const providers = store.users
      .filter((entry) => entry.role === "provider" && entry.id !== user.id)
      .map((entry) => ({
        id: entry.id,
        display_name: entry.displayName,
        contact_name: entry.contactName,
        phone: entry.phone,
        address: entry.address,
        business_type: entry.businessType,
        active_listings: store.items.filter((item) => item.providerId === entry.id && item.status === "available").length
      }))
      .sort((left, right) => right.active_listings - left.active_listings || left.display_name.localeCompare(right.display_name));
    return { providers };
  }

  if (url.pathname === "/api/items" && method === "GET") {
    const scope = url.searchParams.get("scope");
    if (scope === "mine") {
      const user = requireDemoUser(store, ["provider"]);
      return demoClone({
        items: filterDemoItems(store, user, {
          scope,
          status: url.searchParams.get("status") || undefined,
          search: url.searchParams.get("search") || undefined
        })
      });
    }

    const user = requireDemoUser(store, ["ngo", "consumer"]);
    return demoClone({
      items: filterDemoItems(store, user, {
        audience: url.searchParams.get("audience") || user.role,
        search: url.searchParams.get("search") || undefined,
        category: url.searchParams.get("category") || undefined,
        expirationDays: url.searchParams.get("expirationDays") || undefined,
        distanceKm: url.searchParams.get("distanceKm") || undefined,
        sort: url.searchParams.get("sort") || undefined
      })
    });
  }

  const itemDetailMatch = url.pathname.match(/^\/api\/items\/(\d+)$/);
  if (itemDetailMatch && method === "GET") {
    const user = requireDemoUser(store);
    const item = store.items.find((entry) => entry.id === Number(itemDetailMatch[1]));
    const view = item ? buildDemoItemView(store, item, user) : null;
    if (!view || !canViewDemoItem(user, view)) {
      throw new Error("Item not found.");
    }
    return demoClone({ item: view });
  }

  if (url.pathname === "/api/items" && method === "POST") {
    const user = requireDemoUser(store, ["provider"]);
    if (!body.name || !body.unit || !demoToNumber(body.quantityAvailable, null)) {
      throw new Error("Item name, quantity, and unit are required.");
    }
    const item = {
      id: nextDemoId(store, "items"),
      providerId: user.id,
      name: String(body.name).trim(),
      description: String(body.description || "").trim(),
      category: demoNormalizeCategory(body.category),
      quantityAvailable: demoToNumber(body.quantityAvailable, 0),
      unit: String(body.unit).trim(),
      expirationDate: demoToIsoOrNull(body.expirationDate),
      isPacked: Boolean(body.isPacked),
      locationText: String(body.locationText || user.address || "").trim(),
      latitude: demoToNumber(body.latitude, user.latitude),
      longitude: demoToNumber(body.longitude, user.longitude),
      availableFrom: demoToIsoOrNull(body.availableFrom) || demoNowIso(),
      availableUntil: demoToIsoOrNull(body.availableUntil),
      listingType: demoNormalizeListingType(body.listingType),
      audience: demoNormalizeAudience(body.audience),
      pricePerUnit: demoToNumber(body.pricePerUnit, 0),
      status: demoNormalizeStatus(body.status),
      donorNotes: String(body.donorNotes || "").trim()
    };
    store.items.push(item);
    saveDemoStore(store);
    return demoClone({ item: buildDemoItemView(store, item, user) });
  }

  if (itemDetailMatch && method === "PUT") {
    const user = requireDemoUser(store, ["provider"]);
    const item = store.items.find((entry) => entry.id === Number(itemDetailMatch[1]) && entry.providerId === user.id);
    if (!item) {
      throw new Error("Item not found.");
    }
    item.name = String(body.name || item.name).trim();
    item.description = String(body.description ?? item.description ?? "").trim();
    item.category = demoNormalizeCategory(body.category || item.category);
    item.quantityAvailable = demoToNumber(body.quantityAvailable, item.quantityAvailable);
    item.unit = String(body.unit || item.unit).trim();
    item.expirationDate = demoToIsoOrNull(body.expirationDate) || item.expirationDate;
    item.isPacked = body.isPacked === undefined ? item.isPacked : Boolean(body.isPacked);
    item.locationText = String(body.locationText || item.locationText || user.address || "").trim();
    item.latitude = demoToNumber(body.latitude, item.latitude);
    item.longitude = demoToNumber(body.longitude, item.longitude);
    item.availableFrom = demoToIsoOrNull(body.availableFrom) || item.availableFrom;
    item.availableUntil = demoToIsoOrNull(body.availableUntil) || item.availableUntil;
    item.listingType = demoNormalizeListingType(body.listingType || item.listingType);
    item.audience = demoNormalizeAudience(body.audience || item.audience);
    item.pricePerUnit = demoToNumber(body.pricePerUnit, item.pricePerUnit);
    item.status = demoNormalizeStatus(body.status || item.status);
    item.donorNotes = String(body.donorNotes ?? item.donorNotes ?? "").trim();
    saveDemoStore(store);
    return demoClone({ item: buildDemoItemView(store, item, user) });
  }

  const itemStatusMatch = url.pathname.match(/^\/api\/items\/(\d+)\/status$/);
  if (itemStatusMatch && method === "PATCH") {
    const user = requireDemoUser(store, ["provider"]);
    const item = store.items.find((entry) => entry.id === Number(itemStatusMatch[1]) && entry.providerId === user.id);
    if (!item) {
      throw new Error("Item not found.");
    }
    item.status = demoNormalizeStatus(body.status);
    saveDemoStore(store);
    return { status: item.status };
  }

  if (url.pathname === "/api/requests" && method === "GET") {
    const user = requireDemoUser(store, ["provider", "ngo"]);
    return demoClone({ requests: getDemoRequestsForUser(store, user) });
  }

  if (url.pathname === "/api/requests" && method === "POST") {
    const user = requireDemoUser(store, ["ngo"]);
    const item = store.items.find((entry) => entry.id === Number(body.itemId));
    const quantity = demoToNumber(body.quantity, null);
    const view = item ? buildDemoItemView(store, item, user) : null;
    if (!view || !canViewDemoItem(user, view)) {
      throw new Error("Item not found.");
    }
    if (!quantity || quantity <= 0 || quantity > view.quantityAvailable) {
      throw new Error("Choose a valid quantity.");
    }

    const request = {
      id: nextDemoId(store, "requests"),
      itemId: item.id,
      ngoId: user.id,
      quantity,
      status: "pending",
      note: String(body.note || "").trim(),
      pickupWindowStart: demoToIsoOrNull(body.pickupWindowStart),
      pickupWindowEnd: demoToIsoOrNull(body.pickupWindowEnd),
      createdAt: demoNowIso(),
      updatedAt: demoNowIso(),
      messages: []
    };

    if (request.note) {
      request.messages.push({
        id: nextDemoId(store, "messages"),
        requestId: request.id,
        senderId: user.id,
        senderName: user.displayName,
        senderRole: user.role,
        body: request.note,
        createdAt: demoNowIso()
      });
    }

    store.requests.push(request);
    saveDemoStore(store);
    return demoClone({ request: buildDemoRequestView(store, request) });
  }

  const requestMatch = url.pathname.match(/^\/api\/requests\/(\d+)$/);
  if (requestMatch && method === "PATCH") {
    const user = requireDemoUser(store, ["provider", "ngo"]);
    const request = store.requests.find((entry) => entry.id === Number(requestMatch[1]));
    const item = request ? store.items.find((entry) => entry.id === request.itemId) : null;
    if (!request || !item) {
      throw new Error("Request not found.");
    }
    if (user.role === "ngo" && request.ngoId !== user.id) {
      throw new Error("This request does not belong to your NGO.");
    }
    if (user.role === "provider" && item.providerId !== user.id) {
      throw new Error("This request is not for your inventory.");
    }

    const nextStatus = String(body.status || "").trim();
    const allowed = user.role === "provider"
      ? ["approved", "rejected", "fulfilled", "delivered"]
      : ["cancelled"];
    if (!allowed.includes(nextStatus)) {
      throw new Error("Invalid request status transition.");
    }

    if (nextStatus === "approved") {
      if (request.status !== "pending") {
        throw new Error("Only pending requests can be approved.");
      }
      if (request.quantity > item.quantityAvailable) {
        throw new Error("Not enough quantity left to approve this request.");
      }
      item.quantityAvailable -= request.quantity;
      if (item.quantityAvailable <= 0) {
        item.quantityAvailable = 0;
        item.status = "reserved";
      }
    }

    if (nextStatus === "fulfilled" && request.status !== "approved") {
      throw new Error("Only approved requests can be marked fulfilled.");
    }

    if (nextStatus === "delivered" && !["approved", "fulfilled"].includes(request.status)) {
      throw new Error("Only approved or fulfilled requests can be marked delivered.");
    }

    if (nextStatus === "cancelled" && request.status !== "pending") {
      throw new Error("Only pending requests can be cancelled.");
    }

    request.status = nextStatus;
    request.updatedAt = demoNowIso();

    if (nextStatus === "delivered") {
      ensureDemoTransaction(store, {
        providerId: item.providerId,
        ngoId: request.ngoId,
        itemId: item.id,
        quantity: request.quantity,
        kind: "donation",
        status: "delivered"
      });
    }

    saveDemoStore(store);
    return demoClone({ request: buildDemoRequestView(store, request) });
  }

  const requestMessagesMatch = url.pathname.match(/^\/api\/requests\/(\d+)\/messages$/);
  if (requestMessagesMatch && method === "GET") {
    const user = requireDemoUser(store, ["provider", "ngo"]);
    const request = store.requests.find((entry) => entry.id === Number(requestMessagesMatch[1]));
    const item = request ? store.items.find((entry) => entry.id === request.itemId) : null;
    if (!request || !item) {
      throw new Error("Request not found.");
    }
    if (user.id !== request.ngoId && user.id !== item.providerId) {
      throw new Error("You are not part of this thread.");
    }
    return demoClone({ messages: buildDemoRequestView(store, request).messages });
  }

  if (requestMessagesMatch && method === "POST") {
    const user = requireDemoUser(store, ["provider", "ngo"]);
    const request = store.requests.find((entry) => entry.id === Number(requestMessagesMatch[1]));
    const item = request ? store.items.find((entry) => entry.id === request.itemId) : null;
    if (!request || !item) {
      throw new Error("Request not found.");
    }
    if (user.id !== request.ngoId && user.id !== item.providerId) {
      throw new Error("You are not part of this thread.");
    }
    if (!String(body.body || "").trim()) {
      throw new Error("Message body is required.");
    }
    request.messages.push({
      id: nextDemoId(store, "messages"),
      requestId: request.id,
      senderId: user.id,
      senderName: user.displayName,
      senderRole: user.role,
      body: String(body.body).trim(),
      createdAt: demoNowIso()
    });
    request.updatedAt = demoNowIso();
    saveDemoStore(store);
    return demoClone({ messages: buildDemoRequestView(store, request).messages });
  }

  if (url.pathname === "/api/cart" && method === "GET") {
    const user = requireDemoUser(store, ["consumer"]);
    return demoClone({ cart: getDemoCart(store, user.id) });
  }

  if (url.pathname === "/api/cart/items" && method === "POST") {
    const user = requireDemoUser(store, ["consumer"]);
    const item = store.items.find((entry) => entry.id === Number(body.itemId));
    const quantity = demoToNumber(body.quantity, null);
    const view = item ? buildDemoItemView(store, item, user) : null;
    if (!view || !canViewDemoItem(user, view)) {
      throw new Error("Item not found.");
    }
    if (!quantity || quantity <= 0 || quantity > view.quantityAvailable) {
      throw new Error("Choose a valid quantity.");
    }
    const existing = store.cartItems.find((entry) => entry.consumerId === user.id && entry.itemId === item.id);
    if (existing) {
      existing.quantity = quantity;
    } else {
      store.cartItems.push({ consumerId: user.id, itemId: item.id, quantity });
    }
    saveDemoStore(store);
    return demoClone({ cart: getDemoCart(store, user.id) });
  }

  const cartItemMatch = url.pathname.match(/^\/api\/cart\/items\/(\d+)$/);
  if (cartItemMatch && method === "PATCH") {
    const user = requireDemoUser(store, ["consumer"]);
    const itemId = Number(cartItemMatch[1]);
    const quantity = demoToNumber(body.quantity, null);
    const existing = store.cartItems.find((entry) => entry.consumerId === user.id && entry.itemId === itemId);
    if (!quantity || quantity <= 0) {
      store.cartItems = store.cartItems.filter((entry) => !(entry.consumerId === user.id && entry.itemId === itemId));
      saveDemoStore(store);
      return demoClone({ cart: getDemoCart(store, user.id) });
    }
    const item = store.items.find((entry) => entry.id === itemId);
    if (!item || quantity > item.quantityAvailable) {
      throw new Error("Quantity exceeds available stock.");
    }
    if (existing) {
      existing.quantity = quantity;
    }
    saveDemoStore(store);
    return demoClone({ cart: getDemoCart(store, user.id) });
  }

  if (cartItemMatch && method === "DELETE") {
    const user = requireDemoUser(store, ["consumer"]);
    const itemId = Number(cartItemMatch[1]);
    store.cartItems = store.cartItems.filter((entry) => !(entry.consumerId === user.id && entry.itemId === itemId));
    saveDemoStore(store);
    return demoClone({ cart: getDemoCart(store, user.id) });
  }

  if (url.pathname === "/api/reservations/checkout" && method === "POST") {
    const user = requireDemoUser(store, ["consumer"]);
    const cart = getDemoCart(store, user.id);
    if (!cart.items.length) {
      throw new Error("Your cart is empty.");
    }
    const created = [];
    for (const cartItem of cart.items) {
      const item = store.items.find((entry) => entry.id === cartItem.itemId);
      if (!item || cartItem.quantity > item.quantityAvailable) {
        throw new Error("Not enough quantity left for " + cartItem.name + ".");
      }
      const reservation = {
        id: nextDemoId(store, "reservations"),
        consumerId: user.id,
        itemId: item.id,
        quantity: cartItem.quantity,
        totalAmount: Number((cartItem.quantity * item.pricePerUnit).toFixed(2)),
        note: String(body.note || "").trim(),
        status: "reserved",
        expiresAt: demoFutureHours(12),
        createdAt: demoNowIso(),
        updatedAt: demoNowIso()
      };
      store.reservations.push(reservation);
      created.push(reservation.id);
      item.quantityAvailable -= cartItem.quantity;
      if (item.quantityAvailable <= 0) {
        item.quantityAvailable = 0;
        item.status = "reserved";
      }
    }
    store.cartItems = store.cartItems.filter((entry) => entry.consumerId !== user.id);
    saveDemoStore(store);
    return demoClone({ reservations: getDemoReservationsForUser(store, user).filter((entry) => created.includes(entry.id)) });
  }

  if (url.pathname === "/api/reservations" && method === "GET") {
    const user = requireDemoUser(store, ["provider", "consumer"]);
    return demoClone({ reservations: getDemoReservationsForUser(store, user) });
  }

  const reservationMatch = url.pathname.match(/^\/api\/reservations\/(\d+)$/);
  if (reservationMatch && method === "PATCH") {
    const user = requireDemoUser(store, ["provider", "consumer"]);
    const reservation = store.reservations.find((entry) => entry.id === Number(reservationMatch[1]));
    const item = reservation ? store.items.find((entry) => entry.id === reservation.itemId) : null;
    if (!reservation || !item) {
      throw new Error("Reservation not found.");
    }
    if (user.role === "consumer" && reservation.consumerId !== user.id) {
      throw new Error("You do not have access to this reservation.");
    }
    if (user.role === "provider" && item.providerId !== user.id) {
      throw new Error("You do not have access to this reservation.");
    }
    if (reservation.status !== "reserved") {
      throw new Error("Only active reservations can be updated.");
    }
    const nextStatus = String(body.status || "").trim();
    if (!["collected", "cancelled"].includes(nextStatus)) {
      throw new Error("Invalid reservation status.");
    }
    reservation.status = nextStatus;
    reservation.updatedAt = demoNowIso();
    if (nextStatus === "cancelled") {
      item.quantityAvailable += reservation.quantity;
      item.status = "available";
    }
    if (nextStatus === "collected") {
      ensureDemoTransaction(store, {
        providerId: item.providerId,
        consumerId: reservation.consumerId,
        itemId: item.id,
        quantity: reservation.quantity,
        kind: "reservation",
        status: "collected"
      });
    }
    saveDemoStore(store);
    return demoClone({ reservation: buildDemoReservationView(store, reservation) });
  }

  throw new Error("Endpoint not available in demo mode.");
}

function parseRoute() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [pathPart, queryString = ""] = raw.split("?");
  const segments = pathPart.replace(/^\//, "").split("/").filter(Boolean);

  if (!segments.length) {
    return { role: "home", page: "home", params: new URLSearchParams(queryString) };
  }

  return {
    role: segments[0],
    page: segments[1] || "home",
    params: new URLSearchParams(queryString)
  };
}

function buildHash(role, page = "home", params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  return `#/${role}/${page}${suffix}`;
}

function redirectForRole(role = state.me?.role) {
  state.shortcutsOpen = false;
  if (!role) {
    location.hash = "#/";
    return;
  }
  location.hash = buildHash(role, "home");
}

function badge(status) {
  return `<span class="badge badge-${escapeHtml(String(status).toLowerCase())}">${escapeHtml(status)}</span>`;
}

function renderMetricGrid(metrics) {
  return `
    <section class="metric-grid">
      ${Object.entries(metrics)
        .map(
          ([label, value]) => `
            <article class="metric-card atmospheric-card">
              <p class="metric-label">${escapeHtml(label)}</p>
              <strong class="metric-value">${escapeHtml(String(value))}</strong>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function getShortcutEntries() {
  const common = [
    { keys: "?", label: "Open or close shortcuts" },
    { keys: "/", label: "Focus search or the first input" }
  ];

  if (!state.me?.role) {
    return common.concat([
      { keys: "Alt+1", label: "Open register form" },
      { keys: "Alt+2", label: "Open sign-in form" },
      { keys: "Alt+3", label: "Use provider demo" },
      { keys: "Alt+4", label: "Use NGO demo" },
      { keys: "Alt+5", label: "Use consumer demo" }
    ]);
  }

  return common.concat(
    NAV_ITEMS[state.me.role].map(([page, label], index) => ({
      keys: `Alt+${index + 1}`,
      label: `Go to ${label}`
    }))
  );
}

function renderShortcutDialog() {
  if (!state.shortcutsOpen) {
    return "";
  }

  const rows = getShortcutEntries()
    .map(
      (entry) => `
        <li class="shortcut-row">
          <kbd>${escapeHtml(entry.keys)}</kbd>
          <span>${escapeHtml(entry.label)}</span>
        </li>
      `
    )
    .join("");

  return `
    <div class="shortcut-overlay">
      <button class="shortcut-backdrop" type="button" data-action="close-shortcuts" aria-label="Close shortcuts"></button>
      <section
        class="shortcut-dialog glass-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-title"
        tabindex="-1"
      >
        <div class="shortcut-head">
          <div>
            <p class="eyebrow">Keyboard shortcuts</p>
            <h2 id="shortcut-title">Fast navigation</h2>
          </div>
          <button class="ghost-button" type="button" data-action="close-shortcuts">Close</button>
        </div>
        <p class="shortcut-copy">Shortcuts stay disabled while you are typing inside a form field.</p>
        <ul class="shortcut-list">${rows}</ul>
      </section>
    </div>
  `;
}

function focusElementIfPossible(target) {
  if (!(target instanceof HTMLElement)) {
    return;
  }

  target.focus();
  if (target instanceof HTMLInputElement && typeof target.select === "function") {
    target.select();
  }
}

function focusAuthField(mode = state.authMode) {
  const selector =
    mode === "login"
      ? 'form[data-form="login"] input[name="email"]'
      : 'form[data-form="register"] input[name="displayName"]';
  focusElementIfPossible(document.querySelector(selector));
}

function scrollToAuthPanel(mode = state.authMode) {
  const panel = document.querySelector(".auth-panel");
  if (!(panel instanceof HTMLElement)) {
    return;
  }

  panel.scrollIntoView({
    behavior: motion.reduced ? "auto" : "smooth",
    block: "start"
  });

  window.setTimeout(() => {
    focusAuthField(mode);
  }, motion.reduced ? 0 : 220);
}

function focusPrimaryShortcutTarget() {
  const target = document.querySelector(
    'form[data-form="route-filter"] input[name="search"], form[data-form="login"] input[name="email"], form[data-form="register"] input[name="displayName"], main input:not([type="hidden"]):not([disabled]), main textarea:not([disabled]), main select:not([disabled])'
  );

  focusElementIfPossible(target);
}

function isTypingTarget(target) {
  return target instanceof HTMLElement
    ? Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
    : false;
}

async function activateGuestShortcut(slot) {
  if (slot === 1) {
    state.authMode = "register";
    state.shortcutsOpen = false;
    await renderRoute();
    scrollToAuthPanel("register");
    return true;
  }

  if (slot === 2) {
    state.authMode = "login";
    state.shortcutsOpen = false;
    await renderRoute();
    scrollToAuthPanel("login");
    return true;
  }

  const demoRole = { 3: "provider", 4: "ngo", 5: "consumer" }[slot];
  if (!demoRole) {
    return false;
  }

  await signInDemoRole(demoRole);
  return true;
}

async function activateRoleShortcut(slot) {
  const items = NAV_ITEMS[state.me?.role] || [];
  const target = items[slot - 1];
  if (!target) {
    return false;
  }

  state.shortcutsOpen = false;
  location.hash = buildHash(state.me.role, target[0]);
  return true;
}

function focusShortcutDialogIfNeeded() {
  const shortcutDialog = document.querySelector(".shortcut-dialog");
  if (shortcutDialog instanceof HTMLElement) {
    shortcutDialog.focus();
  }
}

async function handleGlobalKeydown(event) {
  if (event.defaultPrevented) {
    return;
  }

  if (event.key === "Escape" && state.shortcutsOpen) {
    event.preventDefault();
    state.shortcutsOpen = false;
    await renderRoute();
    return;
  }

  if (isTypingTarget(event.target)) {
    return;
  }

  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === "?") {
    event.preventDefault();
    state.shortcutsOpen = !state.shortcutsOpen;
    await renderRoute();
    return;
  }

  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === "/") {
    event.preventDefault();
    focusPrimaryShortcutTarget();
    return;
  }

  if (!event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  const slot = Number(event.key);
  if (!Number.isInteger(slot) || slot <= 0) {
    return;
  }

  event.preventDefault();
  if (state.me) {
    await activateRoleShortcut(slot);
  } else {
    await activateGuestShortcut(slot);
  }
}

function renderTopbar() {
  return `
    <header class="topbar glass-bar">
      <a class="brand" href="#/">
        <span class="brand-mark">FF</span>
        <span>
          <strong>FoodFlow Connect</strong>
          <small>Waste less. Feed more.</small>
        </span>
      </a>
      <nav class="top-actions">
        ${
          state.me
            ? `
              <span class="user-chip">${escapeHtml(state.me.displayName)} | ${escapeHtml(state.me.role)}</span>
              <button class="ghost-button" data-action="logout">Logout</button>
            `
            : `
              <button class="ghost-button" data-action="switch-auth" data-mode="login">Sign in</button>
              <button class="primary-button" data-action="switch-auth" data-mode="register">Get started</button>
            `
        }
      </nav>
    </header>
  `;
}

function renderSidebar(role, currentPage) {
  return `
    <aside class="sidebar glass-panel">
      <div class="sidebar-block">
        <p class="sidebar-kicker">${escapeHtml(role.toUpperCase())}</p>
        <h2>${escapeHtml(state.me.displayName)}</h2>
        <p>${escapeHtml(state.me.address || "Location pending")}</p>
      </div>
      <nav class="sidebar-nav">
        ${NAV_ITEMS[role]
          .map(
            ([page, label]) => `
              <a class="sidebar-link ${page === currentPage ? "active" : ""}" href="${buildHash(role, page)}">
                ${escapeHtml(label)}
              </a>
            `
          )
          .join("")}
      </nav>
    </aside>
  `;
}

function renderShell(role, page, title, content) {
  const roleNotice =
    role === "consumer"
      ? `
          <section class="consumer-disclaimer panel-card" aria-label="Food safety notice">
            <div class="consumer-disclaimer-copy">
              <p class="eyebrow">Important notice</p>
              <h2>Some consumer listings may be close to expiry.</h2>
              <p>
                Please check the expiry date, packaging condition, smell, and storage guidance before eating.
                Buy only what you can consume quickly, refrigerate or store it correctly, and do not eat anything that seems unsafe.
              </p>
            </div>
            <div class="consumer-disclaimer-points" aria-hidden="true">
              <span>Check expiry</span>
              <span>Store correctly</span>
              <span>Eat promptly</span>
              <span>If unsure, skip it</span>
            </div>
          </section>
        `
      : "";

  return `
    <div class="app-shell">
      ${renderTopbar()}
      ${renderShortcutDialog()}
      ${consumeFlash()}
      <div class="dashboard-layout dashboard-canvas">
        ${renderSidebar(role, page)}
        <main class="dashboard-main">
          <section class="page-header page-header-card">
            <div>
              <p class="eyebrow">${escapeHtml(role)} dashboard</p>
              <h1>${escapeHtml(title)}</h1>
            </div>
          </section>
          ${roleNotice}
          ${content}
        </main>
      </div>
    </div>
  `;
}

function renderEmptyCard(title, message) {
  return `
    <article class="empty-card atmospheric-card">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
    </article>
  `;
}

function renderItemTile(item, mode) {
  const detailAction =
    mode === "provider"
      ? `href="${buildHash("provider", "inventory", { edit: item.id })}"`
      : `href="${buildHash(mode, mode === "consumer" ? "browse" : "discover", { item: item.id })}"`;

  return `
    <article class="list-card atmospheric-card">
      <div class="list-card-head">
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.category)} | ${formatQty(item.quantityAvailable, item.unit)}</p>
        </div>
        ${badge(item.status)}
      </div>
      <p>${escapeHtml(item.description || "No description yet.")}</p>
      <div class="meta-row">
        <span>${item.isPacked ? "Packed" : "Unpacked"}</span>
        <span>${escapeHtml(item.locationText || item.providerAddress || "Pickup location pending")}</span>
        <span>${formatDate(item.expirationDate)}</span>
      </div>
      <div class="meta-row">
        <span>${escapeHtml(item.providerName || "Your listing")}</span>
        <span>${escapeHtml(item.audience)}</span>
        <span>${formatMoney(item.pricePerUnit)}</span>
        ${item.distanceKm !== null && item.distanceKm !== undefined ? `<span>${escapeHtml(item.distanceKm)} km away</span>` : ""}
      </div>
      <div class="card-actions">
        <a class="ghost-button" ${detailAction}>View details</a>
        ${
          mode === "provider"
            ? `
              <button class="ghost-button" data-action="item-status" data-item-id="${item.id}" data-status="available">Make available</button>
              <button class="ghost-button" data-action="item-status" data-item-id="${item.id}" data-status="archived">Archive</button>
            `
            : ""
        }
      </div>
    </article>
  `;
}

function renderRequestCard(request, role) {
  return `
    <article class="request-card atmospheric-card">
      <div class="list-card-head">
        <div>
          <h3>${escapeHtml(request.itemName)}</h3>
          <p>${escapeHtml(role === "provider" ? request.ngoName : request.providerName)} | ${formatQty(request.quantity, request.itemUnit)}</p>
        </div>
        ${badge(request.status)}
      </div>
      <p>${escapeHtml(request.note || "No coordination note yet.")}</p>
      <div class="meta-row">
        <span>Pickup: ${formatDate(request.pickupWindowStart)}</span>
        <span>${escapeHtml(request.locationText || "Location pending")}</span>
      </div>
      <div class="message-thread">
        ${(request.messages || [])
          .map(
            (message) => `
              <div class="message-bubble ${message.senderRole === role ? "mine" : ""}">
                <strong>${escapeHtml(message.senderName)}</strong>
                <p>${escapeHtml(message.body)}</p>
                <small>${formatDate(message.createdAt)}</small>
              </div>
            `
          )
          .join("") || `<p class="muted">No messages yet.</p>`}
      </div>
      <form class="inline-form" data-form="request-message">
        <input type="hidden" name="requestId" value="${request.id}" />
        <label>
          <span>Message</span>
          <textarea name="body" rows="2" placeholder="Share pickup details"></textarea>
        </label>
        <button class="ghost-button" type="submit">Send</button>
      </form>
      ${
        role === "provider"
          ? `
            <div class="card-actions">
              <button class="ghost-button" data-action="request-status" data-request-id="${request.id}" data-status="approved">Approve</button>
              <button class="ghost-button" data-action="request-status" data-request-id="${request.id}" data-status="fulfilled">Fulfill</button>
              <button class="ghost-button" data-action="request-status" data-request-id="${request.id}" data-status="delivered">Delivered</button>
              <button class="ghost-button" data-action="request-status" data-request-id="${request.id}" data-status="rejected">Reject</button>
            </div>
          `
          : request.status === "pending"
            ? `<div class="card-actions"><button class="ghost-button" data-action="request-status" data-request-id="${request.id}" data-status="cancelled">Cancel request</button></div>`
            : ""
      }
    </article>
  `;
}

function renderReservationCard(reservation, role) {
  return `
    <article class="list-card atmospheric-card">
      <div class="list-card-head">
        <div>
          <h3>${escapeHtml(reservation.itemName)}</h3>
          <p>${formatQty(reservation.quantity, reservation.itemUnit)} | ${formatMoney(reservation.totalAmount)}</p>
        </div>
        ${badge(reservation.status)}
      </div>
      <div class="meta-row">
        <span>${escapeHtml(role === "provider" ? reservation.consumerName || "Consumer" : reservation.providerName)}</span>
        <span>${escapeHtml(reservation.locationText || "Collection point pending")}</span>
        <span>Collect by ${formatDate(reservation.expiresAt)}</span>
      </div>
      <p>${escapeHtml(reservation.note || "No collection note.")}</p>
      ${
        role === "consumer" && reservation.status === "reserved"
          ? `
            <div class="card-actions">
              <button class="ghost-button" data-action="reservation-status" data-reservation-id="${reservation.id}" data-status="collected">Mark collected</button>
              <button class="ghost-button" data-action="reservation-status" data-reservation-id="${reservation.id}" data-status="cancelled">Cancel</button>
            </div>
          `
          : ""
      }
    </article>
  `;
}

function renderHomePage(data) {
  const providerRows = data.providerLeaderboard
    .map(
      (entry, index) => `
        <li>
          <span>${index + 1}. ${escapeHtml(entry.name)}</span>
          <strong>${escapeHtml(String(entry.totalUnits))} units</strong>
        </li>
      `
    )
    .join("");

  const ngoRows = data.ngoLeaderboard
    .map(
      (entry, index) => `
        <li>
          <span>${index + 1}. ${escapeHtml(entry.name)}</span>
          <strong>${escapeHtml(String(entry.totalUnits))} units</strong>
        </li>
      `
    )
    .join("");

  return `
    <div class="app-shell">
      ${renderTopbar()}
      ${renderShortcutDialog()}
      ${consumeFlash()}
      <main class="home-layout home-canvas">
        <section class="hero-card hero-stage">
          <div>
            <p class="eyebrow">Food rescue marketplace</p>
            <h1>Connect restaurants, grocery stores, banquet halls, NGOs, and local consumers.</h1>
            <p class="hero-copy">Track expiring inventory, coordinate donations, reserve surplus food, and turn food management into a visible impact loop.</p>
            <div class="hero-actions">
              <button class="primary-button" data-action="switch-auth" data-mode="register">Create an account</button>
              <button class="ghost-button" data-action="switch-auth" data-mode="login">Use demo sign in</button>
            </div>
          </div>
          <div class="stats-panel sculpt-panel">
            <div>
              <span>Active listings</span>
              <strong>${escapeHtml(String(data.stats.activeListings))}</strong>
            </div>
            <div>
              <span>Providers</span>
              <strong>${escapeHtml(String(data.stats.totalProviders))}</strong>
            </div>
            <div>
              <span>NGOs</span>
              <strong>${escapeHtml(String(data.stats.totalNgos))}</strong>
            </div>
            <div>
              <span>Units saved</span>
              <strong>${escapeHtml(String(data.stats.totalUnitsSaved))}</strong>
            </div>
          </div>
        </section>
        <section class="home-grid">
          <article class="panel-card">
            <div class="panel-head">
              <h2>Provider leaderboard</h2>
              <p>Reward good inventory discipline and completed pickups.</p>
            </div>
            <ol class="leaderboard-list">${providerRows}</ol>
          </article>
          <article class="panel-card">
            <div class="panel-head">
              <h2>NGO leaderboard</h2>
              <p>Highlight teams turning requests into actual deliveries.</p>
            </div>
            <ol class="leaderboard-list">${ngoRows}</ol>
          </article>
          <article class="panel-card auth-panel full-span" id="auth-panel">
            <div class="auth-switches">
              <button class="${state.authMode === "register" ? "primary-button" : "ghost-button"}" data-action="switch-auth" data-mode="register">Register</button>
              <button class="${state.authMode === "login" ? "primary-button" : "ghost-button"}" data-action="switch-auth" data-mode="login">Sign in</button>
            </div>
            <div class="auth-grid ${state.authMode === "login" ? "login-active" : "register-active"}">
              <form class="auth-form" data-form="register">
                <h3>Role-based onboarding</h3>
                <label>
                  <span>Role</span>
                  <select name="role" id="register-role">
                    <option value="provider">Food Provider</option>
                    <option value="ngo">NGO</option>
                    <option value="consumer">Consumer</option>
                  </select>
                </label>
                <label>
                  <span>Display name</span>
                  <input name="displayName" placeholder="Business or organization name" required />
                </label>
                <label>
                  <span>Contact name</span>
                  <input name="contactName" placeholder="Main point of contact" />
                </label>
                <div class="two-column">
                  <label>
                    <span>Email</span>
                    <input name="email" type="email" required />
                  </label>
                  <label>
                    <span>Password</span>
                    <input name="password" type="password" minlength="8" required />
                  </label>
                </div>
                <div class="two-column">
                  <label>
                    <span>Phone</span>
                    <input name="phone" required />
                  </label>
                  <label class="provider-only">
                    <span>Business type</span>
                    <select name="businessType">
                      <option value="restaurant">Restaurant</option>
                      <option value="grocery">Grocery</option>
                      <option value="banquet">Banquet hall</option>
                    </select>
                  </label>
                </div>
                <label>
                  <span>Address</span>
                  <input name="address" required />
                </label>
                <div class="two-column subtle-inputs">
                  <label>
                    <span>Latitude (optional)</span>
                    <input name="latitude" type="number" step="0.0001" />
                  </label>
                  <label>
                    <span>Longitude (optional)</span>
                    <input name="longitude" type="number" step="0.0001" />
                  </label>
                </div>
                <button class="primary-button" type="submit">Create account</button>
              </form>
              <div class="signin-column">
                <form class="auth-form" data-form="login">
                  <h3>Sign in</h3>
                  <label>
                    <span>Email</span>
                    <input name="email" type="email" required />
                  </label>
                  <label>
                    <span>Password</span>
                    <input name="password" type="password" required />
                  </label>
                  <button class="primary-button" type="submit">Sign in</button>
                </form>
                <div class="demo-panel">
                  <h4>Demo access</h4>
                  <button class="ghost-button" data-action="demo-login" data-role="provider">Use provider demo</button>
                  <button class="ghost-button" data-action="demo-login" data-role="ngo">Use NGO demo</button>
                  <button class="ghost-button" data-action="demo-login" data-role="consumer">Use consumer demo</button>
                </div>
              </div>
            </div>
          </article>
        </section>
      </main>
    </div>
  `;
}
function renderProviderInventory(items, editItem, route) {
  const search = route.params.get("search") || "";
  return `
    <section class="content-grid two-pane">
      <article class="panel-card">
        <div class="panel-head">
          <h2>${editItem ? "Update listing" : "Add inventory item"}</h2>
          <p>Capture stock, expiration, packaging, and who should see the listing.</p>
        </div>
        <form class="stack-form" data-form="provider-item">
          <input type="hidden" name="itemId" value="${editItem ? editItem.id : ""}" />
          <div class="two-column">
            <label><span>Item name</span><input name="name" value="${escapeHtml(editItem?.name || "")}" required /></label>
            <label><span>Category</span><input name="category" value="${escapeHtml(editItem?.category || "Prepared Food")}" required /></label>
          </div>
          <label><span>Description</span><textarea name="description" rows="3">${escapeHtml(editItem?.description || "")}</textarea></label>
          <div class="three-column">
            <label><span>Quantity</span><input name="quantityAvailable" type="number" min="1" step="1" value="${escapeHtml(editItem?.quantityAvailable || 1)}" required /></label>
            <label><span>Unit</span><input name="unit" value="${escapeHtml(editItem?.unit || "boxes")}" required /></label>
            <label><span>Price per unit</span><input name="pricePerUnit" type="number" min="0" step="1" value="${escapeHtml(editItem?.pricePerUnit || 0)}" /></label>
          </div>
          <div class="three-column">
            <label><span>Expiration</span><input name="expirationDate" type="datetime-local" value="${editItem?.expirationDate ? new Date(editItem.expirationDate).toISOString().slice(0, 16) : ""}" /></label>
            <label><span>Available from</span><input name="availableFrom" type="datetime-local" value="${editItem?.availableFrom ? new Date(editItem.availableFrom).toISOString().slice(0, 16) : ""}" /></label>
            <label><span>Available until</span><input name="availableUntil" type="datetime-local" value="${editItem?.availableUntil ? new Date(editItem.availableUntil).toISOString().slice(0, 16) : ""}" /></label>
          </div>
          <div class="three-column">
            <label><span>Listing type</span><select name="listingType"><option value="donation" ${editItem?.listingType === "donation" ? "selected" : ""}>Donation</option><option value="sale" ${editItem?.listingType === "sale" ? "selected" : ""}>Paid item</option><option value="free_public" ${editItem?.listingType === "free_public" ? "selected" : ""}>Free public</option></select></label>
            <label><span>Audience</span><select name="audience"><option value="ngo" ${editItem?.audience === "ngo" ? "selected" : ""}>NGO</option><option value="consumer" ${editItem?.audience === "consumer" ? "selected" : ""}>Consumer</option><option value="both" ${editItem?.audience === "both" ? "selected" : ""}>Both</option></select></label>
            <label><span>Status</span><select name="status"><option value="available" ${!editItem || editItem.status === "available" ? "selected" : ""}>Available</option><option value="draft" ${editItem?.status === "draft" ? "selected" : ""}>Draft</option><option value="archived" ${editItem?.status === "archived" ? "selected" : ""}>Archived</option></select></label>
          </div>
          <label><span>Location</span><input name="locationText" value="${escapeHtml(editItem?.locationText || state.me.address || "")}" /></label>
          <div class="three-column">
            <label><span>Latitude</span><input name="latitude" type="number" step="0.0001" value="${escapeHtml(editItem?.latitude ?? state.me.latitude ?? "")}" /></label>
            <label><span>Longitude</span><input name="longitude" type="number" step="0.0001" value="${escapeHtml(editItem?.longitude ?? state.me.longitude ?? "")}" /></label>
            <label class="checkbox-label"><input name="isPacked" type="checkbox" ${(editItem?.isPacked ?? true) ? "checked" : ""} /><span>Packed item</span></label>
          </div>
          <label><span>Donor notes</span><textarea name="donorNotes" rows="2">${escapeHtml(editItem?.donorNotes || "")}</textarea></label>
          <div class="card-actions">
            <button class="primary-button" type="submit">${editItem ? "Save changes" : "Add listing"}</button>
            ${editItem ? `<a class="ghost-button" href="${buildHash("provider", "inventory", { search })}">Clear edit</a>` : ""}
          </div>
        </form>
      </article>
      <article class="panel-card">
        <div class="panel-head">
          <h2>Your inventory</h2>
          <p>Use edit to update quantities or packaging before donors and consumers see them.</p>
        </div>
        <form class="inline-form search-form" data-form="route-filter" data-role="provider" data-page="inventory">
          <label><span>Search</span><input name="search" value="${escapeHtml(search)}" placeholder="Search items" /></label>
          <button class="ghost-button" type="submit">Apply</button>
        </form>
        <div class="stack-list">
          ${items.length ? items.map((item) => renderItemTile(item, "provider")).join("") : renderEmptyCard("No items yet", "Create your first listing to start coordinating pickups.")}
        </div>
      </article>
    </section>
  `;
}

async function renderProviderPage(route) {
  if (route.page === "home") {
    const dashboard = await api("/api/dashboard");
    return renderShell(
      "provider",
      "home",
      "Provider overview",
      `${renderMetricGrid({
        "Active listings": dashboard.metrics.activeListings,
        "Pending NGO requests": dashboard.metrics.pendingRequests,
        "Reserved consumer orders": dashboard.metrics.reservedOrders,
        "Units rescued": dashboard.metrics.rescuedUnits
      })}
      <section class="content-grid">
        <article class="panel-card">
          <div class="panel-head"><h2>Incoming NGO requests</h2><p>Approve, fulfill, or message directly from here.</p></div>
          <div class="stack-list">${dashboard.recentRequests.length ? dashboard.recentRequests.map((request) => renderRequestCard(request, "provider")).join("") : renderEmptyCard("No requests yet", "Approved requests will show up here with a live message thread.")}</div>
        </article>
        <article class="panel-card">
          <div class="panel-head"><h2>Recent consumer reservations</h2><p>Track reservations that need collection follow-up.</p></div>
          <div class="stack-list">${dashboard.recentReservations.length ? dashboard.recentReservations.map((reservation) => renderReservationCard(reservation, "provider")).join("") : renderEmptyCard("No consumer reservations", "Public and paid listings reserved by consumers will appear here.")}</div>
        </article>
      </section>`
    );
  }

  if (route.page === "inventory") {
    const response = await api(`/api/items?scope=mine&search=${encodeURIComponent(route.params.get("search") || "")}`);
    const editItem = response.items.find((item) => String(item.id) === route.params.get("edit"));
    return renderShell("provider", "inventory", "Inventory management", renderProviderInventory(response.items, editItem, route));
  }

  if (route.page === "availability") {
    const response = await api("/api/items?scope=mine");
    return renderShell(
      "provider",
      "availability",
      "Availability controls",
      `<section class="panel-card"><div class="panel-head"><h2>Listing status</h2><p>Pause low-confidence inventory or re-open archived listings.</p></div><div class="stack-list">${response.items.length ? response.items.map((item) => renderItemTile(item, "provider")).join("") : renderEmptyCard("No listings", "Add inventory before setting availability.")}</div></section>`
    );
  }

  if (route.page === "network") {
    const response = await api("/api/providers/network");
    return renderShell(
      "provider",
      "network",
      "Provider coordination network",
      `<section class="panel-card"><div class="panel-head"><h2>Other providers nearby</h2><p>Useful for load balancing or cross-referrals when NGOs need more volume.</p></div><div class="stack-list">${response.providers.length ? response.providers.map((provider) => `<article class="list-card atmospheric-card"><div class="list-card-head"><div><h3>${escapeHtml(provider.display_name)}</h3><p>${escapeHtml(provider.business_type || "provider")}</p></div><strong>${escapeHtml(String(provider.active_listings))} active listings</strong></div><div class="meta-row"><span>${escapeHtml(provider.contact_name || "No contact")}</span><span>${escapeHtml(provider.phone || "Phone pending")}</span><span>${escapeHtml(provider.address || "Address pending")}</span></div></article>`).join("") : renderEmptyCard("No peers yet", "As more providers join, this directory becomes a coordination layer.")}</div></section>`
    );
  }

  const itemsResponse = await api("/api/items?scope=mine");
  const requestsResponse = await api("/api/requests");
  const note = state.me.businessType === "banquet" ? "Banquet mode: quick-donate free surplus before it expires." : "Use this quick form for one-off rescue listings or public free items.";
  return renderShell(
    "provider",
    "trash",
    "Trash and donation flow",
    `<section class="content-grid two-pane"><article class="panel-card"><div class="panel-head"><h2>Quick rescue listing</h2><p>${escapeHtml(note)}</p></div><form class="stack-form" data-form="provider-item"><label><span>Item name</span><input name="name" required placeholder="Event surplus or near-expiry item" /></label><div class="three-column"><label><span>Category</span><input name="category" value="Prepared Food" /></label><label><span>Quantity</span><input name="quantityAvailable" type="number" min="1" value="10" /></label><label><span>Unit</span><input name="unit" value="packs" /></label></div><div class="three-column"><label><span>Listing type</span><select name="listingType"><option value="donation">Donation</option><option value="free_public">Free public</option></select></label><label><span>Audience</span><select name="audience"><option value="ngo">NGO</option><option value="both">Both</option><option value="consumer">Consumer</option></select></label><label class="checkbox-label"><input name="isPacked" type="checkbox" checked /><span>Packed item</span></label></div><label><span>Location</span><input name="locationText" value="${escapeHtml(state.me.address || "")}" /></label><label><span>Available until</span><input name="availableUntil" type="datetime-local" /></label><label><span>Donor notes</span><textarea name="donorNotes" rows="3" placeholder="Access instructions or urgency"></textarea></label><button class="primary-button" type="submit">Publish rescue listing</button></form></article><article class="panel-card"><div class="panel-head"><h2>Donation activity</h2><p>Recent requests attached to your available rescue inventory.</p></div><div class="stack-list">${requestsResponse.requests.length ? requestsResponse.requests.map((request) => renderRequestCard(request, "provider")).join("") : renderEmptyCard("No donation requests", "Once NGOs start claiming items, threads will appear here.")}</div><div class="panel-head compact"><h3>Current donation-capable inventory</h3></div><div class="stack-list">${itemsResponse.items.filter((item) => item.listingType !== "sale" || item.audience !== "consumer").map((item) => renderItemTile(item, "provider")).join("") || renderEmptyCard("No rescue listings", "Add a donation or free-public listing to reduce waste.")}</div></article></section>`
  );
}

async function renderNgoPage(route) {
  if (route.page === "home") {
    const dashboard = await api("/api/dashboard");
    return renderShell(
      "ngo",
      "home",
      "NGO overview",
      `${renderMetricGrid({
        "Pending requests": dashboard.metrics.pendingRequests,
        "Total requests": dashboard.metrics.totalRequests,
        "Delivered units": dashboard.metrics.deliveredUnits,
        "Discoverable listings": dashboard.metrics.discoverableItems
      })}
      <section class="panel-card"><div class="panel-head"><h2>Recent requests</h2><p>Track the listings most likely to convert to successful pickups.</p></div><div class="stack-list">${dashboard.recentRequests.length ? dashboard.recentRequests.map((request) => renderRequestCard(request, "ngo")).join("") : renderEmptyCard("No requests yet", "Use Discover to request food from available providers.")}</div></section>`
    );
  }

  if (route.page === "requests" || route.page === "history") {
    const response = await api("/api/requests");
    const filtered = route.page === "history" ? response.requests.filter((request) => request.status === "delivered") : response.requests;
    const title = route.page === "history" ? "Donation history" : "Your active requests";
    return renderShell(
      "ngo",
      route.page,
      title,
      `<section class="panel-card"><div class="panel-head"><h2>${escapeHtml(title)}</h2><p>Each request keeps its own coordination thread with the provider.</p></div><div class="stack-list">${filtered.length ? filtered.map((request) => renderRequestCard(request, "ngo")).join("") : renderEmptyCard("Nothing to show", "Requested and completed donations will appear here.")}</div></section>`
    );
  }

  const search = route.params.get("search") || "";
  const category = route.params.get("category") || "";
  const expirationDays = route.params.get("expirationDays") || "";
  const distanceKm = route.params.get("distanceKm") || "";
  const sort = route.params.get("sort") || "";
  const response = await api(`/api/items?audience=ngo&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&expirationDays=${encodeURIComponent(expirationDays)}&distanceKm=${encodeURIComponent(distanceKm)}&sort=${encodeURIComponent(sort)}`);
  const selected = response.items.find((item) => String(item.id) === route.params.get("item"));

  return renderShell(
    "ngo",
    "discover",
    "Discover provider inventory",
    `<section class="content-grid two-pane"><article class="panel-card"><div class="panel-head"><h2>Search and filter</h2><p>Filter by category, expiry urgency, and distance if your profile has coordinates.</p></div><form class="stack-form" data-form="route-filter" data-role="ngo" data-page="discover"><div class="two-column"><label><span>Search</span><input name="search" value="${escapeHtml(search)}" /></label><label><span>Category</span><input name="category" value="${escapeHtml(category)}" placeholder="Prepared Food" /></label></div><div class="three-column"><label><span>Expiry window (days)</span><input name="expirationDays" type="number" min="1" value="${escapeHtml(expirationDays)}" /></label><label><span>Distance (km)</span><input name="distanceKm" type="number" min="1" value="${escapeHtml(distanceKm)}" /></label><label><span>Sort</span><select name="sort"><option value="">Soonest expiry</option><option value="closest" ${sort === "closest" ? "selected" : ""}>Closest</option><option value="quantity" ${sort === "quantity" ? "selected" : ""}>Largest quantity</option></select></label></div><button class="ghost-button" type="submit">Apply filters</button></form>${selected ? `<div class="detail-panel"><h3>${escapeHtml(selected.name)}</h3><p>${escapeHtml(selected.description || "No description yet.")}</p><div class="meta-row"><span>${escapeHtml(selected.providerName)}</span><span>${escapeHtml(selected.providerPhone || "Phone pending")}</span><span>${escapeHtml(selected.locationText || selected.providerAddress || "Location pending")}</span></div><div class="meta-row"><span>${selected.isPacked ? "Packed" : "Unpacked"}</span><span>${formatDate(selected.expirationDate)}</span><span>${formatQty(selected.quantityAvailable, selected.unit)}</span></div><p class="muted">Notes: ${escapeHtml(selected.donorNotes || "No donor note")}</p><form class="stack-form" data-form="ngo-request"><input type="hidden" name="itemId" value="${selected.id}" /><div class="two-column"><label><span>Quantity</span><input name="quantity" type="number" min="1" max="${escapeHtml(selected.quantityAvailable)}" required /></label><label><span>Pickup start</span><input name="pickupWindowStart" type="datetime-local" /></label></div><label><span>Pickup end</span><input name="pickupWindowEnd" type="datetime-local" /></label><label><span>Message to provider</span><textarea name="note" rows="3" placeholder="Share vehicle type or timing"></textarea></label><button class="primary-button" type="submit">Request this item</button></form></div>` : renderEmptyCard("Select a listing", "Choose any result to view provider contact details and request a pickup.")}</article><article class="panel-card"><div class="panel-head"><h2>Available listings</h2><p>Results update from live provider inventory.</p></div><div class="stack-list">${response.items.length ? response.items.map((item) => renderItemTile(item, "ngo")).join("") : renderEmptyCard("No matches", "Try a wider expiry window or remove filters.")}</div></article></section>`
  );
}

async function renderConsumerPage(route) {
  if (route.page === "home") {
    const dashboard = await api("/api/dashboard");
    return renderShell(
      "consumer",
      "home",
      "Consumer overview",
      `${renderMetricGrid({
        "Active reservations": dashboard.metrics.activeReservations,
        "Cart items": dashboard.metrics.cartItems,
        "Visible listings": dashboard.metrics.browseItems,
        "Collected units": dashboard.metrics.collectedUnits
      })}
      <section class="panel-card"><div class="panel-head"><h2>Recent reservations</h2><p>Reserve now, coordinate pickup, and mark collection when complete.</p></div><div class="stack-list">${dashboard.recentReservations.length ? dashboard.recentReservations.map((reservation) => renderReservationCard(reservation, "consumer")).join("") : renderEmptyCard("No reservations yet", "Browse free and priced surplus listings to add them to your cart.")}</div></section>`
    );
  }

  if (route.page === "cart") {
    const response = await api("/api/cart");
    return renderShell(
      "consumer",
      "cart",
      "Your cart",
      `<section class="panel-card"><div class="panel-head"><h2>Persistent cart</h2><p>Quantities stay saved to your account until you reserve or remove them.</p></div><div class="stack-list">${response.cart.items.length ? response.cart.items.map((item) => `<article class="list-card atmospheric-card"><div class="list-card-head"><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.providerName)} | ${formatMoney(item.pricePerUnit)}</p></div><strong>${formatMoney(item.lineTotal)}</strong></div><div class="meta-row"><span>Available: ${formatQty(item.availableQuantity, item.unit)}</span><span>${formatDate(item.expirationDate)}</span><span>${escapeHtml(item.locationText || "Location pending")}</span></div><form class="inline-form compact-grid" data-form="cart-update"><input type="hidden" name="itemId" value="${item.itemId}" /><label><span>Quantity</span><input name="quantity" type="number" min="0" max="${escapeHtml(item.availableQuantity)}" value="${escapeHtml(item.quantity)}" /></label><button class="ghost-button" type="submit">Update</button><button class="ghost-button" type="button" data-action="remove-cart-item" data-item-id="${item.itemId}">Remove</button></form></article>`).join("") : renderEmptyCard("Cart is empty", "Add items from Browse to reserve them later.")}</div><div class="summary-strip"><strong>Total items: ${escapeHtml(String(response.cart.totalItems))}</strong><strong>Total: ${formatMoney(response.cart.totalAmount)}</strong><a class="primary-button" href="${buildHash("consumer", "checkout")}">Go to checkout</a></div></section>`
    );
  }

  if (route.page === "checkout") {
    const response = await api("/api/cart");
    return renderShell(
      "consumer",
      "checkout",
      "Reserve items",
      `<section class="content-grid two-pane"><article class="panel-card"><div class="panel-head"><h2>Order summary</h2><p>No payment is taken in MVP mode. Reservation simply holds stock for collection.</p></div><div class="stack-list">${response.cart.items.length ? response.cart.items.map((item) => `<article class="list-card atmospheric-card"><div class="list-card-head"><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.providerName)}</p></div><strong>${formatMoney(item.lineTotal)}</strong></div><div class="meta-row"><span>${formatQty(item.quantity, item.unit)}</span><span>${formatDate(item.expirationDate)}</span></div></article>`).join("") : renderEmptyCard("Nothing to checkout", "Add some items to your cart first.")}</div></article><article class="panel-card"><div class="panel-head"><h2>Reserve for pickup</h2><p>Providers will see your reservation and you can mark it collected later.</p></div><form class="stack-form" data-form="checkout"><label><span>Pickup note</span><textarea name="note" rows="4" placeholder="Share preferred pickup time or a contact note"></textarea></label><div class="summary-strip"><strong>Total: ${formatMoney(response.cart.totalAmount)}</strong><button class="primary-button" type="submit" ${response.cart.items.length ? "" : "disabled"}>Reserve items</button></div></form></article></section>`
    );
  }

  if (route.page === "orders") {
    const response = await api("/api/reservations");
    return renderShell(
      "consumer",
      "orders",
      "Reservation history",
      `<section class="panel-card"><div class="panel-head"><h2>Orders and pickups</h2><p>Mark collected once you have the items, or cancel if you cannot reach the provider.</p></div><div class="stack-list">${response.reservations.length ? response.reservations.map((reservation) => renderReservationCard(reservation, "consumer")).join("") : renderEmptyCard("No reservations yet", "Completed and active reservations will appear here.")}</div></section>`
    );
  }

  const search = route.params.get("search") || "";
  const category = route.params.get("category") || "";
  const expirationDays = route.params.get("expirationDays") || "";
  const distanceKm = route.params.get("distanceKm") || "";
  const sort = route.params.get("sort") || "";
  const response = await api(`/api/items?audience=consumer&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&expirationDays=${encodeURIComponent(expirationDays)}&distanceKm=${encodeURIComponent(distanceKm)}&sort=${encodeURIComponent(sort)}`);
  const selected = response.items.find((item) => String(item.id) === route.params.get("item"));

  return renderShell(
    "consumer",
    "browse",
    "Browse surplus food",
    `<section class="content-grid two-pane"><article class="panel-card"><div class="panel-head"><h2>Filters and item detail</h2><p>Browse free or priced items, then add quantities to your persistent cart.</p></div><form class="stack-form" data-form="route-filter" data-role="consumer" data-page="browse"><div class="two-column"><label><span>Search</span><input name="search" value="${escapeHtml(search)}" /></label><label><span>Category</span><input name="category" value="${escapeHtml(category)}" /></label></div><div class="three-column"><label><span>Expiry window (days)</span><input name="expirationDays" type="number" min="1" value="${escapeHtml(expirationDays)}" /></label><label><span>Distance (km)</span><input name="distanceKm" type="number" min="1" value="${escapeHtml(distanceKm)}" /></label><label><span>Sort</span><select name="sort"><option value="">Soonest expiry</option><option value="closest" ${sort === "closest" ? "selected" : ""}>Closest</option><option value="quantity" ${sort === "quantity" ? "selected" : ""}>Largest quantity</option></select></label></div><button class="ghost-button" type="submit">Apply filters</button></form>${selected ? `<div class="detail-panel"><h3>${escapeHtml(selected.name)}</h3><p>${escapeHtml(selected.description || "No description yet.")}</p><div class="meta-row"><span>${formatMoney(selected.pricePerUnit)}</span><span>${escapeHtml(selected.providerName)}</span><span>${escapeHtml(selected.providerPhone || "Phone pending")}</span></div><div class="meta-row"><span>${formatQty(selected.quantityAvailable, selected.unit)}</span><span>${formatDate(selected.expirationDate)}</span><span>${selected.isPacked ? "Packed" : "Unpacked"}</span></div><p class="muted">${escapeHtml(selected.locationText || selected.providerAddress || "Pickup location pending")}</p><form class="stack-form" data-form="cart-add"><input type="hidden" name="itemId" value="${selected.id}" /><label><span>Quantity</span><input name="quantity" type="number" min="1" max="${escapeHtml(selected.quantityAvailable)}" required /></label><button class="primary-button" type="submit">Add to cart</button></form></div>` : renderEmptyCard("Select a listing", "Choose any card to view pickup details and add it to your cart.")}</article><article class="panel-card"><div class="panel-head"><h2>Available food</h2><p>Free items are marked accordingly. Paid items stay in a reserve-only checkout flow.</p></div><div class="stack-list">${response.items.length ? response.items.map((item) => renderItemTile(item, "consumer")).join("") : renderEmptyCard("No items found", "Try loosening your search or distance filters.")}</div></article></section>`
  );
}

async function renderRoute() {
  const route = parseRoute();
  document.body.dataset.role = state.me ? state.me.role : "guest";
  ROOT.innerHTML = `<main class="loading-screen"><div class="loading-card"><div class="loading-spinner"></div><p>Loading dashboard...</p></div></main>`;

  try {
    if (!state.me) {
      const data = await api("/api/leaderboards");
      ROOT.innerHTML = renderHomePage(data);
      syncRoleFieldVisibility();
      hydrateVisualEnhancements();
      focusShortcutDialogIfNeeded();
      return;
    }

    if (route.role !== state.me.role) {
      redirectForRole();
      return;
    }

    if (route.role === "provider") {
      ROOT.innerHTML = await renderProviderPage(route);
    } else if (route.role === "ngo") {
      ROOT.innerHTML = await renderNgoPage(route);
    } else {
      ROOT.innerHTML = await renderConsumerPage(route);
    }
  } catch (error) {
    ROOT.innerHTML = `<div class="app-shell">${renderTopbar()}${renderShortcutDialog()}${consumeFlash()}<main class="home-layout home-canvas">${renderEmptyCard("Something went wrong", error.message)}</main></div>`;
  }

  syncRoleFieldVisibility();
  hydrateVisualEnhancements();
  focusShortcutDialogIfNeeded();
}

function hydrateVisualEnhancements() {
  const motionTargets = document.querySelectorAll(
    ".glass-bar, .hero-card, .panel-card, .metric-card, .sidebar, .page-header, .list-card, .request-card, .empty-card, .flash"
  );

  motionTargets.forEach((element, index) => {
    element.classList.add("reveal");
    element.style.setProperty("--stagger", String(Math.min(index * 45, 260)) + "ms");
  });

  if (motion.observer) {
    motion.observer.disconnect();
  }

  if (motion.reduced) {
    motionTargets.forEach((element) => element.classList.add("is-visible"));
  } else {
    motion.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            motion.observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.14,
        rootMargin: "0px 0px -10% 0px"
      }
    );

    motionTargets.forEach((element) => motion.observer.observe(element));
  }
}

function initCursorFx() {
  if (motion.reduced || !cursorFx.enabled) {
    return;
  }

  if (document.querySelector(".cursor-dot")) {
    return;
  }

  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  dot.setAttribute("aria-hidden", "true");

  const ring = document.createElement("div");
  ring.className = "cursor-ring";
  ring.setAttribute("aria-hidden", "true");

  document.body.append(dot, ring);

  const update = () => {
    const dx = cursorFx.x - cursorFx.ringX;
    const dy = cursorFx.y - cursorFx.ringY;
    cursorFx.ringX += dx * 0.18;
    cursorFx.ringY += dy * 0.18;

    document.documentElement.style.setProperty("--cursor-x", `${cursorFx.x}px`);
    document.documentElement.style.setProperty("--cursor-y", `${cursorFx.y}px`);
    document.documentElement.style.setProperty("--ring-x", `${cursorFx.ringX}px`);
    document.documentElement.style.setProperty("--ring-y", `${cursorFx.ringY}px`);
    cursorFx.raf = null;
  };

  const schedule = () => {
    if (!cursorFx.raf) {
      cursorFx.raf = requestAnimationFrame(update);
    }
  };

  const handleMove = (event) => {
    cursorFx.x = event.clientX;
    cursorFx.y = event.clientY;
    if (cursorFx.ringX === -999) {
      cursorFx.ringX = cursorFx.x;
      cursorFx.ringY = cursorFx.y;
    }
    schedule();
  };

  const handleLeave = () => {
    cursorFx.x = -999;
    cursorFx.y = -999;
    cursorFx.ringX = -999;
    cursorFx.ringY = -999;
    schedule();
  };

  window.addEventListener("pointermove", handleMove);
  document.addEventListener("mouseleave", handleLeave);
  window.addEventListener("blur", handleLeave);
}

function syncRoleFieldVisibility() {
  const roleField = document.getElementById("register-role");
  const providerOnlyFields = document.querySelectorAll(".provider-only");
  if (!roleField || !providerOnlyFields.length) {
    return;
  }

  const shouldShow = roleField.value === "provider";
  providerOnlyFields.forEach((element) => {
    element.classList.toggle("hidden", !shouldShow);
  });
}

async function refreshSession() {
  const response = await api("/api/auth/me");
  state.me = response.user;
}

async function signInDemoRole(role) {
  const demo = DEMO_ACCOUNTS[role];
  if (!demo) {
    throw new Error("Demo account not found.");
  }

  const response = await api("/api/auth/login", { method: "POST", body: demo });
  state.me = response.user;
  state.shortcutsOpen = false;
  setFlash(`Signed in as ${role} demo.`);
  redirectForRole();
}

async function handleSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) {
    return;
  }

  event.preventDefault();
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  try {
    if (form.dataset.form === "login") {
      const response = await api("/api/auth/login", { method: "POST", body: data });
      state.me = response.user;
      setFlash("Signed in successfully.");
      redirectForRole();
      return;
    }

    if (form.dataset.form === "register") {
      data.businessType = formData.get("businessType");
      const response = await api("/api/auth/register", { method: "POST", body: data });
      state.me = response.user;
      setFlash("Account created.");
      redirectForRole();
      return;
    }

    if (form.dataset.form === "route-filter") {
      const role = form.dataset.role;
      const page = form.dataset.page;
      state.shortcutsOpen = false;
      location.hash = buildHash(role, page, data);
      return;
    }

    if (form.dataset.form === "provider-item") {
      const payload = {
        ...data,
        isPacked: formData.get("isPacked") === "on"
      };
      const itemId = data.itemId;
      if (itemId) {
        await api(`/api/items/${itemId}`, { method: "PUT", body: payload });
        setFlash("Listing updated.");
      } else {
        await api("/api/items", { method: "POST", body: payload });
        setFlash("Listing published.");
      }
      const current = parseRoute();
      location.hash = buildHash("provider", current.page, current.page === "inventory" ? { search: current.params.get("search") || "" } : {});
      return;
    }

    if (form.dataset.form === "ngo-request") {
      await api("/api/requests", { method: "POST", body: data });
      setFlash("Request sent to provider.");
      location.hash = buildHash("ngo", "requests");
      return;
    }

    if (form.dataset.form === "request-message") {
      await api(`/api/requests/${data.requestId}/messages`, { method: "POST", body: { body: data.body } });
      setFlash("Message sent.");
      await renderRoute();
      return;
    }

    if (form.dataset.form === "cart-add") {
      await api("/api/cart/items", { method: "POST", body: data });
      setFlash("Item added to cart.");
      await renderRoute();
      return;
    }

    if (form.dataset.form === "cart-update") {
      await api(`/api/cart/items/${data.itemId}`, { method: "PATCH", body: { quantity: data.quantity } });
      setFlash("Cart updated.");
      await renderRoute();
      return;
    }

    if (form.dataset.form === "checkout") {
      await api("/api/reservations/checkout", { method: "POST", body: data });
      setFlash("Items reserved successfully.");
      location.hash = buildHash("consumer", "orders");
    }
  } catch (error) {
    setFlash(error.message, "error");
    await renderRoute();
  }
}

async function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }

  const action = target.dataset.action;

  try {
    if (action === "toggle-shortcuts") {
      state.shortcutsOpen = !state.shortcutsOpen;
      await renderRoute();
      return;
    }

    if (action === "close-shortcuts") {
      if (state.shortcutsOpen) {
        state.shortcutsOpen = false;
        await renderRoute();
      }
      return;
    }

    if (action === "switch-auth") {
      state.authMode = target.dataset.mode || "register";
      state.shortcutsOpen = false;
      await renderRoute();
      if (!state.me) {
        scrollToAuthPanel(state.authMode);
      }
      return;
    }

    if (action === "demo-login") {
      await signInDemoRole(target.dataset.role);
      return;
    }

    if (action === "logout") {
      await api("/api/auth/logout", { method: "POST" });
      state.me = null;
      state.shortcutsOpen = false;
      setFlash("Signed out.");
      location.hash = "#/";
      await renderRoute();
      return;
    }

    if (action === "item-status") {
      await api(`/api/items/${target.dataset.itemId}/status`, { method: "PATCH", body: { status: target.dataset.status } });
      setFlash("Listing status updated.");
      await renderRoute();
      return;
    }

    if (action === "request-status") {
      await api(`/api/requests/${target.dataset.requestId}`, { method: "PATCH", body: { status: target.dataset.status } });
      setFlash("Request updated.");
      await renderRoute();
      return;
    }

    if (action === "reservation-status") {
      await api(`/api/reservations/${target.dataset.reservationId}`, { method: "PATCH", body: { status: target.dataset.status } });
      setFlash("Reservation updated.");
      await renderRoute();
      return;
    }

    if (action === "remove-cart-item") {
      await api(`/api/cart/items/${target.dataset.itemId}`, { method: "DELETE" });
      setFlash("Item removed from cart.");
      await renderRoute();
    }
  } catch (error) {
    setFlash(error.message, "error");
    await renderRoute();
  }
}

async function bootstrap() {
  initCursorFx();
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("click", handleClick);
  document.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("hashchange", async () => {
    state.shortcutsOpen = false;
    await renderRoute();
  });
  document.addEventListener("change", (event) => {
    if (event.target && event.target.id === "register-role") {
      syncRoleFieldVisibility();
    }
  });

  try {
    await refreshSession();
  } catch (_error) {
    state.me = null;
  }

  if (state.me && parseRoute().role === "home") {
    redirectForRole();
    return;
  }

  await renderRoute();
}

bootstrap();









