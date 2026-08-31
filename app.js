const API_URL = "https://script.google.com/macros/s/AKfycbyvqgPWUZy9O7zbawxfla8GyodEny2IK553v8caD9-wsNrKKkTDvXJnTXa5bDXSW7z6/exec";

const state = { properties: [], searchRequests: [], cooldownUntil: null, timer: null };
const grid = document.querySelector("#propertyGrid");
const statusMessage = document.querySelector("#statusMessage");
const resultCount = document.querySelector("#resultCount");
const lastUpdated = document.querySelector("#lastUpdated");
const matchFilter = document.querySelector("#matchFilter");
const voteFilter = document.querySelector("#voteFilter");
const requestButton = document.querySelector("#requestButton");
const countdownText = document.querySelector("#countdownText");
const purgeButton = document.querySelector("#purgeButton");

async function loadData() {
  setStatus("Loading Ewa’s properties…");
  try {
    const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || "The property service returned an error.");
    state.properties = (data.properties || []).filter(property => property["Listing ID / Dedup Key"] && property["Listing Status"] !== "Archived");
    state.searchRequests = (data.searchRequests || []).filter(request => request["Request ID"]);
    setLatestCooldown();
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
  resultCount.textContent = `${properties.length} ${properties.length === 1 ? "property" : "properties"}`;
  if (!properties.length) {
    setStatus(state.properties.length ? "No properties match those filters." : "No properties yet. Use the search request above to guide the first search.");
    return;
  }
  setStatus("");
  properties.forEach(property => grid.append(createCard(property)));
}

function createCard(property) {
  const card = document.querySelector("#propertyCardTemplate").content.firstElementChild.cloneNode(true);
  const listingId = property["Listing ID / Dedup Key"];
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
  const notes = card.querySelector(".notes");
  notes.value = property["Notes for AI"] || "";
  card.querySelectorAll("[data-vote]").forEach(button => {
    button.classList.toggle("active", button.dataset.vote === property["Ewa Vote"]);
    button.addEventListener("click", async () => {
      const nextVote = button.classList.contains("active") ? "" : button.dataset.vote;
      await postAction({ action: "updateVote", listingId, vote: nextVote });
      property["Ewa Vote"] = nextVote;
      render();
    });
  });
  card.querySelector(".save-notes").addEventListener("click", async event => {
    event.currentTarget.disabled = true;
    await postAction({ action: "updateNotes", listingId, notes: notes.value });
    property["Notes for AI"] = notes.value;
    event.currentTarget.textContent = "Saved";
    setTimeout(() => { event.currentTarget.textContent = "Save notes"; event.currentTarget.disabled = false; }, 1200);
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
  const field = document.querySelector("#searchRequestText");
  const requestText = field.value.trim();
  if (!requestText) return field.focus();
  requestButton.disabled = true;
  requestButton.textContent = "Sending…";
  try {
    const data = await postAction({ action: "requestSearch", requestText });
    if (!data.accepted) {
      state.cooldownUntil = new Date(data.cooldownUntil);
    } else {
      field.value = "";
      state.cooldownUntil = new Date(data.cooldownUntil);
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
