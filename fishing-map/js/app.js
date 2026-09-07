const STORAGE_KEYS = {
  spots: "fishingMap.userSpots",
  catches: "fishingMap.catches",
};

const DEFAULT_VIEW = { lat: 39.0997, lng: -94.5786, zoom: 12 };

const state = {
  spots: [],       // spots.json + user-added spots
  catches: [],      // logged catches
  mode: null,        // null | "add-spot" | "add-catch"
  spotMarkers: new Map(),
  catchMarkers: new Map(),
};

const map = L.map("map").setView([DEFAULT_VIEW.lat, DEFAULT_VIEW.lng], DEFAULT_VIEW.zoom);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const spotIcon = L.divIcon({
  className: "",
  html: '<div style="background:#0b6e4f;width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 16],
});

const catchIcon = L.divIcon({
  className: "",
  html: '<div style="background:#d98c1f;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const hintBanner = document.getElementById("hint-banner");

function showHint(text) {
  hintBanner.textContent = text;
  hintBanner.hidden = false;
}

function hideHint() {
  hintBanner.hidden = true;
}

function loadUserSpots() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.spots)) || [];
  } catch {
    return [];
  }
}

function saveUserSpots(spots) {
  localStorage.setItem(STORAGE_KEYS.spots, JSON.stringify(spots));
}

function loadCatches() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.catches)) || [];
  } catch {
    return [];
  }
}

function saveCatches(catches) {
  localStorage.setItem(STORAGE_KEYS.catches, JSON.stringify(catches));
}

async function loadBuiltInSpots() {
  try {
    const res = await fetch("data/spots.json");
    if (!res.ok) throw new Error("failed to load spots.json");
    return await res.json();
  } catch (err) {
    console.warn("Could not load data/spots.json (serve this over http:// not file://).", err);
    return [];
  }
}

function spotPopupHtml(spot) {
  const species = (spot.species || []).join(", ") || "Unknown";
  return `
    <h3>${escapeHtml(spot.name)}</h3>
    <div><strong>Type:</strong> ${escapeHtml(spot.type || "spot")}</div>
    <div><strong>Species:</strong> ${escapeHtml(species)}</div>
    ${spot.notes ? `<div>${escapeHtml(spot.notes)}</div>` : ""}
  `;
}

function catchPopupHtml(c) {
  return `
    <h3>🐟 ${escapeHtml(c.species)}</h3>
    <div><strong>Date:</strong> ${escapeHtml(c.date)}</div>
    ${c.length ? `<div><strong>Length:</strong> ${c.length} in</div>` : ""}
    ${c.weight ? `<div><strong>Weight:</strong> ${c.weight} lb</div>` : ""}
    ${c.bait ? `<div><strong>Bait:</strong> ${escapeHtml(c.bait)}</div>` : ""}
    ${c.notes ? `<div>${escapeHtml(c.notes)}</div>` : ""}
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function renderSpotMarker(spot) {
  const marker = L.marker([spot.lat, spot.lng], { icon: spotIcon }).addTo(map);
  marker.bindPopup(spotPopupHtml(spot));
  state.spotMarkers.set(spot.id, { marker, spot });
}

function renderCatchMarker(c) {
  const marker = L.marker([c.lat, c.lng], { icon: catchIcon }).addTo(map);
  marker.bindPopup(catchPopupHtml(c));
  state.catchMarkers.set(c.id, { marker, item: c });
}

function renderCatchList() {
  const list = document.getElementById("catch-list");
  list.innerHTML = "";
  if (state.catches.length === 0) {
    list.innerHTML = '<li class="empty-msg">No catches logged yet.</li>';
    return;
  }
  const sorted = [...state.catches].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const c of sorted) {
    const li = document.createElement("li");
    li.className = "catch-item";
    li.innerHTML = `
      <button class="delete-btn" title="Delete catch" data-id="${c.id}">✕</button>
      <strong>${escapeHtml(c.species)}</strong>
      <div class="meta">${escapeHtml(c.date)}${c.length ? ` · ${c.length} in` : ""}${c.weight ? ` · ${c.weight} lb` : ""}</div>
    `;
    list.appendChild(li);
  }
  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteCatch(btn.dataset.id));
  });
}

function deleteCatch(id) {
  state.catches = state.catches.filter((c) => c.id !== id);
  saveCatches(state.catches);
  const entry = state.catchMarkers.get(id);
  if (entry) {
    map.removeLayer(entry.marker);
    state.catchMarkers.delete(id);
  }
  renderCatchList();
  populateSpeciesFilter();
}

function populateSpeciesFilter() {
  const select = document.getElementById("species-filter");
  const current = select.value;
  const species = new Set();
  state.spots.forEach((s) => (s.species || []).forEach((sp) => species.add(sp)));
  state.catches.forEach((c) => c.species && species.add(c.species));

  select.innerHTML = '<option value="all">All species</option>';
  [...species].sort().forEach((sp) => {
    const opt = document.createElement("option");
    opt.value = sp;
    opt.textContent = sp;
    select.appendChild(opt);
  });
  if ([...species].includes(current)) select.value = current;
}

function applySpeciesFilter() {
  const value = document.getElementById("species-filter").value;
  for (const { marker, spot } of state.spotMarkers.values()) {
    const match = value === "all" || (spot.species || []).includes(value);
    toggleMarker(marker, match);
  }
  for (const { marker, item } of state.catchMarkers.values()) {
    const match = value === "all" || item.species === value;
    toggleMarker(marker, match);
  }
}

function toggleMarker(marker, visible) {
  if (visible && !map.hasLayer(marker)) marker.addTo(map);
  if (!visible && map.hasLayer(marker)) map.removeLayer(marker);
}

function setMode(mode, hintText) {
  state.mode = mode;
  if (hintText) showHint(hintText);
  else hideHint();
}

// --- Spot modal ---
const spotModal = document.getElementById("spot-modal");
const spotForm = document.getElementById("spot-form");
let pendingLatLng = null;

document.getElementById("add-spot-btn").addEventListener("click", () => {
  setMode("add-spot", "Click on the map to place your fishing spot.");
});

document.getElementById("spot-cancel").addEventListener("click", () => {
  spotModal.close();
  setMode(null);
});

spotForm.addEventListener("submit", (e) => {
  if (!pendingLatLng) return;
  const name = document.getElementById("spot-name").value.trim();
  const type = document.getElementById("spot-type").value;
  const species = document.getElementById("spot-species").value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const notes = document.getElementById("spot-notes").value.trim();

  const spot = {
    id: `user-spot-${Date.now()}`,
    name,
    type,
    species,
    notes,
    lat: pendingLatLng.lat,
    lng: pendingLatLng.lng,
    userAdded: true,
  };

  state.spots.push(spot);
  saveUserSpots(state.spots.filter((s) => s.userAdded));
  renderSpotMarker(spot);
  populateSpeciesFilter();
  applySpeciesFilter();

  spotForm.reset();
  pendingLatLng = null;
  setMode(null);
});

// --- Catch modal ---
const catchModal = document.getElementById("catch-modal");
const catchForm = document.getElementById("catch-form");

document.getElementById("add-catch-btn").addEventListener("click", () => {
  setMode("add-catch", "Click on the map where you made the catch.");
});

document.getElementById("catch-cancel").addEventListener("click", () => {
  catchModal.close();
  setMode(null);
});

catchForm.addEventListener("submit", (e) => {
  if (!pendingLatLng) return;
  const species = document.getElementById("catch-species").value.trim();
  const length = document.getElementById("catch-length").value;
  const weight = document.getElementById("catch-weight").value;
  const date = document.getElementById("catch-date").value;
  const bait = document.getElementById("catch-bait").value.trim();
  const notes = document.getElementById("catch-notes").value.trim();

  const item = {
    id: `catch-${Date.now()}`,
    species,
    length: length ? Number(length) : null,
    weight: weight ? Number(weight) : null,
    date,
    bait,
    notes,
    lat: pendingLatLng.lat,
    lng: pendingLatLng.lng,
  };

  state.catches.push(item);
  saveCatches(state.catches);
  renderCatchMarker(item);
  renderCatchList();
  populateSpeciesFilter();
  applySpeciesFilter();

  catchForm.reset();
  pendingLatLng = null;
  setMode(null);
});

// --- Map click handling ---
map.on("click", (e) => {
  if (state.mode === "add-spot") {
    pendingLatLng = e.latlng;
    hideHint();
    document.getElementById("spot-name").value = "";
    spotModal.showModal();
  } else if (state.mode === "add-catch") {
    pendingLatLng = e.latlng;
    hideHint();
    document.getElementById("catch-date").value = new Date().toISOString().slice(0, 10);
    catchModal.showModal();
  }
});

document.getElementById("species-filter").addEventListener("change", applySpeciesFilter);

// --- Init ---
(async function init() {
  const builtIn = await loadBuiltInSpots();
  const userSpots = loadUserSpots();
  state.spots = [...builtIn, ...userSpots];
  state.spots.forEach(renderSpotMarker);

  state.catches = loadCatches();
  state.catches.forEach(renderCatchMarker);
  renderCatchList();

  populateSpeciesFilter();

  if (state.spots.length > 0) {
    const group = L.featureGroup([...state.spotMarkers.values()].map((v) => v.marker));
    map.fitBounds(group.getBounds().pad(0.3));
  }
})();
