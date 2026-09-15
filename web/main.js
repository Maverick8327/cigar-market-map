const STORE_KEY = "cigar-market-records-v1";
const ROUTE_KEY = "cigar-market-route-v1";
const SELLER_BASE_KEY = "cigar-market-seller-base-v1";
const HOLIDAYS_KEY = "cigar-market-holidays-v1";
const ROAD_ROUTE_KEY = "cigar-market-road-route-v1";
const BUNDLED_CATALOG_KEY = "cigar-market-bundled-catalog-v1";

const state = {
  records: loadJson(STORE_KEY, []),
  route: loadJson(ROUTE_KEY, []),
  sellerBase: loadJson(SELLER_BASE_KEY, null),
  holidays: loadJson(HOLIDAYS_KEY, []),
  roadRoute: loadJson(ROAD_ROUTE_KEY, null),
  mapView: "points",
  markers: new Map(),
  selectedId: null,
  pickingSellerBase: false,
  editingRoute: false,
};

const els = Object.fromEntries([
  "csvInput", "searchInput", "countryFilter", "provinceFilter", "cityFilter",
  "typeFilter", "statusFilter", "totalCount", "visibleCount", "mappedCount",
  "routeCount", "recordList", "routeList", "routeSummary", "clearRoute",
  "optimizeRoute", "dayHours", "visitMinutes", "consumption", "fuelPrice",
  "sellerBaseName", "sellerBaseLat", "sellerBaseLng", "sellerBaseStatus",
  "useMyLocation", "pickSellerBase", "saveSellerBase", "clearSellerBase",
  "loadHolidays", "holidayCountry", "holidayYear", "holidayDate", "holidaySummary",
  "holidayList", "mapViewHint", "openGoogleRoute", "openWazeRoute", "trafficNote",
  "refreshRoadRoute", "editRouteMap", "routeAlternatives",
  "details", "closeDetails", "detailTitle", "detailType", "detailRelevance",
  "detailName", "detailLegalName", "detailAddress", "detailCity",
  "detailProvince", "detailCountry", "detailLat", "detailLng", "detailPhone", "detailEmail",
  "detailWeb", "detailContact", "detailStatus", "detailNextAction",
  "detailNotes", "detailSource", "saveDetails", "addToRoute", "geocodeDetails", "emptyMap"
].map(id => [id, document.getElementById(id)]));

const map = L.map("map", { preferCanvas: true }).setView([40.4168, -3.7038], 6);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
const sellerBaseLayer = L.layerGroup().addTo(map);
const holidayLayer = L.layerGroup().addTo(map);
const routeEditorLayer = L.layerGroup().addTo(map);
let heatLayer = null;

bindEvents();

els.holidayYear.value = new Date().getFullYear();
els.holidayDate.value = new Date().toISOString().slice(0, 10);

initialize();

async function initialize() {
  if (!state.records.length) {
    state.records = demoRecords();
    saveJson(STORE_KEY, state.records);
  }
  render();
  await loadBundledCatalog();
}

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
  els.geocodeDetails.addEventListener("click", geocodeSelectedRecord);
  els.clearRoute.addEventListener("click", () => {
    state.route = [];
    saveJson(ROUTE_KEY, state.route);
    clearRoadRoute();
    render();
  });
  els.optimizeRoute.addEventListener("click", optimizeRoute);
  els.saveSellerBase.addEventListener("click", saveSellerBaseFromInputs);
  els.clearSellerBase.addEventListener("click", clearSellerBase);
  els.pickSellerBase.addEventListener("click", toggleSellerBasePicker);
  els.useMyLocation.addEventListener("click", useMyLocation);
  els.loadHolidays.addEventListener("click", loadHolidays);
  els.holidayDate.addEventListener("change", render);
  els.holidayCountry.addEventListener("input", renderHolidays);
  els.holidayYear.addEventListener("input", renderHolidays);
  els.openGoogleRoute.addEventListener("click", openGoogleRoute);
  els.openWazeRoute.addEventListener("click", openWazeRoute);
  els.refreshRoadRoute.addEventListener("click", refreshRoadRoute);
  els.editRouteMap.addEventListener("click", toggleRouteEditing);
  document.querySelectorAll(".view-tab").forEach(button => {
    button.addEventListener("click", () => {
      state.mapView = button.dataset.view;
      document.querySelectorAll(".view-tab").forEach(tab => tab.classList.toggle("active", tab === button));
      render();
    });
  });
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

async function loadBundledCatalog() {
  try {
    const response = await fetch("./data/locations.json");
    if (!response.ok) throw new Error("Catalogo no disponible");
    const catalog = await response.json();
    const incoming = (catalog.records || []).map(normalizeBundledRecord);
    state.records = mergeRecords(state.records, incoming);
    localStorage.setItem(BUNDLED_CATALOG_KEY, catalog.generatedAt || "loaded");
    saveJson(STORE_KEY, state.records);
    render();
  } catch {
    // The app remains usable with the device-local records when offline.
  }
}

function normalizeBundledRecord(record) {
  return {
    ...record,
    relevance: record.relevance || "Sin clasificar",
    dataStatus: record.dataStatus || "Pendiente",
    status: record.status || "Sin contactar",
    nextAction: record.nextAction || "Validar ficha",
    notes: record.notes || "",
    sourceDate: record.sourceDate || "",
    updatedAt: record.updatedAt || null,
  };
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
    dataStatus: value("estado dato") || "Pendiente",
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
  renderDensity(filtered);
  renderHolidays();
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

function renderDensity(records) {
  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }
  const points = records.filter(hasCoords);
  if (state.mapView === "density" && points.length && window.L?.heatLayer) {
    heatLayer = L.heatLayer(points.map(record => [record.lat, record.lng, densityWeight(record)]), {
      radius: 28,
      blur: 22,
      maxZoom: 15,
      minOpacity: .35,
      gradient: { .2: "#7b5cd6", .45: "#3f9bd6", .65: "#d6b34a", .85: "#d57a39", 1: "#bd3e32" }
    }).addTo(map);
  }
  els.mapViewHint.textContent = {
    points: "Puntos comerciales y contactos cargados en la base.",
    density: `${points.length} ubicaciones georreferenciadas. Los colores intensos indican mayor concentracion comercial.`,
    holidays: "Los feriados aplican a los puntos del pais seleccionado. Selecciona una fecha para identificar jornadas sensibles."
  }[state.mapView];
}

function densityWeight(record) {
  return { Alta: 1, Media: .65, Baja: .35 }[record.relevance] || .5;
}

async function loadHolidays() {
  const country = getInput("holidayCountry").toUpperCase();
  const year = Number(els.holidayYear.value);
  if (!/^[A-Z]{2}$/.test(country) || !Number.isFinite(year)) {
    els.holidaySummary.textContent = "Indica un pais ISO de dos letras y un anio valido.";
    return;
  }
  els.holidaySummary.textContent = "Consultando calendario nacional...";
  try {
    const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`);
    if (!response.ok) throw new Error("Calendario no disponible");
    const holidays = await response.json();
    state.holidays = state.holidays.filter(item => item.countryCode !== country || item.year !== year);
    state.holidays.push(...holidays.map(item => ({ ...item, countryCode: country, year })));
    saveJson(HOLIDAYS_KEY, state.holidays);
    render();
  } catch {
    els.holidaySummary.textContent = "No se pudo actualizar. Puedes conservar los feriados guardados y trabajar sin conexion.";
  }
}

function renderHolidays() {
  holidayLayer.clearLayers();
  const country = getInput("holidayCountry").toUpperCase();
  const year = Number(els.holidayYear.value);
  const selectedDate = els.holidayDate.value;
  const holidays = state.holidays.filter(item => item.countryCode === country && item.year === year);
  const selected = holidays.filter(item => item.date === selectedDate);
  const countryRecords = state.records.filter(record => isoCountry(record.country) === country && hasCoords(record));

  els.holidaySummary.textContent = holidays.length
    ? `${holidays.length} feriados nacionales cargados. ${selected.length ? `${selected[0].localName || selected[0].name}: revisar visitas y horarios.` : "Sin feriado nacional en la fecha seleccionada."}`
    : "Carga los feriados nacionales del pais de trabajo.";
  els.holidayList.innerHTML = holidays.slice(0, 16).map(item => `
    <button class="holiday-item ${item.date === selectedDate ? "selected" : ""}" data-holiday-date="${item.date}">
      <strong>${escapeHtml(item.date)}</strong><span>${escapeHtml(item.localName || item.name)}</span>
    </button>
  `).join("") || '<p class="hint">Sin datos locales. Presiona Actualizar con conexion.</p>';
  els.holidayList.querySelectorAll("[data-holiday-date]").forEach(button => {
    button.addEventListener("click", () => { els.holidayDate.value = button.dataset.holidayDate; render(); });
  });

  if (state.mapView === "holidays" && selected.length) {
    countryRecords.forEach(record => {
      L.circleMarker([record.lat, record.lng], {
        radius: 11,
        color: "#ffcf70",
        fillColor: "#8c342f",
        fillOpacity: .75,
        weight: 3
      }).bindPopup(`<strong>Revision de feriado</strong><br>${escapeHtml(record.name)}<br>${escapeHtml(selected[0].localName || selected[0].name)}`).addTo(holidayLayer);
    });
  }
}

function isoCountry(country) {
  const value = clean(country);
  return ({ espana: "ES", spain: "ES", portugal: "PT", france: "FR", francia: "FR", italy: "IT", italia: "IT", germany: "DE", alemania: "DE", uk: "GB", "reino unido": "GB", "united kingdom": "GB" })[value] || "";
}

function openGoogleRoute() {
  const mapped = state.route.map(id => state.records.find(record => record.id === id)).filter(hasCoords);
  const base = hasCoords(state.sellerBase) ? state.sellerBase : null;
  if (!mapped.length) {
    els.trafficNote.textContent = "Agrega al menos una parada con coordenadas para abrir la navegacion.";
    return;
  }
  const origin = base ? coordinateText(base) : coordinateText(mapped[0]);
  const destination = base ? coordinateText(base) : coordinateText(mapped[mapped.length - 1]);
  const stops = base ? mapped : mapped.slice(1, -1);
  const params = new URLSearchParams({ api: "1", origin, destination, travelmode: "driving" });
  if (stops.length) params.set("waypoints", stops.map(coordinateText).join("|"));
  window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank", "noopener");
}

function openWazeRoute() {
  const mapped = state.route.map(id => state.records.find(record => record.id === id)).filter(hasCoords);
  const destination = mapped[mapped.length - 1];
  if (!destination) {
    els.trafficNote.textContent = "Agrega una parada con coordenadas para abrir Waze.";
    return;
  }
  window.open(`https://waze.com/ul?ll=${destination.lat}%2C${destination.lng}&navigate=yes&utm_source=cigar_market_map`, "_blank", "noopener");
}

function coordinateText(point) {
  return `${point.lat},${point.lng}`;
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
  if (!coords.length && state.records.length) {
    els.emptyMap.innerHTML = `<h2>${state.records.length} fichas cargadas</h2><p>Selecciona una ficha y usa Geocodificar para ubicarla con precision antes de planificar visitas.</p>`;
  }

  coords.forEach(record => {
    const marker = L.circleMarker([record.lat, record.lng], {
      radius: 7,
      color: typeColor(record.type),
      fillColor: typeColor(record.type),
      fillOpacity: state.mapView === "density" ? .22 : .82,
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
      <span>${escapeHtml([record.phone, record.email, record.dataStatus].filter(Boolean).join(" · ") || "Sin contacto enriquecido")}</span>
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
  setValue("detailLat", record.lat);
  setValue("detailLng", record.lng);
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
    lat: parseNumber(getInput("detailLat")),
    lng: parseNumber(getInput("detailLng")),
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

async function geocodeSelectedRecord() {
  const record = state.records.find(item => item.id === state.selectedId);
  if (!record) return;
  const query = [record.address, record.city, record.province, record.country].filter(Boolean).join(", ");
  if (!query) {
    els.detailSource.value = "No hay direccion suficiente para geocodificar.";
    return;
  }
  els.geocodeDetails.textContent = "Buscando ubicacion...";
  els.geocodeDetails.disabled = true;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    const matches = await response.json();
    if (!matches?.length) throw new Error("Sin coincidencia");
    record.lat = Number(matches[0].lat);
    record.lng = Number(matches[0].lon);
    record.updatedAt = new Date().toISOString();
    saveJson(STORE_KEY, state.records);
    render();
    openDetails(record.id);
  } catch {
    els.detailSource.value = "No se encontro una ubicacion precisa. Verifica direccion y ciudad.";
  } finally {
    els.geocodeDetails.textContent = "Geocodificar ficha";
    els.geocodeDetails.disabled = false;
  }
}

function addSelectedToRoute() {
  if (!state.selectedId || state.route.includes(state.selectedId)) return;
  state.route.push(state.selectedId);
  saveJson(ROUTE_KEY, state.route);
  clearRoadRoute();
  render();
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
  clearRoadRoute();
  render();
  refreshRoadRoute();
}

function renderRoute() {
  routeLayer.clearLayers();
  const records = state.route.map(id => state.records.find(record => record.id === id)).filter(Boolean);
  const mapped = records.filter(hasCoords);
  const base = hasCoords(state.sellerBase) ? state.sellerBase : null;
  const routePoints = base ? [base, ...mapped, base] : mapped;
  const signature = routeSignature(routePoints);
  const roadRoute = state.roadRoute?.signature === signature ? state.roadRoute : null;
  const selectedRoad = roadRoute?.routes?.[roadRoute.selected] || null;
  const totalKm = selectedRoad ? selectedRoad.distance / 1000 : routePoints.slice(1).reduce((sum, record, index) => sum + distanceKm(routePoints[index], record), 0);
  const drivingHours = selectedRoad ? selectedRoad.duration / 3600 : totalKm / 45;
  const visitHours = (records.length * numberValue(els.visitMinutes)) / 60;
  const fuelCost = totalKm * numberValue(els.consumption) / 100 * numberValue(els.fuelPrice);
  const dayHours = numberValue(els.dayHours);
  const days = dayHours ? Math.ceil((drivingHours + visitHours) / dayHours) : 0;

  els.routeSummary.textContent = records.length
    ? `${selectedRoad ? "Ruta por calles · " : "Estimacion geografica · "}${base ? "ida y vuelta desde la base · " : ""}${records.length} paradas · ${totalKm.toFixed(1)} km · ${(drivingHours + visitHours).toFixed(1)} h · ${fuelCost.toFixed(2)} EUR combustible · ${days || 1} dia(s)`
    : "Sin ruta seleccionada.";

  els.routeList.innerHTML = records.map((record, index) => `
    <li>
      <div class="route-stop">
        <button class="record-item" data-id="${escapeHtml(record.id)}">
        <strong>${index + 1}. ${escapeHtml(record.name)}</strong>
        <span>${escapeHtml([record.city, record.province, record.status].filter(Boolean).join(" · "))}</span>
        </button>
        <div class="stop-controls">
          <button class="icon-button" data-route-action="up" data-id="${escapeHtml(record.id)}" title="Subir parada">↑</button>
          <button class="icon-button" data-route-action="down" data-id="${escapeHtml(record.id)}" title="Bajar parada">↓</button>
          <button class="icon-button remove" data-route-action="remove" data-id="${escapeHtml(record.id)}" title="Quitar parada">×</button>
        </div>
      </div>
    </li>
  `).join("");

  els.routeList.querySelectorAll("[data-id]").forEach(button => {
    if (!button.dataset.routeAction) button.addEventListener("click", () => openDetails(button.dataset.id));
  });
  els.routeList.querySelectorAll("[data-route-action]").forEach(button => {
    button.addEventListener("click", () => adjustRouteStop(button.dataset.id, button.dataset.routeAction));
  });

  els.routeAlternatives.innerHTML = roadRoute?.routes?.length > 1
    ? roadRoute.routes.map((route, index) => `
      <button class="alternative ${index === roadRoute.selected ? "selected" : ""}" data-route-choice="${index}">
        Opcion ${index + 1}: ${(route.distance / 1000).toFixed(1)} km · ${(route.duration / 60).toFixed(0)} min
      </button>
    `).join("")
    : "";
  els.routeAlternatives.querySelectorAll("[data-route-choice]").forEach(button => {
    button.addEventListener("click", () => selectRoadRoute(Number(button.dataset.routeChoice)));
  });

  if (selectedRoad?.geometry?.coordinates?.length) {
    L.geoJSON(selectedRoad.geometry, { style: { color: "#f1b94f", weight: 5, opacity: .92 } }).addTo(routeLayer);
  } else if (routePoints.length > 1) {
    L.polyline(routePoints.map(record => [record.lat, record.lng]), { color: "#caa24b", weight: 4, opacity: .8, dashArray: "7 8" }).addTo(routeLayer);
  }
  renderRouteEditor(records);
}

async function refreshRoadRoute() {
  const records = state.route.map(id => state.records.find(record => record.id === id)).filter(hasCoords);
  const base = hasCoords(state.sellerBase) ? state.sellerBase : null;
  const points = base ? [base, ...records, base] : records;
  if (points.length < 2) {
    els.trafficNote.textContent = "Agrega dos puntos georreferenciados para trazar por calles.";
    return;
  }
  els.trafficNote.textContent = "Calculando ruta por calles...";
  try {
    const coordinates = points.map(point => `${point.lng},${point.lat}`).join(";");
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&alternatives=true&steps=false`);
    if (!response.ok) throw new Error("Ruta no disponible");
    const data = await response.json();
    if (!data.routes?.length) throw new Error("Sin alternativas");
    state.roadRoute = { signature: routeSignature(points), routes: data.routes.slice(0, 3), selected: 0, updatedAt: new Date().toISOString() };
    saveJson(ROAD_ROUTE_KEY, state.roadRoute);
    els.trafficNote.textContent = "Ruta por calles actualizada. Usa Google Maps o Waze antes de salir para trafico y cierres en vivo.";
    renderRoute();
  } catch {
    clearRoadRoute();
    els.trafficNote.textContent = "No fue posible calcular por calles ahora. Se mantiene la estimacion y puedes abrir Google Maps o Waze.";
    renderRoute();
  }
}

function selectRoadRoute(index) {
  if (!state.roadRoute?.routes?.[index]) return;
  state.roadRoute.selected = index;
  saveJson(ROAD_ROUTE_KEY, state.roadRoute);
  renderRoute();
}

function adjustRouteStop(id, action) {
  const index = state.route.indexOf(id);
  if (index < 0) return;
  if (action === "remove") state.route.splice(index, 1);
  if (action === "up" && index > 0) [state.route[index - 1], state.route[index]] = [state.route[index], state.route[index - 1]];
  if (action === "down" && index < state.route.length - 1) [state.route[index + 1], state.route[index]] = [state.route[index], state.route[index + 1]];
  saveJson(ROUTE_KEY, state.route);
  clearRoadRoute();
  render();
  refreshRoadRoute();
}

function toggleRouteEditing() {
  state.editingRoute = !state.editingRoute;
  els.editRouteMap.textContent = state.editingRoute ? "Terminar edicion" : "Editar en mapa";
  els.trafficNote.textContent = state.editingRoute ? "Arrastra los numeros de parada en el mapa. La ruta se recalculara al soltar." : els.trafficNote.textContent;
  renderRoute();
}

function renderRouteEditor(records) {
  routeEditorLayer.clearLayers();
  if (!state.editingRoute) return;
  records.filter(hasCoords).forEach((record, index) => {
    const marker = L.marker([record.lat, record.lng], {
      draggable: true,
      icon: L.divIcon({ className: "route-editor-marker", html: String(index + 1), iconSize: [30, 30], iconAnchor: [15, 15] })
    }).addTo(routeEditorLayer);
    marker.bindTooltip(`Mover: ${record.name}`, { direction: "top" });
    marker.on("dragend", event => {
      const location = event.target.getLatLng();
      record.lat = location.lat;
      record.lng = location.lng;
      record.updatedAt = new Date().toISOString();
      saveJson(STORE_KEY, state.records);
      clearRoadRoute();
      render();
      refreshRoadRoute();
    });
  });
}

function clearRoadRoute() {
  state.roadRoute = null;
  localStorage.removeItem(ROAD_ROUTE_KEY);
}

function routeSignature(points) {
  return points.map(point => `${Number(point.lat).toFixed(5)},${Number(point.lng).toFixed(5)}`).join("|");
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
