const STORE_KEY = "cigar-market-records-v1";
const ROUTE_KEY = "cigar-market-route-v1";
const SELLER_BASE_KEY = "cigar-market-seller-base-v1";

const state = {
  records: loadJson(STORE_KEY, []),
  route: loadJson(ROUTE_KEY, []),
  sellerBase: loadJson(SELLER_BASE_KEY, null),
  markers: new Map(),
  selectedId: null,
  pickingSellerBase: false,
};

const els = Object.fromEntries([
  "csvInput", "searchInput", "countryFilter", "provinceFilter", "cityFilter",
  "typeFilter", "statusFilter", "totalCount", "visibleCount", "mappedCount",
  "routeCount", "recordList", "routeList", "routeSummary", "clearRoute",
  "optimizeRoute", "dayHours", "visitMinutes", "consumption", "fuelPrice",
  "sellerBaseName", "sellerBaseLat", "sellerBaseLng", "sellerBaseStatus",
  "useMyLocation", "pickSellerBase", "saveSellerBase", "clearSellerBase",
  "details", "closeDetails", "detailTitle", "detailType", "detailRelevance",
  "detailName", "detailLegalName", "detailAddress", "detailCity",
  "detailProvince", "detailCountry", "detailPhone", "detailEmail",
  "detailWeb", "detailContact", "detailStatus", "detailNextAction",
  "detailNotes", "detailSource", "saveDetails", "addToRoute", "emptyMap"
].map(id => [id, document.getElementById(id)]));

const map = L.map("map", { preferCanvas: true }).setView([40.4168, -3.7038], 6);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
const sellerBaseLayer = L.layerGroup().addTo(map);

bindEvents();

if (!state.records.length) {
  state.records = demoRecords();
  saveJson(STORE_KEY, state.records);
}

render();

function bindEvents() {
  els.csvInput.addEventListener("change", importFiles);
  [
    els.searchInput, els.countryFilter, els.provinceFilter, els.cityFilter,
    els.typeFilter, els.statusFilter, els.dayHours, els.visitMinutes,
    els.consumption, els.fuelPrice
  ].forEach(el => el.addEventListener("input", render));

  els.closeDetails.addEventListener("click", () => els.details.classList.add("hidden"));
  els.saveDetails.addEventListener("click", saveSelectedRecord);
  els.addToRoute.addEventListener("click", addSelectedToRoute);
  els.clearRoute.addEventListener("click", () => {
    state.route = [];
    saveJson(ROUTE_KEY, state.route);
    render();
  });
  els.optimizeRoute.addEventListener("click", optimizeRoute);
  els.saveSellerBase.addEventListener("click", saveSellerBaseFromInputs);
  els.clearSellerBase.addEventListener("click", clearSellerBase);
  els.pickSellerBase.addEventListener("click", toggleSellerBasePicker);
  els.useMyLocation.addEventListener("click", useMyLocation);
  map.on("click", event => {
    if (!state.pickingSellerBase) return;
    setSellerBase({
      name: getInput("sellerBaseName") || "Ubicacion del vendedor",
      lat: event.latlng.lat,
      lng: event.latlng.lng,
    });
    state.pickingSellerBase = false;
    els.pickSellerBase.textContent = "Marcar en mapa";
  });
}

async function importFiles(event) {
  const files = [...event.target.files];
  for (const file of files) {
    const text = await file.text();
    const rows = parseCsv(text);
    const normalized = rows.map((row, index) => normalizeRow(row, file.name, index));
    state.records = mergeRecords(state.records, normalized);
  }
  saveJson(STORE_KEY, state.records);
  render();
}

function normalizeRow(row, sourceName, index) {
  const value = (...aliases) => getValue(row, aliases);
  const lat = parseNumber(value("latitud", "latitude", "lat", "y"));
  const lng = parseNumber(value("longitud", "longitude", "lng", "lon", "x"));
  const name = value("nombre comercial", "nombre", "establecimiento", "expendeduria", "denominacion", "razon social");
  const legalName = value("razon social", "titular", "empresa");
  const address = value("direccion", "domicilio", "calle", "ubicacion");
  const city = value("municipio", "localidad", "ciudad", "poblacion");
  const province = value("provincia", "departamento", "region");
  const country = value("pais") || inferCountry(sourceName, province);

  return {
    id: makeId(sourceName, index, [name, legalName, address, city, province]),
    type: inferType(row, sourceName),
    relevance: "Sin clasificar",
    name: name || legalName || "Registro sin nombre",
    legalName,
    address,
    city,
    province,
    country,
    postalCode: value("codigo postal", "cp", "postal"),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    phone: value("telefono", "teléfono", "movil", "móvil", "phone"),
    email: value("correo", "email", "e-mail"),
    web: value("web", "website", "redes", "instagram", "facebook", "linkedin"),
    contact: value("contacto", "responsable", "persona"),
    status: "Sin contactar",
    nextAction: "",
    notes: "",
    source: sourceName,
    sourceDate: new Date().toISOString().slice(0, 10),
    updatedAt: null,
  };
}

function getValue(row, aliases) {
  const keys = Object.keys(row);
  const found = keys.find(key => {
    const normalizedKey = clean(key);
    return aliases.some(alias => normalizedKey.includes(clean(alias)));
  });
  return found ? String(row[found] ?? "").trim() : "";
}

function inferType(row, sourceName) {
  const text = clean([sourceName, ...Object.keys(row), ...Object.values(row)].join(" "));
  if (text.includes("pvr") || text.includes("recargo")) return "PVR";
  if (text.includes("distribuidor") || text.includes("distribucion")) return "Distribuidor";
  if (text.includes("tienda") || text.includes("shop")) return "Tienda";
  if (text.includes("personal")) return "Contacto personal";
  return "Estanco";
}

function inferCountry(sourceName, province) {
  const text = clean([sourceName, province].join(" "));
  if (text.includes("espana") || text.includes("spain") || text.includes("estanco") || text.includes("pvr")) return "Espana";
  return "";
}

function parseCsv(text) {
  const delimiter = guessDelimiter(text);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      i++;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(field);
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(field);
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  row.push(field);
  if (row.some(cell => cell.trim())) rows.push(row);

  const headers = (rows.shift() || []).map(header => header.trim());
  return rows.map(cells => Object.fromEntries(headers.map((header, index) => [header || `col_${index + 1}`, cells[index] || ""])));
}

function guessDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find(Boolean) || "";
  const candidates = [",", ";", "\t", "|"];
  return candidates
    .map(delimiter => [delimiter, firstLine.split(delimiter).length])
    .sort((a, b) => b[1] - a[1])[0][0];
}

function render() {
  refreshFilters();
  const filtered = getFilteredRecords();
  renderMarkers(filtered);
  renderRecordList(filtered);
  renderRoute();
  renderSellerBase();
  els.totalCount.textContent = state.records.length;
  els.visibleCount.textContent = filtered.length;
  els.mappedCount.textContent = filtered.filter(hasCoords).length;
  els.routeCount.textContent = state.route.length;
}

function renderSellerBase() {
  sellerBaseLayer.clearLayers();
  const base = state.sellerBase;
  setValue("sellerBaseName", base?.name || "");
  setValue("sellerBaseLat", base?.lat);
  setValue("sellerBaseLng", base?.lng);
  els.sellerBaseStatus.textContent = hasCoords(base) ? "Base activa" : "Sin definir";
  els.sellerBaseStatus.classList.toggle("active", hasCoords(base));
  if (!hasCoords(base)) return;
  const marker = L.circleMarker([base.lat, base.lng], {
    radius: 10,
    color: "#f5ecdf",
    fillColor: "#ce5b2d",
    fillOpacity: 1,
    weight: 3,
  }).addTo(sellerBaseLayer);
  marker.bindPopup(`<strong>Base del vendedor</strong><br>${escapeHtml(base.name || "Ubicacion de salida")}`);
}

function saveSellerBaseFromInputs() {
  const lat = Number(els.sellerBaseLat.value);
  const lng = Number(els.sellerBaseLng.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    els.sellerBaseStatus.textContent = "Indica coordenadas validas";
    return;
  }
  setSellerBase({ name: getInput("sellerBaseName") || "Base del vendedor", lat, lng });
}

function setSellerBase(base) {
  state.sellerBase = base;
  saveJson(SELLER_BASE_KEY, base);
  render();
}

function clearSellerBase() {
  state.sellerBase = null;
  state.pickingSellerBase = false;
  localStorage.removeItem(SELLER_BASE_KEY);
  els.pickSellerBase.textContent = "Marcar en mapa";
  render();
}

function toggleSellerBasePicker() {
  state.pickingSellerBase = !state.pickingSellerBase;
  els.pickSellerBase.textContent = state.pickingSellerBase ? "Toca el mapa..." : "Marcar en mapa";
  if (state.pickingSellerBase) els.sellerBaseStatus.textContent = "Selecciona el punto en el mapa";
}

function useMyLocation() {
  if (!navigator.geolocation) {
    els.sellerBaseStatus.textContent = "GPS no disponible en este dispositivo";
    return;
  }
  els.sellerBaseStatus.textContent = "Solicitando ubicacion...";
  navigator.geolocation.getCurrentPosition(
    position => setSellerBase({
      name: getInput("sellerBaseName") || "Ubicacion actual del vendedor",
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    }),
    () => { els.sellerBaseStatus.textContent = "No se pudo obtener el GPS"; },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 }
  );
}

function refreshFilters() {
  preserveSelect(els.countryFilter, uniqueValues(state.records, "country"), "Todos");
  preserveSelect(els.provinceFilter, uniqueValues(state.records, "province"), "Todas");
  preserveSelect(els.cityFilter, uniqueValues(state.records, "city"), "Todas");
}

function preserveSelect(select, values, allLabel) {
  const current = select.value;
  select.innerHTML = `<option value="">${allLabel}</option>` + values.map(value => `<option>${escapeHtml(value)}</option>`).join("");
  select.value = values.includes(current) ? current : "";
}

function uniqueValues(records, key) {
  return [...new Set(records.map(record => record[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function getFilteredRecords() {
  const query = clean(els.searchInput.value);
  const filters = {
    country: els.countryFilter.value,
    province: els.provinceFilter.value,
    city: els.cityFilter.value,
    type: els.typeFilter.value,
    status: els.statusFilter.value,
  };

  return state.records.filter(record => {
    const haystack = clean([
      record.name, record.legalName, record.address, record.city, record.province,
      record.country, record.phone, record.email, record.web, record.contact, record.notes
    ].join(" "));
    return (!query || haystack.includes(query)) &&
      Object.entries(filters).every(([key, value]) => !value || record[key] === value);
  });
}

function renderMarkers(records) {
  markerLayer.clearLayers();
  state.markers.clear();
  const coords = records.filter(hasCoords);
  els.emptyMap.style.display = coords.length ? "none" : "block";

  coords.forEach(record => {
    const marker = L.circleMarker([record.lat, record.lng], {
      radius: 7,
      color: typeColor(record.type),
      fillColor: typeColor(record.type),
      fillOpacity: .82,
      weight: 2
    }).addTo(markerLayer);
    marker.bindPopup(popupHtml(record));
    marker.on("click", () => openDetails(record.id));
    state.markers.set(record.id, marker);
  });

  if (coords.length) {
    map.fitBounds(L.latLngBounds(coords.map(record => [record.lat, record.lng])).pad(0.12));
  }
}

function renderRecordList(records) {
  els.recordList.innerHTML = records.slice(0, 300).map(record => `
    <button class="record-item" data-id="${escapeHtml(record.id)}">
      <strong>${escapeHtml(record.name)}</strong>
      <span>${escapeHtml([record.type, record.city, record.province].filter(Boolean).join(" · "))}</span>
      <span>${escapeHtml([record.phone, record.email].filter(Boolean).join(" · ") || "Sin contacto enriquecido")}</span>
    </button>
  `).join("");

  els.recordList.querySelectorAll("[data-id]").forEach(button => {
    button.addEventListener("click", () => openDetails(button.dataset.id));
  });
}

function popupHtml(record) {
  return `
    <strong>${escapeHtml(record.name)}</strong><br>
    ${escapeHtml(record.address || "")}<br>
    <small>${escapeHtml([record.city, record.province].filter(Boolean).join(", "))}</small><br>
    <button onclick="window.openRecord('${record.id}')">Abrir ficha</button>
  `;
}

window.openRecord = openDetails;

function openDetails(id) {
  const record = state.records.find(item => item.id === id);
  if (!record) return;
  state.selectedId = id;
  els.detailTitle.textContent = record.name || "Ficha";
  setValue("detailType", record.type);
  setValue("detailRelevance", record.relevance);
  setValue("detailName", record.name);
  setValue("detailLegalName", record.legalName);
  setValue("detailAddress", record.address);
  setValue("detailCity", record.city);
  setValue("detailProvince", record.province);
  setValue("detailCountry", record.country);
  setValue("detailPhone", record.phone);
  setValue("detailEmail", record.email);
  setValue("detailWeb", record.web);
  setValue("detailContact", record.contact);
  setValue("detailStatus", record.status);
  setValue("detailNextAction", record.nextAction);
  setValue("detailNotes", record.notes);
  setValue("detailSource", [record.source, record.sourceDate].filter(Boolean).join(" | "));
  els.details.classList.remove("hidden");

  const marker = state.markers.get(id);
  if (marker && hasCoords(record)) map.setView([record.lat, record.lng], Math.max(map.getZoom(), 13));
}

function saveSelectedRecord() {
  const record = state.records.find(item => item.id === state.selectedId);
  if (!record) return;
  Object.assign(record, {
    type: getInput("detailType"),
    relevance: getInput("detailRelevance"),
    name: getInput("detailName"),
    legalName: getInput("detailLegalName"),
    address: getInput("detailAddress"),
    city: getInput("detailCity"),
    province: getInput("detailProvince"),
    country: getInput("detailCountry"),
    phone: getInput("detailPhone"),
    email: getInput("detailEmail"),
    web: getInput("detailWeb"),
    contact: getInput("detailContact"),
    status: getInput("detailStatus"),
    nextAction: getInput("detailNextAction"),
    notes: getInput("detailNotes"),
    updatedAt: new Date().toISOString()
  });
  saveJson(STORE_KEY, state.records);
  render();
  openDetails(record.id);
}

function addSelectedToRoute() {
  if (!state.selectedId || state.route.includes(state.selectedId)) return;
  state.route.push(state.selectedId);
  saveJson(ROUTE_KEY, state.route);
  renderRoute();
}

function optimizeRoute() {
  const records = state.route.map(id => state.records.find(record => record.id === id)).filter(hasCoords);
  if (records.length < 2) return;

  const start = hasCoords(state.sellerBase) ? state.sellerBase : records[0];
  const ordered = [];
  const pending = [...records];
  while (pending.length) {
    const last = ordered[ordered.length - 1] || start;
    pending.sort((a, b) => distanceKm(last, a) - distanceKm(last, b));
    ordered.push(pending.shift());
  }

  const idsWithoutCoords = state.route.filter(id => {
    const record = state.records.find(item => item.id === id);
    return record && !hasCoords(record);
  });
  state.route = [...ordered.map(record => record.id), ...idsWithoutCoords];
  saveJson(ROUTE_KEY, state.route);
  renderRoute();
}

function renderRoute() {
  routeLayer.clearLayers();
  const records = state.route.map(id => state.records.find(record => record.id === id)).filter(Boolean);
  const mapped = records.filter(hasCoords);
  const base = hasCoords(state.sellerBase) ? state.sellerBase : null;
  const routePoints = base ? [base, ...mapped, base] : mapped;
  const totalKm = routePoints.slice(1).reduce((sum, record, index) => sum + distanceKm(routePoints[index], record), 0);
  const drivingHours = totalKm / 45;
  const visitHours = (records.length * numberValue(els.visitMinutes)) / 60;
  const fuelCost = totalKm * numberValue(els.consumption) / 100 * numberValue(els.fuelPrice);
  const dayHours = numberValue(els.dayHours);
  const days = dayHours ? Math.ceil((drivingHours + visitHours) / dayHours) : 0;

  els.routeSummary.textContent = records.length
    ? `${base ? "Ida y vuelta desde la base · " : "Sin base: orden local · "}${records.length} paradas · ${totalKm.toFixed(1)} km estimados · ${(drivingHours + visitHours).toFixed(1)} h · ${fuelCost.toFixed(2)} EUR combustible · ${days || 1} dia(s)`
    : "Sin ruta seleccionada.";

  els.routeList.innerHTML = records.map((record, index) => `
    <li>
      <button class="record-item" data-id="${escapeHtml(record.id)}">
        <strong>${index + 1}. ${escapeHtml(record.name)}</strong>
        <span>${escapeHtml([record.city, record.province, record.status].filter(Boolean).join(" · "))}</span>
      </button>
    </li>
  `).join("");

  els.routeList.querySelectorAll("[data-id]").forEach(button => {
    button.addEventListener("click", () => openDetails(button.dataset.id));
  });

  if (routePoints.length > 1) {
    L.polyline(routePoints.map(record => [record.lat, record.lng]), {
      color: "#caa24b",
      weight: 4,
      opacity: .8
    }).addTo(routeLayer);
  }
}

function mergeRecords(existing, incoming) {
  const byFingerprint = new Map(existing.map(record => [fingerprint(record), record]));
  incoming.forEach(record => {
    const key = fingerprint(record);
    if (!byFingerprint.has(key)) byFingerprint.set(key, record);
  });
  return [...byFingerprint.values()];
}

function fingerprint(record) {
  return clean([record.type, record.name, record.legalName, record.address, record.city, record.province, record.country].join("|"));
}

function makeId(sourceName, index, values) {
  return "rec_" + hash([sourceName, index, ...values].join("|"));
}

function hash(text) {
  let value = 0;
  for (let i = 0; i < text.length; i++) value = ((value << 5) - value + text.charCodeAt(i)) | 0;
  return Math.abs(value).toString(36);
}

function hasCoords(record) {
  return Number.isFinite(record?.lat) && Number.isFinite(record?.lng);
}

function distanceKm(a, b) {
  const earth = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

function toRad(degrees) {
  return degrees * Math.PI / 180;
}

function typeColor(type) {
  return {
    Estanco: "#caa24b",
    PVR: "#6fb1ff",
    Tienda: "#78d17f",
    Distribuidor: "#d278ff",
    "Contacto personal": "#ff8f61"
  }[type] || "#f5ecdf";
}

function setValue(id, value) {
  els[id].value = value || "";
}

function getInput(id) {
  return els[id].value.trim();
}

function numberValue(input) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : 0;
}

function parseNumber(value) {
  if (!value) return NaN;
  return Number(String(value).replace(",", ".").replace(/[^\d.-]/g, ""));
}

function clean(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function demoRecords() {
  return [
    {
      id: "demo_madrid",
      type: "Estanco",
      relevance: "Alta",
      name: "Demo Estanco Madrid",
      legalName: "",
      address: "Puerta del Sol",
      city: "Madrid",
      province: "Madrid",
      country: "Espana",
      postalCode: "",
      lat: 40.4169,
      lng: -3.7035,
      phone: "",
      email: "",
      web: "",
      contact: "",
      status: "Sin contactar",
      nextAction: "Validar contacto",
      notes: "Registro demo. Importar CSV oficial para cargar base real.",
      source: "Demo local",
      sourceDate: new Date().toISOString().slice(0, 10),
      updatedAt: null
    },
    {
      id: "demo_barcelona",
      type: "Estanco",
      relevance: "Alta",
      name: "Demo Estanco Barcelona",
      legalName: "",
      address: "La Rambla",
      city: "Barcelona",
      province: "Barcelona",
      country: "Espana",
      postalCode: "",
      lat: 41.3818,
      lng: 2.1720,
      phone: "",
      email: "",
      web: "",
      contact: "",
      status: "Sin contactar",
      nextAction: "Validar contacto",
      notes: "Registro demo.",
      source: "Demo local",
      sourceDate: new Date().toISOString().slice(0, 10),
      updatedAt: null
    }
  ];
}
