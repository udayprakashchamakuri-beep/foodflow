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

const NAV_ITEMS = {
  provider: [
    ["home", "Home"],
    ["inventory", "Inventory"],
    ["availability", "Availability"],
    ["network", "Network"],
    ["trash", "Quick rescue"]
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
  provider_restaurant: { email: "provider@freshplate.demo", password: "demo12345" },
  provider_grocery: { email: "grocer@greenbasket.demo", password: "demo12345" },
  provider_banquet: { email: "banquet@grandlotus.demo", password: "demo12345" },
  ngo: { email: "ngo@carebridge.demo", password: "demo12345" },
  consumer: { email: "consumer@neighbor.demo", password: "demo12345" }
};

const DEMO_LABELS = {
  provider_restaurant: "restaurant provider",
  provider_grocery: "grocery provider",
  provider_banquet: "banquet provider",
  ngo: "NGO",
  consumer: "consumer"
};

const CATEGORY_OPTIONS = [
  "Prepared Food",
  "Produce",
  "Bakery",
  "Dairy",
  "Beverages",
  "Pantry",
  "Frozen",
  "Meat & Seafood",
  "Other"
];

const UNIT_OPTIONS = {
  "Prepared Food": ["boxes", "meals", "trays", "packs"],
  Produce: ["kg", "crates", "bags"],
  Bakery: ["loaves", "packs", "pieces"],
  Dairy: ["liters", "packs", "cups"],
  Beverages: ["bottles", "liters", "cans"],
  Pantry: ["packs", "bags", "jars"],
  Frozen: ["packs", "boxes"],
  "Meat & Seafood": ["kg", "packs"],
  Other: ["units", "boxes", "packs"]
};

const DEFAULT_UNITS = ["units", "boxes", "packs", "kg", "liters"];

function getUnitsForCategory(category) {
  return UNIT_OPTIONS[category] || DEFAULT_UNITS;
}

function renderOptionList(options, selected) {
  return options
    .map((option) => `<option value="${escapeHtml(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`)
    .join("");
}

function renderUnitOptions(category, selected) {
  return renderOptionList(getUnitsForCategory(category), selected);
}
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

const DEMO_IMAGE_MAX_DIMENSION = 960;
const DEMO_IMAGE_QUALITY = 0.72;
const DEMO_CERTIFICATE_PLACEHOLDER_PREFIX = "demo-certificate://";

function isDemoMode() {
  return Boolean(window.__FOODFLOW_DEMO__);
}

function formatQty(value, unit = "units") {
  return `${Number(value || 0)} ${unit}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not process the uploaded image."));
    image.src = dataUrl;
  });
}

async function optimizeImageDataUrl(file, options = {}) {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(sourceDataUrl);
  const maxDimension = Number(options.maxDimension || DEMO_IMAGE_MAX_DIMENSION);
  const quality = typeof options.quality === "number" ? options.quality : DEMO_IMAGE_QUALITY;
  const sourceWidth = image.naturalWidth || image.width || 1;
  const sourceHeight = image.naturalHeight || image.height || 1;
  const largestSide = Math.max(sourceWidth, sourceHeight);
  const scale = largestSide > maxDimension ? maxDimension / largestSide : 1;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  if (!isDemoMode() && scale === 1) {
    return sourceDataUrl;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return sourceDataUrl;
  }

  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL(options.outputType || "image/jpeg", quality);
}

async function readLocalFileAsDataUrl(file, options = {}) {
  if (!file) {
    return "";
  }

  const validate = options.validate || ((candidate) => Boolean(candidate.type && candidate.type.startsWith("image/")));
  const errorMessage = options.errorMessage || "Upload a valid file.";

  if (!validate(file)) {
    throw new Error(errorMessage);
  }

  try {
    if (file.type && file.type.startsWith("image/") && (isDemoMode() || options.optimizeImages)) {
      return await optimizeImageDataUrl(file, options);
    }
    return await readFileAsDataUrl(file);
  } catch (error) {
    if (error instanceof Error && error.message && error.message !== `Could not read ${file.name}.`) {
      throw error;
    }
    throw new Error(`Could not read ${file.name}.`);
  }
}

async function resolveProviderImagePayload(form, formData) {
  const imageFile = form.querySelector('input[name="imageFile"]')?.files?.[0];
  const barcodeImageFile = form.querySelector('input[name="barcodeImageFile"]')?.files?.[0];

  return {
    imageUrl: imageFile
      ? await readLocalFileAsDataUrl(imageFile, {
          errorMessage: "Upload a valid food image file.",
          maxDimension: 1280,
          quality: 0.76
        })
      : String(formData.get("imageUrl") || "").trim(),
    barcodeImageUrl: barcodeImageFile
      ? await readLocalFileAsDataUrl(barcodeImageFile, {
          errorMessage: "Upload a valid barcode image file.",
          maxDimension: 960,
          quality: 0.82
        })
      : String(formData.get("barcodeImageUrl") || "").trim()
  };
}

function isCertificateFile(file) {
  if (!file) {
    return false;
  }

  return Boolean(
    (file.type && (file.type.startsWith("image/") || file.type === "application/pdf")) ||
      /\.pdf$/i.test(file.name || "")
  );
}

function buildDemoCertificatePlaceholder(file) {
  const safeName = encodeURIComponent(file?.name || "certificate");
  return `${DEMO_CERTIFICATE_PLACEHOLDER_PREFIX}${safeName}`;
}

async function resolveRegistrationCertificatePayload(form, formData, role) {
  if (!["provider", "ngo"].includes(role)) {
    return { certificateUrl: "" };
  }

  const certificateFile = form.querySelector('input[name="certificateFile"]')?.files?.[0];
  const certificateUrl = String(formData.get("certificateUrl") || "").trim();
  const uploadedCertificate = certificateFile
    ? isDemoMode()
      ? buildDemoCertificatePlaceholder(certificateFile)
      : await readLocalFileAsDataUrl(certificateFile, {
          validate: isCertificateFile,
          errorMessage: "Upload a valid certificate file in image or PDF format."
        })
    : "";

  const resolvedCertificate = uploadedCertificate || certificateUrl;
  if (!resolvedCertificate) {
    throw new Error("Providers and NGOs must upload a government certificate.");
  }

  return { certificateUrl: resolvedCertificate };
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
      { keys: "Alt+3", label: "Use restaurant provider demo" },
      { keys: "Alt+4", label: "Use grocery provider demo" },
      { keys: "Alt+5", label: "Use banquet provider demo" },
      { keys: "Alt+6", label: "Use NGO demo" },
      { keys: "Alt+7", label: "Use consumer demo" }
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

  const demoRole = { 3: "provider_restaurant", 4: "provider_grocery", 5: "provider_banquet", 6: "ngo", 7: "consumer" }[slot];
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

function renderNotificationFeed(notifications, role) {
  if (!notifications.length) {
    return "";
  }

  return `
    <section class="panel-card notification-panel">
      <div class="panel-head">
        <div>
          <h2>Nearby quick rescue alerts</h2>
          <p>New rescue listings from providers close to your area.</p>
        </div>
        <span class="badge">${escapeHtml(String(notifications.length))} alerts</span>
      </div>
      <div class="stack-list">
        ${notifications
          .map(
            (notification) => `
              <article class="list-card atmospheric-card">
                <div class="list-card-head">
                  <div>
                    <h3>${escapeHtml(notification.title)}</h3>
                    <p>${escapeHtml(notification.itemName || "Quick rescue listing")}</p>
                  </div>
                  <small>${formatDate(notification.createdAt)}</small>
                </div>
                <p>${escapeHtml(notification.message)}</p>
                <div class="meta-row">
                  <span>${escapeHtml(notification.providerName || "Provider")}</span>
                  <span>${escapeHtml(notification.locationText || "Location pending")}</span>
                </div>
                <div class="card-actions">
                  <a class="ghost-button" href="${buildHash(role, "detail", { item: notification.itemId })}">Open listing</a>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderCardImage(imageUrl, name) {
  return imageUrl
    ? `<div class="item-thumb"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)} photo" loading="lazy" /></div>`
    : "";
}

function renderMediaGallery(item, variant = "detail") {
  const media = [
    item.imageUrl ? { label: "Food photo", url: item.imageUrl, alt: `${item.name} photo` } : null,
    item.barcodeImageUrl ? { label: "Barcode", url: item.barcodeImageUrl, alt: `${item.name} barcode` } : null
  ].filter(Boolean);

  if (!media.length) {
    return "";
  }

  const wrapperClass = variant === "preview" ? "upload-preview-grid" : "detail-media-grid";
  const cardClass = variant === "preview" ? "upload-preview" : "detail-media";

  return `
    <div class="${wrapperClass}">
      ${media
        .map(
          (entry) => `
            <figure class="${cardClass}">
              <img src="${escapeHtml(entry.url)}" alt="${escapeHtml(entry.alt)}" loading="lazy" />
              <figcaption>${escapeHtml(entry.label)}</figcaption>
            </figure>
          `
        )
        .join("")}
    </div>
  `;
}

function renderProviderImageFields(item = null) {
  return `
    <section class="upload-fields">
      <div class="panel-head compact">
        <h3>Images</h3>
        <p>Add a food photo and barcode photo using a URL or a file from your device.</p>
      </div>
      ${item ? renderMediaGallery(item, "preview") : ""}
      <div class="two-column">
        <label><span>Food image URL (optional)</span><input name="imageUrl" type="url" value="${escapeHtml(item?.imageUrl || "")}" placeholder="https://example.com/food.jpg" /></label>
        <label><span>Food image from device</span><input name="imageFile" type="file" accept="image/*" /></label>
      </div>
      <div class="two-column">
        <label><span>Barcode image URL (optional)</span><input name="barcodeImageUrl" type="url" value="${escapeHtml(item?.barcodeImageUrl || "")}" placeholder="https://example.com/barcode.jpg" /></label>
        <label><span>Barcode from device</span><input name="barcodeImageFile" type="file" accept="image/*" /></label>
      </div>
    </section>
  `;
}
function renderCertificateUploadFields() {
  return `
    <section class="verification-only upload-fields hidden">
      <div class="panel-head compact">
        <h3>Government certificate</h3>
        <p>Required for food providers and NGOs. Upload an image or PDF from your device, or paste a hosted certificate URL.</p>
      </div>
      <div class="two-column">
        <label><span>Certificate URL (optional)</span><input name="certificateUrl" type="url" placeholder="https://example.com/certificate.pdf" /></label>
        <label><span>Certificate from device</span><input name="certificateFile" type="file" accept="image/*,.pdf,application/pdf" /></label>
      </div>
    </section>
  `;
}

function renderRequestActions(request, role) {
  if (role === "provider") {
    const actions = [];
    if (request.status === "pending") {
      actions.push('<button class="ghost-button" data-action="request-status" data-request-id="' + request.id + '" data-status="approved">Approve</button>');
      actions.push('<button class="ghost-button" data-action="request-status" data-request-id="' + request.id + '" data-status="rejected">Reject</button>');
    }
    if (request.status === "approved") {
      actions.push('<button class="ghost-button" data-action="request-status" data-request-id="' + request.id + '" data-status="fulfilled">Fulfill</button>');
      actions.push('<button class="ghost-button" data-action="request-status" data-request-id="' + request.id + '" data-status="delivered">Delivered</button>');
    }
    if (request.status === "fulfilled") {
      actions.push('<button class="ghost-button" data-action="request-status" data-request-id="' + request.id + '" data-status="delivered">Delivered</button>');
    }
    return actions.length ? `<div class="card-actions">${actions.join("")}</div>` : "";
  }

  if (role === "ngo" && request.status === "pending") {
    return `<div class="card-actions"><button class="ghost-button" data-action="request-status" data-request-id="${request.id}" data-status="cancelled">Cancel request</button></div>`;
  }

  return "";
}

function renderItemTile(item, mode, params = null) {
  const detailParams = params ? { ...params, item: item.id } : { item: item.id };
  const detailAction =
    mode === "provider"
      ? `href="${buildHash("provider", "inventory", { edit: item.id })}"`
      : mode === "ngo"
        ? `href="${buildHash("ngo", "detail", detailParams)}"`
        : mode === "consumer"
          ? `href="${buildHash("consumer", "detail", detailParams)}"`
          : `href="${buildHash(mode, "browse", detailParams)}"`;

  const imageMarkup = renderCardImage(item.imageUrl || item.barcodeImageUrl, item.name);

  return `
    <article class="list-card atmospheric-card">
      ${imageMarkup}
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
      ${renderRequestActions(request, role)}
    </article>
  `;
}

function renderReservationCard(reservation, role) {
  const imageMarkup = renderCardImage(reservation.imageUrl, reservation.itemName);

  return `
    <article class="list-card atmospheric-card">
      ${imageMarkup}
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

function renderLeaderboardInfographic(entries, options = {}) {
  if (!entries.length) {
    return renderEmptyCard(options.emptyTitle || "No leaderboard data", options.emptyMessage || "Impact activity will appear here once transactions are completed.");
  }

  const leader = entries[0];
  const peakUnits = Math.max(...entries.map((entry) => Number(entry.totalUnits || 0)), 1);
  const tone = options.tone || "provider";
  const heroMeta = options.metaFor ? options.metaFor(leader) : "";
  const rows = entries.slice(0, 5)
    .map((entry, index) => {
      const width = Math.max(16, Math.round((Number(entry.totalUnits || 0) / peakUnits) * 100));
      const meta = options.metaFor ? options.metaFor(entry) : "";

      return `
        <article class="leaderboard-track-card leaderboard-track-${tone}">
          <div class="leaderboard-rank-pill">${String(index + 1).padStart(2, "0")}</div>
          <div class="leaderboard-track-copy">
            <div class="leaderboard-track-head">
              <div>
                <h3>${escapeHtml(entry.name)}</h3>
                <p>${escapeHtml(meta)}</p>
              </div>
              <div class="leaderboard-track-stats">
                <strong>${escapeHtml(String(entry.totalUnits))}</strong>
                <span>units</span>
              </div>
            </div>
            <div class="leaderboard-bar" aria-hidden="true"><span style="width: ${width}%"></span></div>
            <div class="leaderboard-track-foot">
              <span>${escapeHtml(options.footLabel || "Impact recorded")}</span>
              <span>${escapeHtml(String(entry.totalTransactions || 0))} actions</span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  return `
    <div class="leaderboard-infograph leaderboard-${tone}">
      <section class="leaderboard-hero-card">
        <div class="leaderboard-hero-mark">#1</div>
        <div class="leaderboard-hero-copy">
          <p class="eyebrow">Top impact this cycle</p>
          <h3>${escapeHtml(leader.name)}</h3>
          <p>${escapeHtml(heroMeta)}</p>
        </div>
        <div class="leaderboard-hero-stats">
          <div>
            <span>Units saved</span>
            <strong>${escapeHtml(String(leader.totalUnits))}</strong>
          </div>
          <div>
            <span>Completed actions</span>
            <strong>${escapeHtml(String(leader.totalTransactions || 0))}</strong>
          </div>
        </div>
      </section>
      <div class="leaderboard-track-list">${rows}</div>
    </div>
  `;
}

function renderHomePage(data) {
  const providerBoard = renderLeaderboardInfographic(data.providerLeaderboard, {
    tone: "provider",
    footLabel: "Rescue completions",
    metaFor: (entry) => `${entry.businessType ? entry.businessType.replace(/\b\w/g, (char) => char.toUpperCase()) : "Provider"} | ${entry.totalTransactions || 0} completed pickups`,
    emptyTitle: "No provider impact yet",
    emptyMessage: "Provider rankings will appear after the first completed rescues."
  });

  const ngoBoard = renderLeaderboardInfographic(data.ngoLeaderboard, {
    tone: "ngo",
    footLabel: "Delivery actions",
    metaFor: (entry) => `${entry.totalTransactions || 0} completed deliveries coordinated`,
    emptyTitle: "No NGO impact yet",
    emptyMessage: "NGO rankings will appear after the first confirmed deliveries."
  });

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
          <article class="panel-card leaderboard-shell">
            <div class="panel-head">
              <h2>Provider leaderboard</h2>
              <p>Reward good inventory discipline and completed pickups.</p>
            </div>
            ${providerBoard}
          </article>
          <article class="panel-card leaderboard-shell">
            <div class="panel-head">
              <h2>NGO leaderboard</h2>
              <p>Highlight teams turning requests into actual deliveries.</p>
            </div>
            ${ngoBoard}
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
                ${renderCertificateUploadFields()}
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
                  <button class="ghost-button" data-action="demo-login" data-role="provider_restaurant">Restaurant provider demo</button>
                  <button class="ghost-button" data-action="demo-login" data-role="provider_grocery">Grocery provider demo</button>
                  <button class="ghost-button" data-action="demo-login" data-role="provider_banquet">Banquet provider demo</button>
                  <button class="ghost-button" data-action="demo-login" data-role="ngo">NGO demo</button>
                  <button class="ghost-button" data-action="demo-login" data-role="consumer">Consumer demo</button>
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
            <label><span>Category</span><select name="category" data-unit-source>${renderOptionList(CATEGORY_OPTIONS, editItem?.category || "Prepared Food")}</select></label>
          </div>
          <label><span>Description</span><textarea name="description" rows="3">${escapeHtml(editItem?.description || "")}</textarea></label>
          ${renderProviderImageFields(editItem)}
          <div class="three-column">
            <label><span>Quantity</span><input name="quantityAvailable" type="number" min="1" step="1" value="${escapeHtml(editItem?.quantityAvailable || 1)}" required /></label>
            <label><span>Unit</span><select name="unit" data-unit-target>${renderUnitOptions(editItem?.category || "Prepared Food", editItem?.unit || "boxes")}</select></label>
            <label><span>Price per unit</span><input name="pricePerUnit" type="number" min="0" step="1" value="${escapeHtml(editItem?.pricePerUnit || 0)}" /></label>
          </div>
          <div class="date-grid">
            <label><span>Expiration</span><div class="date-input"><input name="expirationDate" type="datetime-local" value="${editItem?.expirationDate ? new Date(editItem.expirationDate).toISOString().slice(0, 16) : ""}" /><button type="button" class="calendar-trigger" data-action="open-picker" aria-label="Open calendar"></button></div></label>
            <label><span>Available from</span><div class="date-input"><input name="availableFrom" type="datetime-local" value="${editItem?.availableFrom ? new Date(editItem.availableFrom).toISOString().slice(0, 16) : ""}" /><button type="button" class="calendar-trigger" data-action="open-picker" aria-label="Open calendar"></button></div></label>
            <label><span>Available until</span><div class="date-input"><input name="availableUntil" type="datetime-local" value="${editItem?.availableUntil ? new Date(editItem.availableUntil).toISOString().slice(0, 16) : ""}" /><button type="button" class="calendar-trigger" data-action="open-picker" aria-label="Open calendar"></button></div></label>
          </div>
          <div class="three-column">
            <label><span>Listing type</span><select name="listingType"><option value="donation" ${editItem?.listingType === "donation" ? "selected" : ""}>Donation</option><option value="sale" ${editItem?.listingType === "sale" ? "selected" : ""}>Paid item</option><option value="free_public" ${editItem?.listingType === "free_public" ? "selected" : ""}>Free public</option></select></label>
            <label><span>Audience</span><select name="audience"><option value="ngo" ${editItem?.audience === "ngo" ? "selected" : ""}>NGO</option><option value="consumer" ${editItem?.audience === "consumer" ? "selected" : ""}>Consumer</option><option value="both" ${editItem?.audience === "both" ? "selected" : ""}>Both</option></select></label>
            <label><span>Status</span><select name="status"><option value="available" ${!editItem || editItem.status === "available" ? "selected" : ""}>Available</option><option value="draft" ${editItem?.status === "draft" ? "selected" : ""}>Draft</option><option value="archived" ${editItem?.status === "archived" ? "selected" : ""}>Archived</option></select></label>
          </div>
          <label><span>Location</span><input name="locationText" value="${escapeHtml(editItem?.locationText || state.me.address || "")}" /></label>
          <label class="checkbox-label"><input name="isPacked" type="checkbox" ${(editItem?.isPacked ?? true) ? "checked" : ""} /><span>Packed item</span></label>
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
      `<section class="panel-card"><div class="panel-head"><h2>Other providers nearby</h2><p>Useful for load balancing or cross-referrals when NGOs need more volume.</p></div><div class="stack-list">${response.providers.length ? response.providers.map((provider) => `<article class="list-card atmospheric-card">
      <div class="list-card-head"><div><h3>${escapeHtml(provider.display_name)}</h3><p>${escapeHtml(provider.business_type || "provider")}</p></div><strong>${escapeHtml(String(provider.active_listings))} active listings</strong></div><div class="meta-row"><span>${escapeHtml(provider.contact_name || "No contact")}</span><span>${escapeHtml(provider.phone || "Phone pending")}</span><span>${escapeHtml(provider.address || "Address pending")}</span></div></article>`).join("") : renderEmptyCard("No peers yet", "As more providers join, this directory becomes a coordination layer.")}</div></section>`
    );
  }

  const itemsResponse = await api("/api/items?scope=mine");
  const requestsResponse = await api("/api/requests");
  const note = state.me.businessType === "banquet" ? "Banquet mode: quick-donate free surplus before it expires." : "Use this quick form for one-off rescue listings or public free items.";
  return renderShell(
    "provider",
    "trash",
    "Quick rescue section",
    `<section class="content-grid two-pane"><article class="panel-card"><div class="panel-head"><h2>Quick rescue listing</h2><p>${escapeHtml(note)}</p></div><form class="stack-form" data-form="provider-item"><input type="hidden" name="source" value="quick_rescue" /><label><span>Item name</span><input name="name" required placeholder="Event surplus or near-expiry item" /></label><div class="three-column"><label><span>Category</span><select name="category" data-unit-source>${renderOptionList(CATEGORY_OPTIONS, "Prepared Food")}</select></label><label><span>Quantity</span><input name="quantityAvailable" type="number" min="1" value="10" /></label><label><span>Unit</span><select name="unit" data-unit-target>${renderUnitOptions("Prepared Food", "packs")}</select></label></div><div class="three-column"><label><span>Listing type</span><select name="listingType"><option value="donation">Donation</option><option value="free_public">Free public</option></select></label><label><span>Audience</span><select name="audience"><option value="ngo">NGO</option><option value="both">Both</option><option value="consumer">Consumer</option></select></label><label class="checkbox-label"><input name="isPacked" type="checkbox" checked /><span>Packed item</span></label></div><label><span>Location</span><input name="locationText" value="${escapeHtml(state.me.address || "")}" /></label>
          ${renderProviderImageFields()}<label><span>Available until</span><div class="date-input"><input name="availableUntil" type="datetime-local" /><button type="button" class="calendar-trigger" data-action="open-picker" aria-label="Open calendar"></button></div></label><label><span>Donor notes</span><textarea name="donorNotes" rows="3" placeholder="Access instructions or urgency"></textarea></label><button class="primary-button" type="submit">Publish rescue listing</button></form></article><article class="panel-card"><div class="panel-head"><h2>Donation activity</h2><p>Nearby rescue responses and pickup coordination for your quick rescue listings.</p></div><div class="stack-list">${requestsResponse.requests.length ? requestsResponse.requests.map((request) => renderRequestCard(request, "provider")).join("") : renderEmptyCard("No donation requests", "Once NGOs start claiming items, threads will appear here.")}</div><div class="panel-head compact"><h3>Current donation-capable inventory</h3></div><div class="stack-list">${itemsResponse.items.filter((item) => item.listingType !== "sale" || item.audience !== "consumer").map((item) => renderItemTile(item, "provider")).join("") || renderEmptyCard("No rescue listings", "Add a donation or free-public listing to reduce waste.")}</div></article></section>`
  );
}

async function renderNgoPage(route) {
  const notificationsResponse = await api("/api/notifications");
  const notificationMarkup = renderNotificationFeed(notificationsResponse.notifications, "ngo");
  if (route.page === "home") {
    const dashboard = await api("/api/dashboard");
    return renderShell(
      "ngo",
      "home",
      "NGO overview",
      `${notificationMarkup}${renderMetricGrid({
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
      `${notificationMarkup}<section class="panel-card"><div class="panel-head"><h2>${escapeHtml(title)}</h2><p>Each request keeps its own coordination thread with the provider.</p></div><div class="stack-list">${filtered.length ? filtered.map((request) => renderRequestCard(request, "ngo")).join("") : renderEmptyCard("Nothing to show", "Requested and completed donations will appear here.")}</div></section>`
    );
  }

  if (route.page === "detail") {
    const itemId = route.params.get("item");
    if (!itemId) {
      return renderShell("ngo", "discover", "Item detail", renderEmptyCard("Select a listing", "Open any item from Discover to view the full provider details."));
    }

    const response = await api(`/api/items/${itemId}`);
    const item = response.item;
    const requestOpen = route.params.get("request") === "open";
    const backParams = Object.fromEntries(route.params.entries());
    delete backParams.item;
    delete backParams.request;

    return renderShell(
      "ngo",
      "discover",
      "Listing detail",
      `${notificationMarkup}<section class="content-grid two-pane ngo-detail-layout"><article class="panel-card detail-panel ngo-detail-panel">${renderMediaGallery(item)}<div class="panel-head"><div><p class="eyebrow">Provider listing</p><h2>${escapeHtml(item.name)}</h2></div>${badge(item.status)}</div><p>${escapeHtml(item.description || "No description yet.")}</p><div class="meta-row"><span>${escapeHtml(item.category)}</span><span>${item.isPacked ? "Packed" : "Unpacked"}</span><span>${formatQty(item.quantityAvailable, item.unit)}</span><span>${formatDate(item.expirationDate)}</span></div><div class="meta-row"><span>${escapeHtml(item.providerName)}</span><span>${escapeHtml(item.providerPhone || "Phone pending")}</span><span>${escapeHtml(item.locationText || item.providerAddress || "Location pending")}</span></div><p class="muted">Donor notes: ${escapeHtml(item.donorNotes || "No donor note")}</p><div class="card-actions"><a class="ghost-button" href="${buildHash("ngo", "discover", backParams)}">Back to discover</a>${requestOpen ? `<a class="ghost-button" href="${buildHash("ngo", "detail", { ...backParams, item: item.id })}">Cancel request</a>` : `<a class="primary-button" href="${buildHash("ngo", "detail", { ...backParams, item: item.id, request: "open" })}">Request item</a>`}</div>${requestOpen ? `<form class="stack-form ngo-request-panel" data-form="ngo-request"><input type="hidden" name="itemId" value="${item.id}" /><div class="two-column"><label><span>Quantity</span><input name="quantity" type="number" min="1" max="${escapeHtml(item.quantityAvailable)}" required /></label><label><span>Pickup by</span><div class="date-input"><input name="pickupWindowStart" type="datetime-local" required /><button type="button" class="calendar-trigger" data-action="open-picker" aria-label="Open calendar"></button></div></label></div><label><span>Message to provider (optional)</span><textarea name="note" rows="3" placeholder="Share vehicle type, team size, or pickup instructions"></textarea></label><button class="primary-button" type="submit">Send request</button></form>` : ""}</article><article class="panel-card"><div class="panel-head"><h2>Pickup guidance</h2><p>Confirm quantity first, then share your expected arrival time so the provider can prepare handoff.</p></div><div class="stack-list"><article class="empty-card atmospheric-card"><h3>What to check</h3><p>Verify expiry timing, packaging condition, pickup address, and phone contact before dispatching your team.</p></article><article class="empty-card atmospheric-card"><h3>Provider contact</h3><p>${escapeHtml(item.providerContact || item.providerName)}</p><p>${escapeHtml(item.providerPhone || "Phone pending")}</p><p>${escapeHtml(item.providerAddress || item.locationText || "Location pending")}</p></article></div></article></section>`
    );
  }

  const search = route.params.get("search") || "";
  const category = route.params.get("category") || "";
  const expirationDays = route.params.get("expirationDays") || "";
  const distanceKm = route.params.get("distanceKm") || "";
  const sort = route.params.get("sort") || "";
  const response = await api(`/api/items?audience=ngo&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&expirationDays=${encodeURIComponent(expirationDays)}&distanceKm=${encodeURIComponent(distanceKm)}&sort=${encodeURIComponent(sort)}`);

  return renderShell(
    "ngo",
    "discover",
    "Discover provider inventory",
    `${notificationMarkup}<section class="content-grid two-pane"><article class="panel-card"><div class="panel-head"><h2>Search and filter</h2><p>Filter by category, expiry urgency, and distance if your profile has coordinates.</p></div><form class="stack-form" data-form="route-filter" data-role="ngo" data-page="discover"><div class="two-column"><label><span>Search</span><input name="search" value="${escapeHtml(search)}" /></label><label><span>Category</span><input name="category" value="${escapeHtml(category)}" placeholder="Prepared Food" /></label></div><div class="three-column"><label><span>Expiry window (days)</span><input name="expirationDays" type="number" min="1" value="${escapeHtml(expirationDays)}" /></label><label><span>Distance (km)</span><input name="distanceKm" type="number" min="1" value="${escapeHtml(distanceKm)}" /></label><label><span>Sort</span><select name="sort"><option value="">Soonest expiry</option><option value="closest" ${sort === "closest" ? "selected" : ""}>Closest</option><option value="quantity" ${sort === "quantity" ? "selected" : ""}>Largest quantity</option></select></label></div><button class="ghost-button" type="submit">Apply filters</button></form>${renderEmptyCard("Open a listing", "Press View details on any result to open the full item page and send a pickup request.")}</article><article class="panel-card"><div class="panel-head"><h2>Available listings</h2><p>Results update from live provider inventory.</p></div><div class="stack-list">${response.items.length ? response.items.map((item) => renderItemTile(item, "ngo", Object.fromEntries(route.params.entries()))).join("") : renderEmptyCard("No matches", "Try a wider expiry window or remove filters.")}</div></article></section>`
  );
}
async function renderConsumerPage(route) {
  const notificationsResponse = await api("/api/notifications");
  const notificationMarkup = renderNotificationFeed(notificationsResponse.notifications, "consumer");
  if (route.page === "home") {
    const dashboard = await api("/api/dashboard");
    return renderShell(
      "consumer",
      "home",
      "Consumer overview",
      `${notificationMarkup}${renderMetricGrid({
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
      `${notificationMarkup}<section class="panel-card"><div class="panel-head"><h2>Persistent cart</h2><p>Quantities stay saved to your account until you reserve or remove them.</p></div><div class="stack-list">${response.cart.items.length ? response.cart.items.map((item) => `<article class="list-card atmospheric-card">
      ${renderCardImage(item.imageUrl, item.name)}<div class="list-card-head"><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.providerName)} | ${formatMoney(item.pricePerUnit)}</p></div><strong>${formatMoney(item.lineTotal)}</strong></div><div class="meta-row"><span>Available: ${formatQty(item.availableQuantity, item.unit)}</span><span>${formatDate(item.expirationDate)}</span><span>${escapeHtml(item.locationText || "Location pending")}</span></div><form class="inline-form compact-grid" data-form="cart-update"><input type="hidden" name="itemId" value="${item.itemId}" /><label><span>Quantity</span><input name="quantity" type="number" min="0" max="${escapeHtml(item.availableQuantity)}" value="${escapeHtml(item.quantity)}" /></label><button class="ghost-button" type="submit">Update</button><button class="ghost-button" type="button" data-action="remove-cart-item" data-item-id="${item.itemId}">Remove</button></form></article>`).join("") : renderEmptyCard("Cart is empty", "Add items from Browse to reserve them later.")}</div><div class="summary-strip"><strong>Total items: ${escapeHtml(String(response.cart.totalItems))}</strong><strong>Total: ${formatMoney(response.cart.totalAmount)}</strong><a class="primary-button" href="${buildHash("consumer", "checkout")}">Go to checkout</a></div></section>`
    );
  }

  if (route.page === "checkout") {
    const response = await api("/api/cart");
    return renderShell(
      "consumer",
      "checkout",
      "Reserve items",
      `${notificationMarkup}<section class="content-grid two-pane"><article class="panel-card"><div class="panel-head"><h2>Order summary</h2><p>No payment is taken in MVP mode. Reservation simply holds stock for collection.</p></div><div class="stack-list">${response.cart.items.length ? response.cart.items.map((item) => `<article class="list-card atmospheric-card">
      ${renderCardImage(item.imageUrl, item.name)}<div class="list-card-head"><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.providerName)}</p></div><strong>${formatMoney(item.lineTotal)}</strong></div><div class="meta-row"><span>${formatQty(item.quantity, item.unit)}</span><span>${formatDate(item.expirationDate)}</span></div></article>`).join("") : renderEmptyCard("Nothing to checkout", "Add some items to your cart first.")}</div></article><article class="panel-card"><div class="panel-head"><h2>Reserve for pickup</h2><p>Providers will see your reservation and you can mark it collected later.</p></div><form class="stack-form" data-form="checkout"><label><span>Pickup note</span><textarea name="note" rows="4" placeholder="Share preferred pickup time or a contact note"></textarea></label><div class="summary-strip"><strong>Total: ${formatMoney(response.cart.totalAmount)}</strong><button class="primary-button" type="submit" ${response.cart.items.length ? "" : "disabled"}>Reserve items</button></div></form></article></section>`
    );
  }

  if (route.page === "orders") {
    const response = await api("/api/reservations");
    return renderShell(
      "consumer",
      "orders",
      "Reservation history",
      `${notificationMarkup}<section class="panel-card"><div class="panel-head"><h2>Orders and pickups</h2><p>Mark collected once you have the items, or cancel if you cannot reach the provider.</p></div><div class="stack-list">${response.reservations.length ? response.reservations.map((reservation) => renderReservationCard(reservation, "consumer")).join("") : renderEmptyCard("No reservations yet", "Completed and active reservations will appear here.")}</div></section>`
    );
  }

  if (route.page === "detail") {
    const itemId = route.params.get("item");
    if (!itemId) {
      return renderShell("consumer", "browse", "Item detail", renderEmptyCard("Select a listing", "Open any item from Browse to view the full item details."));
    }

    const response = await api(`/api/items/${itemId}`);
    const item = response.item;
    const cartOpen = route.params.get("reserve") === "open";
    const backParams = Object.fromEntries(route.params.entries());
    delete backParams.item;
    delete backParams.reserve;

    return renderShell(
      "consumer",
      "browse",
      "Food detail",
      `${notificationMarkup}<section class="content-grid two-pane consumer-detail-layout"><article class="panel-card detail-panel consumer-detail-panel">${renderMediaGallery(item)}<div class="panel-head"><div><p class="eyebrow">Surplus listing</p><h2>${escapeHtml(item.name)}</h2></div>${badge(item.status)}</div><p>${escapeHtml(item.description || "No description yet.")}</p><div class="meta-row"><span>${formatMoney(item.pricePerUnit)}</span><span>${formatQty(item.quantityAvailable, item.unit)}</span><span>${formatDate(item.expirationDate)}</span><span>${item.isPacked ? "Packed" : "Unpacked"}</span></div><div class="meta-row"><span>${escapeHtml(item.providerName)}</span><span>${escapeHtml(item.providerPhone || "Phone pending")}</span><span>${escapeHtml(item.locationText || item.providerAddress || "Pickup location pending")}</span></div><p class="muted">Provider notes: ${escapeHtml(item.donorNotes || "No provider note")}</p><div class="card-actions"><a class="ghost-button" href="${buildHash("consumer", "browse", backParams)}">Back to browse</a>${cartOpen ? `<a class="ghost-button" href="${buildHash("consumer", "detail", { ...backParams, item: item.id })}">Cancel</a>` : `<a class="primary-button" href="${buildHash("consumer", "detail", { ...backParams, item: item.id, reserve: "open" })}">Add to cart</a>`}</div>${cartOpen ? `<form class="stack-form consumer-request-panel" data-form="cart-add"><input type="hidden" name="itemId" value="${item.id}" /><div class="two-column"><label><span>Quantity</span><input name="quantity" type="number" min="1" max="${escapeHtml(item.quantityAvailable)}" required /></label><label><span>Preferred pickup by</span><div class="date-input"><input name="pickupPreference" type="datetime-local" /><button type="button" class="calendar-trigger" data-action="open-picker" aria-label="Open calendar"></button></div></label></div><label><span>Pickup note (optional)</span><textarea name="note" rows="3" placeholder="You can confirm final pickup timing during checkout."></textarea></label><button class="primary-button" type="submit">Add item to cart</button></form>` : ""}</article><article class="panel-card"><div class="panel-head"><h2>Collection guidance</h2><p>Check the expiry time and pickup location before reserving. Final coordination still happens during checkout and collection.</p></div><div class="stack-list"><article class="empty-card atmospheric-card"><h3>Before adding to cart</h3><p>Review expiry date, storage needs, price, provider phone number, and whether the item is packed or unpacked.</p></article><article class="empty-card atmospheric-card"><h3>Provider contact</h3><p>${escapeHtml(item.providerContact || item.providerName)}</p><p>${escapeHtml(item.providerPhone || "Phone pending")}</p><p>${escapeHtml(item.providerAddress || item.locationText || "Location pending")}</p></article></div></article></section>`
    );
  }

  const search = route.params.get("search") || "";
  const category = route.params.get("category") || "";
  const expirationDays = route.params.get("expirationDays") || "";
  const distanceKm = route.params.get("distanceKm") || "";
  const sort = route.params.get("sort") || "";
  const response = await api(`/api/items?audience=consumer&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&expirationDays=${encodeURIComponent(expirationDays)}&distanceKm=${encodeURIComponent(distanceKm)}&sort=${encodeURIComponent(sort)}`);

  return renderShell(
    "consumer",
    "browse",
    "Browse surplus food",
    `${notificationMarkup}<section class="content-grid two-pane"><article class="panel-card"><div class="panel-head"><h2>Filters</h2><p>Browse free or priced items and open any listing to see full pickup details before adding it to cart.</p></div><form class="stack-form" data-form="route-filter" data-role="consumer" data-page="browse"><div class="two-column"><label><span>Search</span><input name="search" value="${escapeHtml(search)}" /></label><label><span>Category</span><input name="category" value="${escapeHtml(category)}" /></label></div><div class="three-column"><label><span>Expiry window (days)</span><input name="expirationDays" type="number" min="1" value="${escapeHtml(expirationDays)}" /></label><label><span>Distance (km)</span><input name="distanceKm" type="number" min="1" value="${escapeHtml(distanceKm)}" /></label><label><span>Sort</span><select name="sort"><option value="">Soonest expiry</option><option value="closest" ${sort === "closest" ? "selected" : ""}>Closest</option><option value="quantity" ${sort === "quantity" ? "selected" : ""}>Largest quantity</option></select></label></div><button class="ghost-button" type="submit">Apply filters</button></form>${renderEmptyCard("Open a listing", "Press View details on any result to open the full item page and add it to your cart.")}</article><article class="panel-card"><div class="panel-head"><h2>Available food</h2><p>Free items are marked accordingly. Paid items stay in a reserve-only checkout flow.</p></div><div class="stack-list">${response.items.length ? response.items.map((item) => renderItemTile(item, "consumer", Object.fromEntries(route.params.entries()))).join("") : renderEmptyCard("No items found", "Try loosening your search or distance filters.")}</div></article></section>`
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
      syncUnitOptionsForCategory();
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
  syncUnitOptionsForCategory();
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

function syncUnitOptionsForCategory(selectEl = null) {
  const selects = selectEl
    ? [selectEl]
    : Array.from(document.querySelectorAll("select[name=\"category\"][data-unit-source]"));

  selects.forEach((select) => {
    const form = select.closest("form");
    const unitSelect = form ? form.querySelector("select[name=\"unit\"][data-unit-target]") : null;
    if (!unitSelect) {
      return;
    }
    const current = unitSelect.value;
    const units = getUnitsForCategory(select.value);
    unitSelect.innerHTML = renderOptionList(units, units.includes(current) ? current : units[0] || "units");
  });
}
function syncRoleFieldVisibility() {
  const roleField = document.getElementById("register-role");
  const providerOnlyFields = document.querySelectorAll(".provider-only");
  const verificationFields = document.querySelectorAll(".verification-only");
  if (!roleField) {
    return;
  }

  const selectedRole = roleField.value;
  const shouldShowProvider = selectedRole === "provider";
  const shouldShowVerification = ["provider", "ngo"].includes(selectedRole);

  providerOnlyFields.forEach((element) => {
    element.classList.toggle("hidden", !shouldShowProvider);
  });

  verificationFields.forEach((element) => {
    element.classList.toggle("hidden", !shouldShowVerification);
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
  setFlash(`Signed in as ${DEMO_LABELS[role] || role} demo.`);
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
      const payload = {
        ...data,
        businessType: formData.get("businessType")
      };
      delete payload.certificateFile;
      Object.assign(payload, await resolveRegistrationCertificatePayload(form, formData, payload.role));
      const response = await api("/api/auth/register", { method: "POST", body: payload });
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
      delete payload.imageFile;
      delete payload.barcodeImageFile;
      Object.assign(payload, await resolveProviderImagePayload(form, formData));

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

        if (action === "open-picker") {
      const wrapper = target.closest(".date-input");
      const input = wrapper ? wrapper.querySelector("input") : null;
      if (input) {
        if (typeof input.showPicker === "function") {
          input.showPicker();
        } else {
          input.focus();
        }
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
  if (event.target && event.target.matches('select[name="category"][data-unit-source]')) {
    syncUnitOptionsForCategory(event.target);
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





























