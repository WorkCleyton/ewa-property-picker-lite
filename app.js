const API_URL = "https://script.google.com/macros/s/AKfycbyvqgPWUZy9O7zbawxfla8GyodEny2IK553v8caD9-wsNrKKkTDvXJnTXa5bDXSW7z6/exec";

const POLAND_AIRPORTS = [
  {
    name: "Gdańsk Lech Wałęsa Airport",
    code: "GDN",
    latitude: 54.3776,
    longitude: 18.4662,
    londonAirports: ["LGW"]
  },
  {
    name: "Kraków John Paul II Airport",
    code: "KRK",
    latitude: 50.0777,
    longitude: 19.7848,
    londonAirports: ["LHR", "LGW"]
  },
  {
    name: "Warsaw Chopin Airport",
    code: "WAW",
    latitude: 52.1657,
    longitude: 20.9671,
    londonAirports: ["LHR"]
  }
];

function houseIcon() {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        font-size: 26px;
        line-height: 26px;
        width: 30px;
        height: 30px;
        text-align: center;
        cursor: pointer;
      ">🏠</div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 28],
    popupAnchor: [0, -28]
  });
}

function airportIcon(code) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        display: flex;
        align-items: center;
        gap: 3px;
        width: max-content;
        padding: 2px 5px;
        border-radius: 6px;
        border: 1px solid #2563eb;
        background: rgba(255,255,255,0.92);
        color: #1e40af;
        font-family: Arial, sans-serif;
        font-size: 10px;
        font-weight: 700;
        line-height: 14px;
        white-space: nowrap;
        box-shadow: 0 1px 3px rgba(0,0,0,0.18);
        cursor: pointer;
      ">
        <span>✈</span>
        <span>${code}</span>
      </div>
    `,
    iconSize: [45, 20],
    iconAnchor: [22, 10],
    popupAnchor: [0, -12]
  });
}

function distanceKm(latitude1, longitude1, latitude2, longitude2) {
  const earthRadiusKm = 6371;
  const latitudeDifference = ((latitude2 - latitude1) * Math.PI) / 180;
  const longitudeDifference = ((longitude2 - longitude1) * Math.PI) / 180;

  const a =
    Math.sin(latitudeDifference / 2) * Math.sin(latitudeDifference / 2) +
    Math.cos((latitude1 * Math.PI) / 180) *
      Math.cos((latitude2 * Math.PI) / 180) *
      Math.sin(longitudeDifference / 2) *
      Math.sin(longitudeDifference / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function nearestAirport(coordinates) {
  if (!coordinates || !POLAND_AIRPORTS.length) return null;

  let nearest = POLAND_AIRPORTS[0];
  let nearestDistance = distanceKm(
    coordinates[0],
    coordinates[1],
    nearest.latitude,
    nearest.longitude
  );

  for (const airport of POLAND_AIRPORTS.slice(1)) {
    const distance = distanceKm(
      coordinates[0],
      coordinates[1],
      airport.latitude,
      airport.longitude
    );

    if (distance < nearestDistance) {
      nearest = airport;
      nearestDistance = distance;
    }
  }

  return {
    airport: nearest,
    distanceKm: Math.round(nearestDistance)
  };
}


const state = { properties: [], searchRequests: [], cooldownUntil: null, timer: null, requestPending: false, map: null, markers: null, mapRenderToken: 0 };
const grid = document.querySelector("#propertyGrid");
const statusMessage = document.querySelector("#statusMessage");
const resultCount = document.querySelector("#resultCount");
const lastUpdated = document.querySelector("#lastUpdated");
const matchFilter = document.querySelector("#matchFilter");
const voteFilter = document.querySelector("#voteFilter");
const requestButton = document.querySelector("#requestButton");
const countdownText = document.querySelector("#countdownText");
const purgeButton = document.querySelector("#purgeButton");
const mapStatus = document.querySelector("#mapStatus");

async function loadData() {
  setStatus("Loading Ewa’s properties…");
  try {
    const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || "The property service returned an error.");
    state.properties = (data.properties || []).filter(property => property["Listing ID / Dedup Key"] && property["Listing Status"] !== "Archived");
    state.searchRequests = (data.searchRequests || []).filter(request => request["Request ID"]);
    setLatestCooldown();
    updateRequestState();
    render();
    lastUpdated.textContent = `Updated ${new Date(data.serverTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch (error) {
    setStatus(`Couldn’t load the properties. ${error.message}`);
  }
}

function setLatestCooldown() {
  const latest = [...state.searchRequests]
    .filter(request => request["Cooldown Until"])
    .sort((a, b) => new Date(b["Cooldown Until"]) - new Date(a["Cooldown Until"]))[0];
  state.cooldownUntil = latest ? new Date(latest["Cooldown Until"]) : null;
  startCountdown();
}

function updateRequestState() {
  const latest = [...state.searchRequests]
    .filter(request => request["Requested At"])
    .sort((a, b) => new Date(b["Requested At"]) - new Date(a["Requested At"]))[0];
  const status = String(latest?.Status || "").toLowerCase();
  state.requestPending = status === "queued" || status === "running";
}

function filteredProperties() {
  const match = matchFilter.value;
  const vote = voteFilter.value;
  return state.properties.filter(property => {
    const propertyMatch = String(property["Match Level"] || "").toLowerCase();
    const propertyVote = String(property["Ewa Vote"] || "").toLowerCase();
    const matchPass = match === "all" || propertyMatch === match;
    const votePass = vote === "all" || (vote === "unreviewed" ? !propertyVote : propertyVote === vote);
    return matchPass && votePass;
  });
}

function render() {
  const properties = filteredProperties();
  const purgeCount = state.properties.filter(property => String(property["Ewa Vote"] || "").toLowerCase() === "not interested").length;
  purgeButton.disabled = purgeCount === 0;
  purgeButton.textContent = purgeCount ? `Purge not interested (${purgeCount})` : "Purge not interested";
  grid.replaceChildren();
  renderMap(properties).catch(() => { mapStatus.textContent = "Map locations couldn’t be loaded."; });
  resultCount.textContent = `${properties.length} ${properties.length === 1 ? "property" : "properties"}`;
  if (!properties.length) {
    setStatus(state.properties.length ? "No properties match those filters." : "No properties yet. Use Request search above to add the first results.");
    return;
  }
  setStatus("");
  properties.forEach(property => grid.append(createCard(property)));
}

function createCard(property) {
  const card = document.querySelector("#propertyCardTemplate").content.firstElementChild.cloneNode(true);
  const listingId = property["Listing ID / Dedup Key"];
  card.id = `property-${safeDomId(listingId)}`;
  const image = card.querySelector(".property-image");
  const imageUrl = property["Image URL"];
  if (imageUrl) {
    image.src = imageUrl;
    image.alt = `Property in ${property["Region / Location"] || "Poland"}`;
    image.addEventListener("error", () => image.removeAttribute("src"));
  }
  card.querySelector(".match-badge").textContent = property["Match Level"] ? `${property["Match Level"]} match` : "";
  card.querySelector(".location").textContent = property["Region / Location"] || "Poland";
  card.querySelector(".price").textContent = formatPrice(property);
  const link = card.querySelector(".listing-link");
  if (property["Listing URL"]) link.href = property["Listing URL"]; else link.remove();
  card.querySelector(".facts").innerHTML = [
    `${property.Bedrooms || "–"} beds`, `${property.Bathrooms || "–"} bath`,
    property["Property Type"], property["Garden / Land"] === "Yes" ? "Private garden / land" : "",
    property["Holiday Rental Potential"]
  ].filter(Boolean).map(value => `<span class="fact">${escapeHtml(String(value))}</span>`).join("");
  card.querySelector(".natural-setting").textContent = property["Natural Setting"] || property["Condition / Renovation"] || "";
  card.querySelector(".feedback-summary").textContent = property["Feedback Summary"] || "No feedback summary yet.";
  card.querySelectorAll("[data-vote]").forEach(button => {
    button.classList.toggle("active", button.dataset.vote === property["Ewa Vote"]);
    button.addEventListener("click", async () => {
      const nextVote = button.classList.contains("active") ? "" : button.dataset.vote;
      await postAction({ action: "updateVote", listingId, vote: nextVote });
      property["Ewa Vote"] = nextVote;
      render();
    });
  });
  card.querySelector(".copy-id").addEventListener("click", async event => {
    await navigator.clipboard.writeText(listingId);
    event.currentTarget.textContent = "Copied";
    setTimeout(() => event.currentTarget.textContent = "Copy listing ID", 1200);
  });
  card.querySelector(".removed-button").addEventListener("click", async () => {
    await postAction({ action: "updateListingStatus", listingId, status: "Removed by Agent" });
    property["Listing Status"] = "Removed by Agent";
    render();
  });
  return card;
}


function initialiseMap() {
  if (state.map || typeof L === "undefined") return;
  state.map = L.map("propertyMap", { scrollWheelZoom: false }).setView([49.67, 19.98], 9);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(state.map);
  state.markers = L.layerGroup().addTo(state.map);
}

async function renderMap(properties) {
  initialiseMap();
  if (!state.map) {
    mapStatus.textContent = "Map unavailable.";
    return;
  }

  const token = ++state.mapRenderToken;
  state.markers.clearLayers();

  if (!properties.length) {
    mapStatus.textContent = "No properties to map";
    state.map.setView([49.67, 19.98], 9);
    return;
  }

  mapStatus.textContent = "Locating properties…";
  const mappedProperties = [];

  for (const property of properties) {
    const location = property["Region / Location"];
    if (!location) continue;

    const coordinates = await geocodeLocation(location);
    if (token !== state.mapRenderToken) return;
    if (!coordinates) continue;

    mappedProperties.push({ property, location, coordinates });
  }

  if (token !== state.mapRenderToken) return;

  const relevantAirports = POLAND_AIRPORTS;

  for (const airport of relevantAirports) {
    const airportCoordinates = [airport.latitude, airport.longitude];

    L.circle(airportCoordinates, {
      radius: 100000,
      color: "#dc2626",
      weight: 2,
      opacity: 0.75,
      fillColor: "#3b82f6",
      fillOpacity: 0.025
    }).addTo(state.markers);

    L.marker(airportCoordinates, {
      icon: airportIcon(airport.code),
      zIndexOffset: 500
    })
      .addTo(state.markers)
      .bindPopup(
        `<strong>✈ ${escapeHtml(airport.name)}</strong><br>` +
        `${escapeHtml(airport.code)}<br>` +
        `Direct from: <strong>${escapeHtml(airport.londonAirports.join(", "))}</strong><br>` +
        '<span style="font-size:11px">Circle = 100 km straight-line radius<br>Direct routes may be seasonal</span>'
      );
  }

  const bounds = [];
  const propertyMarkerIcon = houseIcon();

  for (const { property, location, coordinates } of mappedProperties) {
    const listingId = property["Listing ID / Dedup Key"];
    const cardId = `property-${safeDomId(listingId)}`;
    const listingLink = property["Listing URL"]
      ? `<a href="${escapeHtml(property["Listing URL"])}" target="_blank" rel="noopener noreferrer">View listing</a>`
      : "";

    const nearest = nearestAirport(coordinates);
    const airportDetails = nearest
      ? '<br><br><strong>✈ Nearest London-direct airport</strong><br>' +
        `${escapeHtml(nearest.airport.name)} (${escapeHtml(nearest.airport.code)}) — <strong>${nearest.distanceKm} km</strong><br>` +
        `Direct from: ${escapeHtml(nearest.airport.londonAirports.join(", "))}`
      : "";

    L.marker(coordinates, { icon: propertyMarkerIcon })
      .addTo(state.markers)
      .bindPopup(
        `<strong>${escapeHtml(location)}</strong><br>` +
        `${escapeHtml(formatPrice(property))}<br>` +
        `${escapeHtml(property["Match Level"] || "Unrated match")}` +
        airportDetails +
        '<br><br><span style="font-size:11px">Distances are straight-line estimates<br>Approximate advertised location</span><br>' +
        `<a href="#${cardId}">Show property card ↓</a>` +
        (listingLink ? ` · ${listingLink}` : "")
      );

    bounds.push(coordinates);
  }

  mapStatus.textContent =
    `${bounds.length} ${bounds.length === 1 ? "property" : "properties"} mapped · ` +
    `${relevantAirports.length} ${relevantAirports.length === 1 ? "airport" : "airports"} shown`;

  const visibleBounds = bounds.concat(
    relevantAirports.map(airport => [airport.latitude, airport.longitude])
  );

  if (visibleBounds.length === 1) {
    state.map.setView(visibleBounds[0], 10);
  } else if (visibleBounds.length > 1) {
    state.map.fitBounds(visibleBounds, { padding: [40, 40], maxZoom: 10 });
  }

  setTimeout(() => state.map.invalidateSize(), 0);
}

async function geocodeLocation(location) {
  const cacheKey = `ewa-map:${location.toLowerCase()}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (_) {}

  const query = `${location}, Małopolskie, Poland`;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({ q: query, format: "jsonv2", limit: "1", countrycodes: "pl" });
  try {
    const response = await fetch(url, { headers: { "Accept-Language": "en" } });
    if (!response.ok) return null;
    const results = await response.json();
    if (!results.length) return null;
    const coordinates = [Number(results[0].lat), Number(results[0].lon)];
    try { localStorage.setItem(cacheKey, JSON.stringify(coordinates)); } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 1100));
    return coordinates;
  } catch (_) {
    return null;
  }
}

function safeDomId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "-");
}

function formatPrice(property) {
  const gbp = Number(property["Approx. GBP Price"]);
  if (gbp) return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(gbp);
  const amount = Number(property.Price);
  const currency = property.Currency || "PLN";
  if (amount) return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  return "Price unavailable";
}

async function postAction(payload) {
  const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!data.success) throw new Error(data.error || "The update failed.");
  return data;
}

document.querySelector("#searchRequestForm").addEventListener("submit", async event => {
  event.preventDefault();
  requestButton.disabled = true;
  requestButton.textContent = "Sending…";
  try {
    const data = await postAction({
      action: "requestSearch",
      requestText: "Standard search using Ewa’s stated and learned preferences"
    });
    if (!data.accepted) {
      state.cooldownUntil = new Date(data.cooldownUntil);
    } else {
      state.cooldownUntil = new Date(data.cooldownUntil);
      state.requestPending = true;
    }
    startCountdown();
  } catch (error) {
    countdownText.textContent = error.message;
    requestButton.disabled = false;
  }
});

async function purgeNotInterested() {
  const rejected = state.properties.filter(property => String(property["Ewa Vote"] || "").toLowerCase() === "not interested");
  if (!rejected.length) return;

  const confirmed = window.confirm(`Remove ${rejected.length} not-interested ${rejected.length === 1 ? "property" : "properties"} from the active picker? Their Sheet rows, votes, notes and feedback will be retained as archived records.`);
  if (!confirmed) return;

  purgeButton.disabled = true;
  purgeButton.textContent = "Purging…";
  setStatus("Archiving not-interested properties…");

  const results = await Promise.allSettled(rejected.map(property =>
    postAction({
      action: "updateListingStatus",
      listingId: property["Listing ID / Dedup Key"],
      status: "Archived"
    })
  ));

  const archivedIds = new Set();
  results.forEach((result, index) => {
    if (result.status === "fulfilled") archivedIds.add(rejected[index]["Listing ID / Dedup Key"]);
  });
  state.properties = state.properties.filter(property => !archivedIds.has(property["Listing ID / Dedup Key"]));
  render();

  const failed = results.length - archivedIds.size;
  if (failed) {
    setStatus(`${archivedIds.size} archived; ${failed} could not be archived. Please try again.`);
  } else {
    setStatus(`${archivedIds.size} not-interested ${archivedIds.size === 1 ? "property" : "properties"} archived. The records remain in the Sheet.`);
  }
}

function startCountdown() {
  clearInterval(state.timer);
  const update = () => {
    const remaining = state.cooldownUntil ? state.cooldownUntil.getTime() - Date.now() : 0;
    if (state.requestPending) {
      countdownText.textContent = remaining > 0
        ? `Search requested · click Refresh to check results · next request in ${Math.floor(Math.ceil(remaining / 1000) / 60)}:${String(Math.ceil(remaining / 1000) % 60).padStart(2, "0")}`
        : "Search requested · click Refresh to check results";
      requestButton.disabled = true;
      requestButton.textContent = "Search requested";
      if (remaining <= 0) clearInterval(state.timer);
      return;
    }
    if (remaining <= 0) {
      countdownText.textContent = "Ready for a new request";
      requestButton.disabled = false;
      requestButton.textContent = "Request search";
      clearInterval(state.timer);
      return;
    }
    const totalSeconds = Math.ceil(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    countdownText.textContent = `Next request available in ${minutes}:${String(seconds).padStart(2, "0")}`;
    requestButton.disabled = true;
    requestButton.textContent = "Please wait";
  };
  update();
  state.timer = setInterval(update, 1000);
}

function setStatus(message) { statusMessage.textContent = message; }
function escapeHtml(value) { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }

[matchFilter, voteFilter].forEach(filter => filter.addEventListener("change", render));
document.querySelector("#clearFilters").addEventListener("click", () => { matchFilter.value = "all"; voteFilter.value = "all"; render(); });
document.querySelector("#refreshButton").addEventListener("click", loadData);
purgeButton.addEventListener("click", purgeNotInterested);
loadData();
