/* ZerozxStream — app.js (fixed)
   Perbaikan: `const history` diganti `watchHistory` supaya tidak menimpa window.history */

const API = "/api/movies";
const main = document.getElementById("main");
const nav = document.getElementById("nav");
const toastEl = document.getElementById("toast");
const toastMsg = document.getElementById("toastMsg");
const heroEl = document.getElementById("hero");

/* ---------- LocalStorage ---------- */
const DB = {
  FAV: "zerozx_favorites", HIST: "zerozx_history", SEARCH_HIST: "zerozx_search_history",
  get(k, fb){ try{ return JSON.parse(localStorage.getItem(k)) ?? fb; }catch{ return fb; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} },
};

const favorites = {
  list(){ return DB.get(DB.FAV, []); },
  has(slug){ return this.list().some(m => m.slug === slug); },
  toggle(movie){
    const list = this.list();
    const i = list.findIndex(m => m.slug === movie.slug);
    if(i >= 0){ list.splice(i, 1); DB.set(DB.FAV, list); updateBadges(); return false; }
    list.unshift({ ...movie, savedAt: Date.now() });
    DB.set(DB.FAV, list); updateBadges(); return true;
  },
};

const watchHistory = {
  list(){ return DB.get(DB.HIST, []); },
  add(movie){
    const list = this.list().filter(m => m.slug !== movie.slug);
    list.unshift({ ...movie, watchedAt: Date.now() });
    DB.set(DB.HIST, list.slice(0, 100)); updateBadges();
  },
  clear(){ DB.set(DB.HIST, []); updateBadges(); },
};

const searchHistory = {
  list(){ return DB.get(DB.SEARCH_HIST, []); },
  add(q){
    const list = this.list().filter(x => x.toLowerCase() !== q.toLowerCase());
    list.unshift(q); DB.set(DB.SEARCH_HIST, list.slice(0, 12));
  },
  remove(q){ DB.set(DB.SEARCH_HIST, this.list().filter(x => x !== q)); },
  clear(){ DB.set(DB.SEARCH_HIST, []); },
};

function setBadge(id, n){
  const el = document.getElementById(id);
  if(!el) return;
  if(n > 0){ el.textContent = n > 99 ? "99+" : n; el.classList.remove("hidden"); }
  else el.classList.add("hidden");
}
function updateBadges(){
  setBadge("favBadge", favorites.list().length);
  setBadge("histBadge", watchHistory.list().length);
}

/* ---------- Utils ---------- */
let toastTimer;
function toast(msg){
  toastMsg.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
}
function imgUrl(p){
  if(!p) return "";
  return p.startsWith("http") ? p : "https://image.tmdb.org/t/p/w500" + p;
}
function esc(s=""){
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
async function api(params){
  const res = await fetch(`${API}?${new URLSearchParams(params)}`);
  return res.json();
}

function normalize(item){
  const poster = item.poster || item.poster_path || item.image || item.cover || item.thumbnail || "";
  const backdrop = item.backdrop || item.backdrop_path || item.banner || poster;
  const title = item.title || item.name || item.original_title || item.original_name || "Tanpa Judul";
  const year = (item.release_date || item.first_air_date || item.year || "").toString().slice(0, 4) || "—";
  const rating = item.vote_average ?? item.rating ?? item.score ?? null;
  const overview = item.overview || item.description || item.synopsis || "Deskripsi belum tersedia untuk judul ini.";
  let genres = item.genres || item.genre_ids || (item.genre ? [item.genre] : []);
  if(!Array.isArray(genres)) genres = [genres];
  const slug = String(item.slug || item.id || item.tmdb_id || item.movie_id || "");
  let type = item.type || item.media_type || null;
  if(!type){
    if(item.first_air_date || item.original_name || item.name) type = "tv";
    else if(item.release_date || item.title) type = "film";
  }
  return { poster, backdrop, title, year, rating, overview, genres, slug, type, raw:item };
}

const skeletonGrid = (n=12) => `<div class="grid">${'<div class="skeleton"></div>'.repeat(n)}</div>`;
const skeletonRow = (n=7) => `<div class="row-scroll">${'<div class="skeleton"></div>'.repeat(n)}</div>`;

function goPlay(slug, type){
  if(!slug){ toast("ID film tidak ditemukan"); return; }
  const t = ["tv","series","show"].includes(type) ? "tv" : "film";
  window.location.href = `/play/${t}/${encodeURIComponent(slug)}`;
}

/* ---------- Card ---------- */
const HEART = `<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>`;
const PLAY = `<path d="M8 5v14l11-7z"/>`;

function cardHTML(m, i=0, rank=null){
  const rating = m.rating ? Number(m.rating).toFixed(1) : null;
  const genreNames = m.genres.map(g => typeof g === "string" ? g : g.name).filter(Boolean).slice(0, 3);
  const slug = esc(m.slug), title = esc(m.title), type = esc(m.type || "film");
  const isFav = favorites.has(m.slug);
  window[`c_${m.slug.replace(/[^a-z0-9]/gi, "_")}`] = m;

  return `
    <div class="card" style="animation-delay:${i*40}ms" onclick="goPlay('${slug}','${type}')">
      <div class="card-poster">
        ${m.poster ? `<img loading="lazy" src="${esc(imgUrl(m.poster))}" alt="${title}" onerror="this.style.display='none'">` : ""}
        ${rank !== null ? `<div class="card-rank">#${rank+1}</div>` : ""}
        ${rating ? `<div class="card-score">★ ${rating}</div>` : ""}
        <div class="card-actions">
          <button class="btn-mini ${isFav?'active':''}" onclick="event.stopPropagation();toggleFav('${slug}',this)" title="Favorit" aria-label="Favorit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${HEART}</svg>
          </button>
          <button class="btn-mini" onclick="event.stopPropagation();goPlay('${slug}','${type}')" title="Putar" aria-label="Putar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">${PLAY}</svg>
          </button>
        </div>
        <div class="card-overlay">
          <div class="card-play"><svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">${PLAY}</svg></div>
          ${genreNames.length ? `<div class="card-overlay-genres">${genreNames.map(g => `<span>${esc(g)}</span>`).join("")}</div>` : ""}
        </div>
      </div>
      <div class="card-info">
        <div class="card-title">${title}</div>
        <div class="card-sub"><span>${esc(m.year)}</span>${rating ? `<span class="star">★ ${rating}</span>` : ""}</div>
      </div>
    </div>`;
}

function emptyState(msg, sub="Coba lagi nanti atau ganti kategori."){
  return `<div class="state">
    <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16h.01"/></svg>
    <h3>${esc(msg)}</h3><p>${esc(sub)}</p></div>`;
}

function setActiveNav(name){
  document.querySelectorAll(".nav-links a").forEach(a => a.classList.toggle("active", a.dataset.nav === name));
}
function setActiveDock(tab){
  document.querySelectorAll(".dock-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
}

/* ---------- Tabs & routing ---------- */
let currentTab = "home";

function switchTab(tab){
  currentTab = tab;
  setActiveDock(tab);
  window.scrollTo({ top:0, behavior:"smooth" });
  if(tab === "home"){ goHome(); return; }
  setActiveNav("");
  heroEl.style.display = "none";
  if(tab === "search") renderSearchTab();
  else if(tab === "favorites") renderFavorites();
  else if(tab === "history") renderHistory();
  else if(tab === "profile") renderProfile();
}

const ROUTES = { home:"/home", search:"/search", favorites:"/favorites", history:"/history", profile:"/profile" };

function readRoute(){
  const path = location.pathname.replace(/\/+$/, "") || "/";
  for(const [tab, route] of Object.entries(ROUTES)) if(path === route) return tab;
  return "home";
}
function setRoute(tab, { replace=false } = {}){
  const target = ROUTES[tab] || ROUTES.home;
  if(location.pathname === target) return;
  if(replace) window.history.replaceState({ tab }, "", target);
  else window.history.pushState({ tab }, "", target);
}
function routeToTab(tab, { push=true } = {}){
  if(!ROUTES[tab]) tab = "home";
  switchTab(tab);
  setRoute(tab, { replace: !push });
}
window.addEventListener("popstate", () => switchTab(readRoute()));

/* ---------- Hero ---------- */
function setHero(m){
  heroEl.style.display = "flex";
  document.getElementById("heroBg").style.backgroundImage = `url('${imgUrl(m.backdrop)}')`;
  document.getElementById("heroTitle").textContent = m.title;
  document.getElementById("heroDesc").textContent = m.overview;
  document.getElementById("heroMeta").innerHTML =
    `${m.rating ? `<span class="score">★ ${Number(m.rating).toFixed(1)}</span>` : ""}
     <span class="pill">HD</span><span class="pill">${esc(m.year)}</span><span>ZerozxStream</span>`;
  document.getElementById("heroPlay").onclick = () => goPlay(m.slug, m.type || "film");
}

/* ---------- Home ---------- */
async function goHome(){
  currentTab = "home";
  setActiveDock("home"); setActiveNav("home");
  heroEl.style.display = "flex";
  window.scrollTo({ top:0, behavior:"smooth" });

  main.innerHTML = `
    <section class="section">
      <div class="section-head"><div class="section-title">Populer Saat Ini</div>
        <div class="tabs">
          <button class="tab active" onclick="switchType('popular',this,'all')">Semua</button>
          <button class="tab" onclick="switchType('popular',this,'movie')">Film</button>
          <button class="tab" onclick="switchType('popular',this,'tv')">Serial</button>
        </div></div>
      <div id="popular-wrap">${skeletonRow()}</div>
    </section>
    <section class="section"><div class="section-head"><div class="section-title">Segera Tayang</div></div>
      <div id="upcoming-wrap">${skeletonRow()}</div></section>
    <section class="section"><div class="section-head"><div class="section-title">Terbaru</div></div>
      <div id="latest-wrap">${skeletonRow()}</div></section>
    <section class="section">
      <div class="section-head"><div class="section-title">Top Rated</div>
        <div class="tabs">
          <button class="tab active" onclick="switchTopRated(this,'movie')">Film</button>
          <button class="tab" onclick="switchTopRated(this,'tv')">Serial</button>
        </div></div>
      <div id="toprated-wrap">${skeletonRow()}</div>
    </section>`;

  const popular = fillRow("popular-wrap", { action:"popular", type:"all", page:1 });
  await Promise.all([
    popular,
    fillRow("upcoming-wrap", { action:"upcoming", page:1 }),
    fillRow("latest-wrap", { action:"latest", type:"all" }),
    fillRow("toprated-wrap", { action:"top-rated", type:"movie", page:1 }, true),
  ]);
}

async function fillRow(wrapId, params, ranked=false){
  const wrap = document.getElementById(wrapId);
  if(!wrap) return;
  try{
    const res = await api(params);
    const list = (res.results || []).map(normalize);
    if(!list.length){ wrap.innerHTML = emptyState("Belum ada data"); return; }
    wrap.innerHTML = `<div class="row-scroll">${list.map((m,i) => cardHTML(m, i, ranked ? i : null)).join("")}</div>`;
    if(wrapId === "popular-wrap" && params.type === "all"){
      const h = list.find(x => x.backdrop);
      if(h) setHero(h);
    }
  }catch{
    wrap.innerHTML = emptyState("Gagal memuat data");
  }
}

/* ---------- Section pages ---------- */
async function loadSection(action){
  currentTab = "section";
  setActiveDock(""); setActiveNav(action);
  heroEl.style.display = "none";
  window.scrollTo({ top:0, behavior:"smooth" });
  const titles = { popular:"Film & Serial Populer", upcoming:"Segera Tayang", latest:"Rilisan Terbaru", "top-rated":"Rating Tertinggi" };
  const hasTabs = action === "popular" || action === "top-rated";

  main.innerHTML = `
    <section class="section" style="padding-top:100px">
      <div class="section-head"><div class="section-title">${titles[action] || "Jelajahi"}</div>
        ${hasTabs ? `<div class="tabs">
          <button class="tab active" onclick="switchType('${action}',this,'${action==="top-rated"?"movie":"all"}')">${action==="top-rated"?"Film":"Semua"}</button>
          ${action==="popular" ? `<button class="tab" onclick="switchType('${action}',this,'movie')">Film</button>` : ""}
          <button class="tab" onclick="switchType('${action}',this,'tv')">Serial</button>
        </div>` : ""}
      </div>
      <div id="section-grid">${skeletonGrid(12)}</div>
    </section>`;
  await loadSectionGrid(action, action === "top-rated" ? "movie" : "all");
}

async function loadSectionGrid(action, type="all"){
  const wrap = document.getElementById("section-grid");
  if(!wrap) return;
  wrap.innerHTML = skeletonGrid(12);
  try{
    const params = { action };
    if(action === "popular" || action === "top-rated"){ params.type = type; params.page = 1; }
    else if(action === "upcoming") params.page = 1;
    else if(action === "latest") params.type = type;
    const res = await api(params);
    const list = (res.results || []).map(normalize);
    if(!list.length){ wrap.innerHTML = emptyState("Belum ada data"); return; }
    wrap.innerHTML = `<div class="grid">${list.map((m,i) => cardHTML(m, i, action === "top-rated" ? i : null)).join("")}</div>`;
  }catch{
    wrap.innerHTML = emptyState("Gagal memuat data");
  }
}

function switchType(action, el, type){
  el.parentElement.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");
  if(currentTab === "home" && action === "popular") fillRow("popular-wrap", { action, type, page:1 });
  else loadSectionGrid(action, type);
}
function switchTopRated(el, type){
  el.parentElement.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");
  fillRow("toprated-wrap", { action:"top-rated", type, page:1 }, true);
}

/* ---------- Search ---------- */
const POPULAR_KEYWORDS = ["Avatar","Oppenheimer","Dune","Barbie","John Wick","Spiderman","Batman","Interstellar","Inception","Naruto"];
const X_ICON = `<path d="M18 6 6 18M6 6l12 12"/>`;
const SEARCH_ICON = `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>`;

function renderSearchTab(initialQuery=""){
  const sh = searchHistory.list();
  main.innerHTML = `
    <div class="search-hero">
      <h1>Cari <span class="red">Film & Serial</span></h1>
      <p class="sub">Temukan ribuan judul dari seluruh dunia</p>
      <div class="big-search ${initialQuery?'has-value':''}" id="bigSearchWrap">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">${SEARCH_ICON}</svg>
        <input id="bigSearchInput" type="text" placeholder="Ketik judul film atau serial..." value="${esc(initialQuery)}" autocomplete="off">
        <button class="btn-clear" onclick="clearBigSearch()" aria-label="Bersihkan"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">${X_ICON}</svg></button>
        <button class="btn-search" onclick="submitBigSearch()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">${SEARCH_ICON}</svg><span class="txt">Cari</span></button>
      </div>
      ${sh.length ? `
        <div class="chips-wrap">
          <div class="chips-title">Riwayat Pencarian</div>
          <div class="chips">
            ${sh.map(q => `<span class="chip" onclick="submitBigSearch('${esc(q)}')">${esc(q)}
              <svg class="rm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" onclick="event.stopPropagation();removeSearchHistory('${esc(q)}')">${X_ICON}</svg></span>`).join("")}
            <span class="chip chip-clear" onclick="clearSearchHistory()">Hapus semua</span>
          </div>
        </div>` : ""}
      <div class="chips-wrap">
        <div class="chips-title">Pencarian Populer</div>
        <div class="chips">${POPULAR_KEYWORDS.map(k => `<span class="chip" onclick="submitBigSearch('${esc(k)}')">${esc(k)}</span>`).join("")}</div>
      </div>
    </div>
    <section class="search-section" id="searchResultSection">
      <div class="search-section-title">Trending Sekarang</div>
      <div id="trendingGrid">${skeletonGrid(10)}</div>
    </section>`;

  const input = document.getElementById("bigSearchInput");
  input.addEventListener("input", () => document.getElementById("bigSearchWrap").classList.toggle("has-value", !!input.value));
  input.addEventListener("keydown", e => { if(e.key === "Enter") submitBigSearch(); });
  if(!initialQuery) setTimeout(() => input.focus(), 150);
  if(initialQuery) doSearchFromTab(initialQuery); else loadTrending();
}

async function loadTrending(){
  const wrap = document.getElementById("trendingGrid");
  if(!wrap) return;
  try{
    const res = await api({ action:"popular", type:"all", page:1 });
    const list = (res.results || []).map(normalize).slice(0, 20);
    wrap.innerHTML = list.length ? `<div class="grid">${list.map((m,i) => cardHTML(m, i)).join("")}</div>` : emptyState("Belum ada data trending");
  }catch{
    wrap.innerHTML = emptyState("Gagal memuat trending");
  }
}

function clearBigSearch(){ renderSearchTab(); }

function submitBigSearch(forceQuery){
  const q = (forceQuery !== undefined ? forceQuery : document.getElementById("bigSearchInput").value).trim();
  if(!q){ toast("Masukkan kata kunci"); return; }
  searchHistory.add(q);
  doSearchFromTab(q);
}

async function doSearchFromTab(q){
  const input = document.getElementById("bigSearchInput");
  if(input){ input.value = q; document.getElementById("bigSearchWrap").classList.add("has-value"); }
  const section = document.getElementById("searchResultSection");
  if(!section){ renderSearchTab(q); return; }
  section.innerHTML = `<div class="search-section-title">Hasil untuk "${esc(q)}"</div><div id="searchResultGrid">${skeletonGrid(12)}</div>`;
  const wrap = document.getElementById("searchResultGrid");
  try{
    const res = await api({ action:"search", q, page:1 });
    const list = (res.results || []).map(normalize);
    wrap.innerHTML = list.length
      ? `<div class="grid">${list.map((m,i) => cardHTML(m, i)).join("")}</div>`
      : emptyState("Tidak ditemukan", `Tidak ada hasil untuk "${q}". Coba kata kunci lain.`);
  }catch{
    wrap.innerHTML = emptyState("Gagal mencari", "Periksa koneksi dan coba lagi.");
  }
}

function removeSearchHistory(q){
  searchHistory.remove(q);
  renderSearchTab(document.getElementById("bigSearchInput")?.value || "");
}
function clearSearchHistory(){
  searchHistory.clear(); toast("Riwayat pencarian dihapus"); renderSearchTab();
}

/* ---------- Favorites ---------- */
function renderFavorites(){
  const list = favorites.list();
  main.innerHTML = `
    <div class="tab-hero"><h1>Daftar <span class="red">Favorit</span></h1>
      <p>${list.length ? "Film dan serial pilihanmu yang tersimpan." : "Simpan film dan serial favoritmu supaya gampang ditemukan lagi nanti."}</p>
      ${list.length ? `<div class="count"><span class="red">❤</span> ${list.length} judul tersimpan</div>` : ""}</div>
    <section class="section" style="padding-top:20px">
      ${list.length ? `<div class="grid">${list.map((m,i) => cardHTML(m, i)).join("")}</div>`
        : emptyState("Belum ada favorit", "Tap ikon ❤ pada kartu film untuk menyimpannya di sini.")}
    </section>`;
}

/* ---------- History ---------- */
function renderHistory(){
  const list = watchHistory.list();
  main.innerHTML = `
    <div class="tab-hero"><h1>Riwayat <span class="red">Tontonan</span></h1>
      <p>${list.length ? "Lanjutkan dari yang terakhir kamu buka." : "Semua film yang pernah kamu buka atau putar akan muncul di sini."}</p>
      ${list.length ? `<div class="count"><span class="red">${list.length}</span> judul dalam riwayat</div>` : ""}</div>
    <section class="section" style="padding-top:20px">
      ${list.length ? `
        <div class="section-head" style="justify-content:flex-end">
          <button class="btn btn-ghost" style="padding:10px 20px;font-size:13px" onclick="clearHistory()">Hapus Semua</button>
        </div>
        <div class="grid">${list.map((m,i) => cardHTML(m, i)).join("")}</div>`
        : emptyState("Riwayat masih kosong", "Mulai tonton film untuk mengisi riwayat.")}
    </section>`;
}
function clearHistory(){
  if(!confirm("Hapus semua riwayat tontonan?")) return;
  watchHistory.clear(); toast("Riwayat dihapus"); renderHistory();
}

/* ---------- Profile ---------- */
function renderProfile(){
  const stat = (label, n) => `<div style="background:var(--bg-2);border:1px solid var(--border);border-radius:16px;padding:20px;text-align:center">
    <div style="font-size:12px;color:var(--muted);font-weight:700;margin-bottom:8px">${label}</div>
    <div style="font-family:var(--display);font-size:32px;font-weight:800;color:var(--red-2)">${n}</div></div>`;
  const link = (label, act, last=false) => `<button onclick="${act}" style="width:100%;padding:18px 22px;display:flex;align-items:center;${last?"":"border-bottom:1px solid var(--border);"}">
    <span style="flex:1;text-align:left;font-weight:600">${label}</span><span style="color:var(--muted)">›</span></button>`;

  main.innerHTML = `
    <div class="tab-hero"><h1>Halo, <span class="red">Penonton</span></h1><p>Profil ZerozxStream kamu.</p></div>
    <section class="section" style="padding-top:20px;max-width:720px;margin:0 auto">
      <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:20px;padding:28px;margin-bottom:20px;display:flex;align-items:center;gap:20px">
        <div style="width:78px;height:78px;border-radius:22px;background:linear-gradient(135deg,var(--red),#7a0410);display:grid;place-items:center;font-family:var(--display);font-weight:800;font-size:34px;box-shadow:0 10px 30px var(--red-glow)">Z</div>
        <div><h2 style="font-family:var(--display);font-size:22px">Penonton Zerozx</h2>
          <p style="color:var(--muted);font-size:14px">Member sejak ${new Date().toLocaleDateString('id-ID',{month:'long',year:'numeric'})}</p></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
        ${stat("Favorit", favorites.list().length)}${stat("Riwayat", watchHistory.list().length)}${stat("Pencarian", searchHistory.list().length)}
      </div>
      <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:16px;overflow:hidden">
        ${link("Nonton Anime", "window.location.href='/anime'")}${link("Cari Film", "routeToTab('search')")}
        ${link("Buka Favorit", "routeToTab('favorites')")}${link("Buka Riwayat", "routeToTab('history')", true)}
      </div>
      <p style="text-align:center;color:var(--muted);font-size:12px;margin-top:30px">ZerozxStream v2.0 — Beta · by @Zerozx</p>
    </section>`;
}

/* ---------- Favorite toggle ---------- */
function toggleFav(slug, btnEl){
  const movie = window[`c_${slug.replace(/[^a-z0-9]/gi, "_")}`] || { slug, title:slug };
  const added = favorites.toggle(movie);
  if(btnEl){
    btnEl.classList.toggle("active", added);
    btnEl.querySelector("svg")?.setAttribute("fill", added ? "currentColor" : "none");
  }
  toast(added ? "Ditambahkan ke favorit ❤" : "Dihapus dari favorit");
  if(currentTab === "favorites") renderFavorites();
}

/* ---------- Modal detail (cadangan) ---------- */
function closeModal(){ document.getElementById("modal").classList.remove("open"); }

/* ---------- Scroll & init ---------- */
window.addEventListener("scroll", () => nav.classList.toggle("scrolled", window.scrollY > 30));

updateBadges();
routeToTab(readRoute(), { push:false });
