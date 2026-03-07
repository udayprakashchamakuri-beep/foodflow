const ROOT = document.getElementById("app");
const state = {
  me: null,
  flash: null,
  authMode: "register"
};

const motion = {
  observer: null,
  reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches
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

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin"
  });

  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Request failed.");
  }
  return payload;
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
  return `
    <div class="app-shell">
      ${renderTopbar()}
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
          <article class="panel-card auth-panel full-span">
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
    ROOT.innerHTML = `<div class="app-shell">${renderTopbar()}${consumeFlash()}<main class="home-layout home-canvas">${renderEmptyCard("Something went wrong", error.message)}</main></div>`;
  }

  syncRoleFieldVisibility();
  hydrateVisualEnhancements();
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

  document.querySelectorAll(".hero-card, .panel-card, .metric-card, .sidebar, .list-card, .request-card").forEach((element) => {
    element.classList.add("tilt-surface");

    if (motion.reduced || element.dataset.tiltBound === "true") {
      return;
    }

    element.dataset.tiltBound = "true";
    element.addEventListener("pointermove", handleTiltMove);
    element.addEventListener("pointerleave", resetTiltMove);
  });
}

function handleTiltMove(event) {
  const element = event.currentTarget;
  const rect = element.getBoundingClientRect();
  const px = (event.clientX - rect.left) / rect.width;
  const py = (event.clientY - rect.top) / rect.height;
  const rotateY = (px - 0.5) * 10;
  const rotateX = (0.5 - py) * 8;

  element.style.setProperty("--tilt-y", rotateY.toFixed(2) + "deg");
  element.style.setProperty("--tilt-x", rotateX.toFixed(2) + "deg");
  element.style.setProperty("--glow-x", (px * 100).toFixed(2) + "%");
  element.style.setProperty("--glow-y", (py * 100).toFixed(2) + "%");
}

function resetTiltMove(event) {
  const element = event.currentTarget;
  element.style.setProperty("--tilt-y", "0deg");
  element.style.setProperty("--tilt-x", "0deg");
  element.style.setProperty("--glow-x", "50%");
  element.style.setProperty("--glow-y", "50%");
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
    if (action === "switch-auth") {
      state.authMode = target.dataset.mode || "register";
      await renderRoute();
      return;
    }

    if (action === "demo-login") {
      const demo = DEMO_ACCOUNTS[target.dataset.role];
      const response = await api("/api/auth/login", { method: "POST", body: demo });
      state.me = response.user;
      setFlash(`Signed in as ${target.dataset.role} demo.`);
      redirectForRole();
      return;
    }

    if (action === "logout") {
      await api("/api/auth/logout", { method: "POST" });
      state.me = null;
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
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("click", handleClick);
  window.addEventListener("hashchange", renderRoute);
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



