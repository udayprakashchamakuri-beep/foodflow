const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const DOCS_DIR = path.join(ROOT, "docs");

const DEMO_STORAGE_KEY = "foodflow-demo-db-v4";
const DEMO_SESSION_KEY = "foodflow-demo-session-v4";

function buildDemoApiSource() {
  return String.raw`const DEMO_STORAGE_KEY = "${DEMO_STORAGE_KEY}";
const DEMO_SESSION_KEY = "${DEMO_SESSION_KEY}";
const DEMO_VERSION = 4;

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
    },
    {
      id: 2,
      itemId: 1,
      ngoId: 5,
      quantity: 6,
      status: "pending",
      note: "Can pick up before noon.",
      pickupWindowStart: demoFutureHours(2),
      pickupWindowEnd: demoFutureHours(5),
      createdAt: demoNowIso(),
      updatedAt: demoNowIso(),
      messages: []
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
    notifications: [],
    cartItems: [],
    counters: {
      users: 7,
      items: 5,
      requests: 3,
      messages: 3,
      reservations: 2,
      transactions: 4,
      notifications: 1
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
    certificateUrl: user.certificateUrl || null,
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
    imageUrl: item.imageUrl,
    barcodeImageUrl: item.barcodeImageUrl,
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
    imageUrl: item?.imageUrl || "",
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
        imageUrl: item?.imageUrl || "",
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

function getDemoNotificationTargetRoles(item) {
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

function getDemoNotificationsForUser(store, userId, limit = 6) {
  return store.notifications
    .filter((entry) => entry.recipientUserId === userId)
    .map((entry) => {
      const item = store.items.find((candidate) => candidate.id === entry.itemId);
      const provider = item ? getDemoUser(store, item.providerId) : getDemoUser(store, entry.providerId);
      return {
        id: entry.id,
        itemId: entry.itemId,
        providerId: entry.providerId,
        providerName: provider?.displayName || "Provider",
        itemName: item?.name || "Item",
        title: entry.title,
        message: entry.message,
        locationText: item?.locationText || provider?.address || "",
        createdAt: entry.createdAt
      };
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, limit);
}

function createNearbyDemoNotifications(store, item) {
  const provider = getDemoUser(store, item.providerId);
  const sourceLat = item.latitude ?? provider?.latitude ?? null;
  const sourceLng = item.longitude ?? provider?.longitude ?? null;
  const targetRoles = getDemoNotificationTargetRoles(item);
  if (!targetRoles.length || sourceLat === null || sourceLng === null) {
    return;
  }

  const expiresLabel = item.availableUntil
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.availableUntil))
    : "soon";
  const title = (provider?.displayName || "Provider") + " posted a quick rescue alert";
  const message = item.name + " is available near " + (item.locationText || "the pickup point") + " until " + expiresLabel + ".";

  store.users
    .filter((user) => user.id !== item.providerId && targetRoles.includes(user.role))
    .forEach((user) => {
      if (user.latitude === null || user.longitude === null) {
        return;
      }

      const distanceKm = demoHaversineDistanceKm(user.latitude, user.longitude, sourceLat, sourceLng);
      if (distanceKm === null || distanceKm > 15) {
        return;
      }

      store.notifications.push({
        id: nextDemoId(store, "notifications"),
        recipientUserId: user.id,
        providerId: item.providerId,
        itemId: item.id,
        title,
        message,
        createdAt: demoNowIso()
      });
    });
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
    if (["provider", "ngo"].includes(body.role) && !String(body.certificateUrl || "").trim()) {
      throw new Error("Providers and NGOs must upload a government certificate.");
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
      certificateUrl: ["provider", "ngo"].includes(body.role) ? String(body.certificateUrl || "").trim() : null,
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

  if (url.pathname === "/api/notifications" && method === "GET") {
    const user = requireDemoUser(store, ["ngo", "consumer"]);
    return demoClone({ notifications: getDemoNotificationsForUser(store, user.id) });
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
      donorNotes: String(body.donorNotes || "").trim(),
      imageUrl: String(body.imageUrl || "").trim(),
      barcodeImageUrl: String(body.barcodeImageUrl || "").trim()
    };
    store.items.push(item);
    if (String(body.source || "").trim() === "quick_rescue") {
      createNearbyDemoNotifications(store, item);
    }
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
    item.imageUrl = String(body.imageUrl ?? item.imageUrl ?? "").trim();
    item.barcodeImageUrl = String(body.barcodeImageUrl ?? item.barcodeImageUrl ?? "").trim();
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
}`;
}

function buildPagesIndex() {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FoodFlow Connect Demo</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body data-role="guest">
    <div class="pages-demo-badge">
      <div>
        <strong>GitHub Pages Demo</strong>
        <small>Local demo data is stored in your browser.</small>
      </div>
      <button type="button" data-demo-reset>Reset demo</button>
    </div>
    <div id="app" class="app-shell">
      <main class="loading-screen">
        <div class="loading-card">
          <div class="loading-spinner"></div>
          <p>Loading FoodFlow Connect demo...</p>
        </div>
      </main>
    </div>
    <script>
      window.__FOODFLOW_DEMO__ = true;
      document.addEventListener("click", function(event) {
        if (event.target && event.target.matches("[data-demo-reset]")) {
          localStorage.removeItem("${DEMO_STORAGE_KEY}");
          localStorage.removeItem("${DEMO_SESSION_KEY}");
          window.location.hash = "#/";
          window.location.reload();
        }
      });
    </script>
    <script src="./app.js" defer></script>
  </body>
</html>
`;
}

function buildPagesStyles(publicStyles) {
  return `${publicStyles}

.pages-demo-badge {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 25;
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.9rem 1rem;
  max-width: min(92vw, 380px);
  border-radius: 22px;
  background: rgba(18, 24, 21, 0.84);
  color: #fffaf3;
  box-shadow: 0 24px 45px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(16px);
}

.pages-demo-badge strong,
.pages-demo-badge small {
  display: block;
}

.pages-demo-badge small {
  color: rgba(255, 250, 243, 0.78);
}

.pages-demo-badge button {
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.12);
  color: white;
  padding: 0.72rem 0.9rem;
  border-radius: 16px;
}

@media (max-width: 760px) {
  .pages-demo-badge {
    left: 0.5rem;
    right: 0.5rem;
    bottom: 0.5rem;
    justify-content: space-between;
  }
}
`;
}

function buildPagesApp(publicApp) {
  const apiPattern = /async function api\(path, options = \{\}\) \{[\s\S]*?return payload;\r?\n\}/;
  if (!apiPattern.test(publicApp)) {
    throw new Error("Could not locate api() in public/app.js");
  }
  return publicApp.replace(apiPattern, buildDemoApiSource());
}

function main() {
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  const publicStyles = fs.readFileSync(path.join(PUBLIC_DIR, "styles.css"), "utf8");
  const publicApp = fs.readFileSync(path.join(PUBLIC_DIR, "app.js"), "utf8");

  fs.writeFileSync(path.join(DOCS_DIR, "index.html"), buildPagesIndex());
  fs.writeFileSync(path.join(DOCS_DIR, "styles.css"), buildPagesStyles(publicStyles));
  fs.writeFileSync(path.join(DOCS_DIR, "app.js"), buildPagesApp(publicApp));
  fs.writeFileSync(path.join(DOCS_DIR, "404.html"), buildPagesIndex());
}

main();







