// =====================================================
//  TERRAWEATHER — app.js  (All Pages)
//  Architecture: single JS file, page-aware routing
//  Each page calls its own init function at the bottom
// =====================================================

const API_KEY = "ef7c1d3fb06b7663e9e1400164cd4798";
const BASE    = "https://api.openweathermap.org/data/2.5";
const BACKEND = "http://localhost:3000/api";

// All 20 Indian cities shown on cities page
const CITIES = [
  {name:"Mumbai",    code:"MUM"},{name:"Delhi",     code:"DEL"},
  {name:"Bangalore", code:"BLR"},{name:"Chennai",   code:"MAA"},
  {name:"Kolkata",   code:"CCU"},{name:"Hyderabad", code:"HYD"},
  {name:"Pune",      code:"PNQ"},{name:"Jaipur",    code:"JAI"},
  {name:"Ahmedabad", code:"AMD"},{name:"Surat",     code:"STV"},
  {name:"Lucknow",   code:"LKO"},{name:"Bhopal",    code:"BHO"},
  {name:"Kochi",     code:"COK"},{name:"Indore",    code:"IDR"},
  {name:"Nagpur",    code:"NAG"},{name:"Patna",     code:"PAT"},
  {name:"Chandigarh",code:"IXC"},{name:"Guwahati",  code:"GAU"},
  {name:"Coimbatore",code:"CJB"},{name:"Vadodara",  code:"BDQ"},
];

const PAGE = document.body?.dataset?.page;

// ── LIVE CLOCK ────────────────────────────────────
function startClock() {
  function tick() {
    const el = document.getElementById("navClock");
    if (el) el.textContent = new Date().toLocaleTimeString("en-IN",
      {hour:"2-digit",minute:"2-digit",second:"2-digit"});
  }
  tick();
  setInterval(tick, 1000);
}

// ── LOADER ───────────────────────────────────────
function showLoader() {
  const l = document.getElementById("loader");
  if (l) l.classList.add("show");
}
function hideLoader() {
  const l = document.getElementById("loader");
  if (l) l.classList.remove("show");
}

// ── TOAST ────────────────────────────────────────
function toast(msg, type="info") {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const colors = {info:"var(--primary)", ok:"var(--green)", err:"var(--red)", warn:"var(--yellow)"};
  const t = document.createElement("div");
  t.className = "toast";
  t.style.borderLeft = `3px solid ${colors[type]||colors.info}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3800);
}

// ── SHARED SEARCH SETUP ──────────────────────────
// Attaches search input listeners on any page that has them
function setupSearch(onSearch) {
  const input = document.getElementById("searchInput");
  const btn   = document.getElementById("searchBtn");
  const locBtn= document.getElementById("locationBtn");
  const sugs  = document.getElementById("suggestions");
  if (!input) return;

  btn?.addEventListener("click", () => {
    const city = input.value.trim();
    if (!city) return toast("Please enter a city name.", "err");
    if (sugs) sugs.innerHTML = "";
    onSearch(city);
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") btn?.click();
  });

  input.addEventListener("input", () => {
    if (!sugs) return;
    const q = input.value.toLowerCase();
    sugs.innerHTML = "";
    if (!q || q.length < 2) return;
    const matches = CITIES.filter(c => c.name.toLowerCase().startsWith(q));
    matches.slice(0,5).forEach(c => {
      const d = document.createElement("div");
      d.className = "sug-item";
      d.innerHTML = `<span style="color:var(--primary);font-size:0.7rem">[${c.code}]</span> ${c.name}, India`;
      d.addEventListener("click", () => {
        input.value = c.name;
        sugs.innerHTML = "";
        onSearch(c.name);
      });
      sugs.appendChild(d);
    });
  });

  document.addEventListener("click", e => {
    if (!e.target.closest(".search-field") && !e.target.closest("#suggestions"))
      if (sugs) sugs.innerHTML = "";
  });

  locBtn?.addEventListener("click", () => {
    if (!navigator.geolocation)
      return toast("Geolocation not supported.", "err");
    showLoader();
    navigator.geolocation.getCurrentPosition(
      pos => fetchByCoords(pos.coords.latitude, pos.coords.longitude, onSearch),
      () => { hideLoader(); toast("Location denied.", "err"); }
    );
  });
}

async function fetchByCoords(lat, lon, callback) {
  try {
    const res  = await fetch(`${BASE}/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`);
    const data = await res.json();
    if (document.getElementById("searchInput"))
      document.getElementById("searchInput").value = data.name;
    callback(data.name, data);
  } catch {
    hideLoader();
    toast("Could not get location weather.", "err");
  }
}

// ── FETCH WEATHER ────────────────────────────────
// Returns the raw JSON from OpenWeatherMap
async function fetchWeather(city) {
  const res = await fetch(`${BASE}/weather?q=${encodeURIComponent(city)},IN&units=metric&appid=${API_KEY}`);
  if (!res.ok) throw new Error("City not found.");
  return res.json();
}

// ── FETCH FORECAST ───────────────────────────────
async function fetchForecast(lat, lon) {
  const res = await fetch(`${BASE}/forecast?lat=${lat}&lon=${lon}&units=metric&cnt=40&appid=${API_KEY}`);
  return res.json();
}

// ── SAVE TO BACKEND (MySQL) ──────────────────────
async function saveSearch(city, temp, description) {
  try {
    await fetch(`${BACKEND}/searches`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({city, temp, description})
    });
  } catch { /* silent if backend offline */ }
}

// ══════════════════════════════════════════════════
//  ALERT ENGINE — the core, fixed alert system
//  Takes raw API data, returns array of alert objects
// ══════════════════════════════════════════════════
function generateAlerts(data) {
  const alerts = [];
  const temp     = data.main.temp;           // in Celsius
  const humidity = data.main.humidity;       // in %
  const windKmh  = data.wind.speed * 3.6;   // convert m/s to km/h
  const main     = data.weather[0].main;    // "Rain","Clear","Clouds","Thunder" etc
  const desc     = data.weather[0].description;

  // ── TEMPERATURE ─────────────────────────────
  if (temp >= 44) {
    alerts.push({level:"critical", icon:"🔥", title:"EXTREME HEAT EMERGENCY",
      msg:`Temperature is ${Math.round(temp)}°C — dangerously high.`,
      action:"Stay indoors. Do NOT go outside. Drink 3–4 litres of water. Keep AC/fans on."});
  } else if (temp >= 38) {
    alerts.push({level:"warning", icon:"☀️", title:"HEAT WARNING",
      msg:`${Math.round(temp)}°C — very hot conditions in ${data.name}.`,
      action:"Avoid going out between 11 AM and 4 PM. Wear light cotton clothes. Stay hydrated."});
  } else if (temp >= 32) {
    alerts.push({level:"info", icon:"🌡️", title:"WARM WEATHER",
      msg:`${Math.round(temp)}°C — warm day ahead.`,
      action:"Carry water. Wear sunscreen if outdoors for long periods."});
  } else if (temp <= 6) {
    alerts.push({level:"critical", icon:"🧊", title:"SEVERE COLD WARNING",
      msg:`Temperature is ${Math.round(temp)}°C — risk of hypothermia.`,
      action:"Wear multiple warm layers. Avoid exposed skin outdoors. Check on elderly neighbours."});
  } else if (temp <= 14) {
    alerts.push({level:"warning", icon:"❄️", title:"COLD WEATHER ALERT",
      msg:`${Math.round(temp)}°C — cold conditions expected.`,
      action:"Wear warm jacket and woolens before stepping out."});
  }

  // ── WEATHER CONDITIONS ───────────────────────
  if (main === "Thunderstorm") {
    alerts.push({level:"critical", icon:"⚡", title:"THUNDERSTORM WARNING",
      msg:`Active thunderstorm detected over ${data.name}. Dangerous lightning.`,
      action:"Stay indoors immediately. Unplug electronics. Avoid open areas, trees, and metal."});
  }
  if (main === "Rain" || main === "Drizzle") {
    const heavy = desc.includes("heavy") || desc.includes("extreme");
    alerts.push({level: heavy ? "warning" : "info", icon:"🌧️",
      title: heavy ? "HEAVY RAIN ALERT" : "RAIN ADVISORY",
      msg:`${desc} expected in ${data.name}.`,
      action:"Carry umbrella. Expect waterlogging. Allow extra travel time. Slippery roads."});
  }
  if (main === "Snow") {
    alerts.push({level:"warning", icon:"❄️", title:"SNOWFALL ALERT",
      msg:`Snowfall expected in ${data.name}.`,
      action:"Drive with extreme care. Carry warm clothing. Avoid isolated roads."});
  }
  if (main === "Fog" || main === "Mist" || main === "Haze") {
    alerts.push({level:"warning", icon:"🌫️", title:"LOW VISIBILITY",
      msg:`${desc} reducing visibility in ${data.name}.`,
      action:"Use fog lights while driving. Drive below 40 km/h. Use horn at intersections."});
  }
  if (main === "Smoke" || main === "Ash" || main === "Sand" || main === "Dust") {
    alerts.push({level:"critical", icon:"💨", title:"AIR QUALITY HAZARD",
      msg:`${desc} detected — hazardous air quality.`,
      action:"Wear N95 mask outdoors. Keep windows closed. Avoid outdoor exercise."});
  }

  // ── HUMIDITY ─────────────────────────────────
  if (humidity >= 90) {
    alerts.push({level:"warning", icon:"💧", title:"EXTREME HUMIDITY",
      msg:`${humidity}% humidity — severe heat-index effect.`,
      action:"Risk of heat exhaustion is very high. Stay in cool areas. Drink electrolytes."});
  } else if (humidity >= 80) {
    alerts.push({level:"info", icon:"💦", title:"HIGH HUMIDITY",
      msg:`${humidity}% humidity — uncomfortable conditions.`,
      action:"Stay hydrated. Wear breathable clothes. Limit outdoor physical activity."});
  }

  // ── WIND ─────────────────────────────────────
  if (windKmh >= 65) {
    alerts.push({level:"critical", icon:"🌪️", title:"GALE FORCE WINDS",
      msg:`Wind speed ${Math.round(windKmh)} km/h — dangerous.`,
      action:"Secure all outdoor objects. Avoid driving tall vehicles. Stay away from trees."});
  } else if (windKmh >= 45) {
    alerts.push({level:"warning", icon:"💨", title:"STRONG WIND WARNING",
      msg:`${Math.round(windKmh)} km/h winds detected.`,
      action:"Secure loose items on balconies/terraces. Two-wheelers ride with caution."});
  }

  // ── ALL CLEAR ────────────────────────────────
  if (alerts.length === 0) {
    alerts.push({level:"safe", icon:"✅", title:"ALL CLEAR — SAFE CONDITIONS",
      msg:`Weather conditions in ${data.name} are normal. No active alerts.`,
      action:"Enjoy your day! Current conditions are safe for all outdoor activities."});
  }

  return alerts;
}

// ── RENDER ALERTS INTO #alertStrip (home page) ────────────────
function renderAlertStrip(alerts) {
  const strip = document.getElementById("alertStrip");
  if (!strip) return;
  strip.innerHTML = "";
  // Only show first 2 alerts on home strip, critical first
  const sorted = [...alerts].sort((a,b) => {
    const order = {critical:0,warning:1,info:2,safe:3};
    return (order[a.level]||3) - (order[b.level]||3);
  });
  sorted.slice(0,2).forEach(a => {
    const div = document.createElement("div");
    div.className = `alert-card ${a.level}`;
    div.innerHTML = `
      <div class="alert-icon-big">${a.icon}</div>
      <div>
        <div class="alert-title-text">${a.title}</div>
        <div class="alert-body-text">${a.msg}</div>
      </div>`;
    strip.appendChild(div);
  });

  // Push browser notification for critical
  const crit = sorted.find(a => a.level === "critical");
  if (crit && "Notification" in window) {
    Notification.requestPermission().then(p => {
      if (p === "granted")
        new Notification("TerraWeather Alert", {body: crit.msg});
    });
  }
}

// ── RENDER ALERTS INTO #alertsList (alerts page) ──────────────
function renderAlertsFull(alerts, data) {
  const list = document.getElementById("alertsList");
  const hero_temp = document.getElementById("ah-temp");
  const hero_city = document.getElementById("ah-city");
  if (!list) return;
  if (hero_temp) hero_temp.textContent = `${Math.round(data.main.temp)}°C`;
  if (hero_city) hero_city.textContent = data.name.toUpperCase();

  list.innerHTML = "";
  alerts.forEach(a => {
    const div = document.createElement("div");
    div.className = `alert-full-card ${a.level}`;
    div.innerHTML = `
      <div class="afc-icon">${a.icon}</div>
      <div style="flex:1">
        <div class="afc-level">${a.level.toUpperCase()}</div>
        <div class="afc-title">${a.title}</div>
        <div class="afc-msg">${a.msg}</div>
        <div class="afc-what-to-do"><strong>WHAT TO DO: </strong>${a.action}</div>
      </div>`;
    list.appendChild(div);
  });
}

// ════════════════════════════════════════════
//  HOME PAGE LOGIC
// ════════════════════════════════════════════
function initHome() {
  setupSearch(async (city) => {
    showLoader();
    try {
      const data = await fetchWeather(city);
      updateRadar(data);
      updateStats(data);
      renderAlertStrip(generateAlerts(data));
      loadMiniforecast(data.coord.lat, data.coord.lon);
      saveSearch(data.name, data.main.temp, data.weather[0].description);
      loadHistory();
      toast(`${data.name} loaded.`, "ok");
    } catch (e) {
      hideLoader();
      toast(e.message, "err");
    }
  });

  document.getElementById("clearBtn")?.addEventListener("click", async () => {
    if (!confirm("Clear all search history from database?")) return;
    try {
      await fetch(`${BACKEND}/searches`, {method:"DELETE"});
      loadHistory();
      toast("History cleared.", "warn");
    } catch { toast("Backend not running.", "err"); }
  });

  loadHistory();
}

function updateRadar(data) {
  hideLoader();
  const temp   = document.getElementById("radarTemp");
  const city   = document.getElementById("radarCity");
  const desc   = document.getElementById("radarDesc");
  const icon   = document.getElementById("radarIcon");
  const statsRow = document.getElementById("statsRow");
  const sunRow = document.getElementById("sunRow");

  if (temp) temp.innerHTML = `${Math.round(data.main.temp)}<span class="radar-unit">°</span>`;
  if (city) city.textContent = data.name.toUpperCase();
  if (desc) desc.textContent = data.weather[0].description.toUpperCase();
  if (icon) icon.innerHTML  = `<img src="https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png" alt=""/>`;
  if (statsRow) statsRow.style.display = "grid";
  if (sunRow)   sunRow.style.display   = "grid";
}

function updateStats(data) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
  set("s-temp",  `${Math.round(data.main.temp)}<span class="stat-unit">°C</span>`);
  set("s-hum",   `${data.main.humidity}<span class="stat-unit">%</span>`);
  set("s-wind",  `${(data.wind.speed*3.6).toFixed(0)}<span class="stat-unit">km/h</span>`);
  set("s-pres",  `${data.main.pressure}<span class="stat-unit">hPa</span>`);
  set("s-vis",   `${data.visibility ? (data.visibility/1000).toFixed(1) : "N/A"}<span class="stat-unit">km</span>`);
  set("s-feel",  `${Math.round(data.main.feels_like)}<span class="stat-unit">°C</span>`);
  const fmt = ts => new Date(ts*1000).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
  set("s-rise",  fmt(data.sys.sunrise));
  set("s-set",   fmt(data.sys.sunset));
}

async function loadMiniforecast(lat, lon) {
  try {
    const data  = await fetchForecast(lat, lon);
    const el    = document.getElementById("miniforecast");
    if (!el) return;
    const days  = {};
    data.list.forEach(item => {
      const d = new Date(item.dt*1000).toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"});
      if (!days[d]) days[d] = item;
    });
    el.innerHTML = Object.entries(days).slice(0,5).map(([d,i]) => `
      <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border2)">
        <span style="color:var(--muted);width:110px;font-size:0.7rem;letter-spacing:1px">${d}</span>
        <img src="https://openweathermap.org/img/wn/${i.weather[0].icon}.png" style="width:28px;height:28px"/>
        <span style="color:var(--text);font-family:var(--font-disp);font-weight:700">${Math.round(i.main.temp)}°C</span>
        <span style="color:var(--muted);font-size:0.7rem;text-transform:capitalize">${i.weather[0].description}</span>
      </div>`).join("");
  } catch { /* silent */ }
}

async function loadHistory() {
  const list = document.getElementById("historyList");
  if (!list) return;
  try {
    const res  = await fetch(`${BACKEND}/searches`);
    const data = await res.json();
    if (!data.length) {
      list.innerHTML = `<div class="no-history">NO SEARCHES YET</div>`;
      return;
    }
    list.innerHTML = data.map(item => `
      <div class="history-item" onclick="document.getElementById('searchInput').value='${item.city}';document.getElementById('searchBtn').click()">
        <span class="hi-icon">▶</span>
        <span class="hi-city">${item.city}</span>
        <span class="hi-temp">${Math.round(item.temp)}°</span>
        <span class="hi-desc">${(item.description||"").substring(0,12)}</span>
      </div>`).join("");
  } catch {
    list.innerHTML = `<div class="no-history">START SERVER TO ENABLE HISTORY</div>`;
  }
}

// ════════════════════════════════════════════
//  FORECAST PAGE LOGIC
// ════════════════════════════════════════════
function initForecast() {
  setupSearch(async (city) => {
    showLoader();
    try {
      const curr = await fetchWeather(city);
      const fore = await fetchForecast(curr.coord.lat, curr.coord.lon);
      renderFiveDay(fore.list);
      renderHourly(fore.list);
      hideLoader();
      toast(`Forecast loaded for ${curr.name}.`, "ok");
    } catch (e) {
      hideLoader();
      toast(e.message, "err");
    }
  });
}

function renderFiveDay(list) {
  const grid  = document.getElementById("fiveDayGrid");
  if (!grid) return;
  const days = {};
  list.forEach(item => {
    const d = new Date(item.dt*1000).toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"});
    const h = new Date(item.dt*1000).getHours();
    if (!days[d] || Math.abs(h-12) < Math.abs(new Date(days[d].dt*1000).getHours()-12))
      days[d] = item;
  });
  grid.innerHTML = Object.entries(days).slice(0,5).map(([d,i], idx) => `
    <div class="day-card ${idx===0?'selected':''}">
      <div class="day-name">${d}</div>
      <div class="day-icon"><img src="https://openweathermap.org/img/wn/${i.weather[0].icon}@2x.png" alt=""/></div>
      <div class="day-temp">${Math.round(i.main.temp)}°</div>
      <div class="day-hi-lo"><span class="hi">▲${Math.round(i.main.temp_max)}°</span> <span class="lo">▼${Math.round(i.main.temp_min)}°</span></div>
      <div class="day-desc">${i.weather[0].description}</div>
    </div>`).join("");
}

function renderHourly(list) {
  const scroll = document.getElementById("hourlyScroll");
  if (!scroll) return;
  scroll.innerHTML = list.slice(0,24).map(item => {
    const t    = new Date(item.dt*1000);
    const time = t.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
    const pop  = Math.round((item.pop||0)*100);
    return `
      <div class="hour-item">
        <div class="hour-time">${time}</div>
        <div class="hour-icon"><img src="https://openweathermap.org/img/wn/${item.weather[0].icon}.png" alt=""/></div>
        <div class="hour-temp">${Math.round(item.main.temp)}°</div>
        ${pop > 0 ? `<div class="hour-pop">💧${pop}%</div>` : ""}
      </div>`;
  }).join("");
}

// ════════════════════════════════════════════
//  CITIES PAGE LOGIC
// ════════════════════════════════════════════
function initCities() {
  const grid = document.getElementById("citiesGrid");
  if (!grid) return;

  // Build city cards immediately (shows names while loading)
  grid.innerHTML = CITIES.map(c => `
    <div class="city-card" id="cc-${c.name}" onclick="goToCity('${c.name}')">
      <div class="city-top">
        <div>
          <div class="city-name">${c.name}</div>
          <div class="city-code">[${c.code}]</div>
        </div>
        <div id="ci-${c.name}" style="min-height:44px;display:flex;align-items:center;justify-content:center">
          <div class="loader-hex" style="width:28px;height:28px;margin:0"></div>
        </div>
      </div>
      <div class="city-temp-big" id="ct-${c.name}">--°</div>
      <div class="city-desc-small" id="cd-${c.name}">Loading...</div>
      <div class="city-stats-mini" id="cs-${c.name}">
        <span>💧 --%</span><span>💨 -- km/h</span>
      </div>
    </div>`).join("");

  // Fetch each city with stagger to avoid rate limits
  CITIES.forEach((c, i) => {
    setTimeout(() => fetchCityCard(c.name), i * 250);
  });
}

async function fetchCityCard(city) {
  try {
    const r = await fetch(`${BASE}/weather?q=${encodeURIComponent(city)},IN&units=metric&appid=${API_KEY}`);
    if (!r.ok) return;
    const d = await r.json();
    const iconEl = document.getElementById(`ci-${city}`);
    const tempEl = document.getElementById(`ct-${city}`);
    const descEl = document.getElementById(`cd-${city}`);
    const statEl = document.getElementById(`cs-${city}`);
    if (iconEl) iconEl.innerHTML = `<img src="https://openweathermap.org/img/wn/${d.weather[0].icon}@2x.png" style="width:44px;height:44px;filter:drop-shadow(0 0 8px var(--primary))"/>`;
    if (tempEl) tempEl.textContent = `${Math.round(d.main.temp)}°`;
    if (descEl) descEl.textContent = d.weather[0].description;
    if (statEl) statEl.innerHTML = `<span>💧 <span>${d.main.humidity}%</span></span><span>💨 <span>${(d.wind.speed*3.6).toFixed(0)} km/h</span></span>`;
  } catch { /* silent */ }
}

function goToCity(city) {
  // Navigate to forecast page with city pre-filled
  localStorage.setItem("nexus_city", city);
  window.location.href = "forecast.html";
}

// On forecast page, check if city was pre-selected from cities page
function checkCityPreload() {
  const city = localStorage.getItem("nexus_city");
  if (city) {
    localStorage.removeItem("nexus_city");
    const input = document.getElementById("searchInput");
    if (input) input.value = city;
    setTimeout(() => document.getElementById("searchBtn")?.click(), 500);
  }
}

// ════════════════════════════════════════════
//  ALERTS PAGE LOGIC
// ════════════════════════════════════════════
function initAlerts() {
  setupSearch(async (city) => {
    showLoader();
    try {
      const data   = await fetchWeather(city);
      const alerts = generateAlerts(data);
      renderAlertsFull(alerts, data);
      hideLoader();
      toast(`Alert analysis complete for ${data.name}.`, "ok");
    } catch (e) {
      hideLoader();
      toast(e.message, "err");
    }
  });
}

// ════════════════════════════════════════════
//  INIT — runs on every page
// ════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  startClock();
  if (PAGE === "home")     initHome();
  if (PAGE === "forecast") { initForecast(); checkCityPreload(); }
  if (PAGE === "cities")   initCities();
  if (PAGE === "alerts")   initAlerts();
});
