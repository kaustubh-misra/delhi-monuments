// ============================================================
// Delhi Monuments — Layers of Empires
// ============================================================

const ERAS = [
  { id: 'ancient',   name: 'Ancient & Rajput', hue: 36,  kingdoms: ['Gupta Empire', 'Maurya Empire', 'Tomar Rajput', 'Tomar Chahamana'] },
  { id: 'sultanate', name: 'Delhi Sultanate',  hue: 212, kingdoms: ['Mamluk Sultanate', 'Khalji Dynasty', 'Tughlaq Dynasty', 'Sayyid Dynasty', 'Lodi Dynasty'] },
  { id: 'mughal',    name: 'Mughal Era',       hue: 142, kingdoms: ['Mughal Suri', 'Suri Dynasty', 'Suri Mughal', 'Mughal Dynasty', 'Lodi Early Mughal', 'Early Mughal', 'Late Mughal', 'Lodi Mughal'] },
  { id: 'colonial',  name: 'British Colonial', hue: 2,   kingdoms: ['British Colonial'] }
];

const DEFAULT_ERA_ID = 'ancient';

const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const escAttr = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function kingdomColor(era, idxInEra, totalInEra) {
  const spread = Math.max(totalInEra - 1, 1);
  const light = 42 + (idxInEra / spread) * 22;
  return `hsl(${era.hue}, 68%, ${light}%)`;
}

function parseEraYears(str) {
  if (!str || str === 'N/A') return null;
  const isBCE = /BCE/i.test(str);
  const centRange = str.match(/(\d+)(?:st|nd|rd|th)[\s–\-]+(\d+)(?:st|nd|rd|th)/i);
  if (centRange) return { start: (parseInt(centRange[1]) - 1) * 100, end: parseInt(centRange[2]) * 100 - 1 };
  const cent = str.match(/(\d+)(?:st|nd|rd|th)\s*Century/i);
  if (cent) { const base = (parseInt(cent[1]) - 1) * 100; return { start: base, end: base + 99 }; }
  const nums = str.match(/\d{3,4}/g);
  if (!nums) return null;
  let start = parseInt(nums[0]);
  let end = nums.length > 1 ? parseInt(nums[1]) : start;
  if (isBCE) { start = -start; end = -end; }
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function formatYear(y) { return y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`; }
function shortYearLabel(range) {
  if (!range) return '';
  const y = range.start;
  return y < 0 ? `${Math.abs(y)} BC` : `${y}`;
}

function formatRange(range) {
  if (!range) return '';
  if (range.start === range.end) return `c. ${formatYear(range.start)}`;
  const sameEra = (range.start < 0) === (range.end < 0);
  if (sameEra) {
    const suffix = range.start < 0 ? ' BCE' : ' CE';
    return `c. ${Math.abs(range.start)}–${Math.abs(range.end)}${suffix}`;
  }
  return `${formatYear(range.start)} – ${formatYear(range.end)}`;
}

// ---------- Map ----------
const map = L.map('map', { zoomControl: true }).setView([28.6139, 77.209], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// ---------- State ----------
const kingdomMeta = {};
const allMonumentsList = [];
const wikiCache = {};
let fuseEngine = null;
let searchActiveIdx = -1;

// ---------- Icons ----------
function createTeardropIcon(color, kingdomName) {
  const slug = slugify(kingdomName);
  const html = `
    <div class="teardrop-wrapper">
      <svg width="30" height="40" viewBox="0 0 30 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0C6.72 0 0 6.72 0 15C0 26.25 15 40 15 40S30 26.25 30 15C30 6.72 23.28 0 15 0Z" fill="${color}"/>
        <circle cx="15" cy="15" r="10" fill="#ffffff"/>
      </svg>
      <div class="emblem-img" style="background-image:url('emblems/${slug}.png')"></div>
    </div>`;
  return L.divIcon({
    className: 'custom-teardrop-marker',
    html,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -36]
  });
}

// ---------- Wikipedia image (with session cache) ----------
function wikiCacheGet(title) {
  if (title in wikiCache) return wikiCache[title];
  try {
    const v = sessionStorage.getItem('wiki:' + title);
    if (v !== null) { wikiCache[title] = v === 'NONE' ? null : v; return wikiCache[title]; }
  } catch {}
  return undefined;
}
function wikiCacheSet(title, url) {
  wikiCache[title] = url;
  try { sessionStorage.setItem('wiki:' + title, url || 'NONE'); } catch {}
}
async function fetchWikipediaImage(title) {
  const cached = wikiCacheGet(title);
  if (cached !== undefined) return cached;
  try {
    const clean = title.split('(')[0].trim();
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(clean)}`);
    if (res.ok) {
      const data = await res.json();
      const url = data.thumbnail?.source || null;
      wikiCacheSet(title, url);
      return url;
    }
  } catch {}
  wikiCacheSet(title, null);
  return null;
}

// ---------- Info card ----------
async function openInfoCard(monument) {
  const meta = kingdomMeta[monument.kingdom];
  const card = document.getElementById('info-card');
  const heroImg = document.getElementById('card-hero-img');
  const loader = document.getElementById('card-loader');

  document.getElementById('card-title').textContent = monument.name;
  const kBadge = document.getElementById('card-kingdom-badge');
  kBadge.textContent = monument.kingdom;
  kBadge.style.background = meta.color;
  document.getElementById('card-era-badge').textContent = monument.era !== 'N/A' ? monument.era : 'Historical Period';
  document.getElementById('card-desc').textContent = monument.description;

  const lat = Number(monument.lat);
  const lng = Number(monument.lng);
  document.getElementById('card-directions-btn').href =
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  heroImg.removeAttribute('src');
  heroImg.style.display = 'none';
  loader.style.display = 'flex';
  loader.textContent = 'Searching photo...';
  card.classList.add('active');
  document.body.classList.add('card-open');

  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.add('collapsed');
  }
  map.flyTo([lat, lng], 15, { duration: 1 });
  updateUrl({ m: monument.slug });

  const url = await fetchWikipediaImage(monument.name);
  if (url) {
    heroImg.onload = () => { heroImg.style.display = 'block'; loader.style.display = 'none'; };
    heroImg.onerror = () => { loader.textContent = '🏛️ Delhi Heritage Monument'; };
    heroImg.src = url;
  } else {
    loader.textContent = '🏛️ Delhi Heritage Monument';
  }
}
function closeInfoCard() {
  document.getElementById('info-card').classList.remove('active');
  document.body.classList.remove('card-open');
  updateUrl({ m: null });
}

// ---------- URL state ----------
function readUrl() {
  const p = new URLSearchParams(location.search);
  return {
    k: p.get('k') ? p.get('k').split(',').filter(Boolean) : null,
    m: p.get('m')
  };
}
function updateUrl(patch) {
  const p = new URLSearchParams(location.search);
  if ('m' in patch) { patch.m ? p.set('m', patch.m) : p.delete('m'); }
  if ('k' in patch) {
    if (patch.k && patch.k.length) p.set('k', patch.k.join(','));
    else p.delete('k');
  }
  const q = p.toString();
  history.replaceState(null, '', q ? `?${q}` : location.pathname);
}
function syncUrlKingdoms() {
  const total = Object.keys(kingdomMeta).length;
  const slugs = Object.values(kingdomMeta).filter(m => m.visible).map(m => m.slug);
  updateUrl({ k: (slugs.length === total || slugs.length === 0) ? null : slugs });
}

// ---------- Visibility ----------
function setKingdomVisible(kingdom, show, opts = {}) {
  const meta = kingdomMeta[kingdom];
  if (!meta || meta.visible === show) return;
  meta.visible = show;
  if (show) map.addLayer(meta.layer); else map.removeLayer(meta.layer);
  if (meta.checkbox) meta.checkbox.checked = show;
  if (meta.pill) meta.pill.classList.toggle('active', show);
  syncEraCheckbox(meta.era.id);
  if (!opts.silent) { syncUrlKingdoms(); updateVisibleCount(); }
}
function syncEraCheckbox(eraId) {
  const era = ERAS.find(e => e.id === eraId);
  const members = era.kingdoms.filter(k => kingdomMeta[k]);
  const allOn = members.every(k => kingdomMeta[k].visible);
  const someOn = members.some(k => kingdomMeta[k].visible);
  const cb = document.querySelector(`.era-section[data-era="${eraId}"] .era-check`);
  if (cb) { cb.checked = allOn; cb.indeterminate = someOn && !allOn; }
}
function updateVisibleCount() {
  const n = Object.values(kingdomMeta).filter(m => m.visible).reduce((a, m) => a + m.monuments.length, 0);
  const badge = document.getElementById('toggle-count');
  if (!badge) return;
  badge.textContent = n;
  badge.style.display = n > 0 ? 'flex' : 'none';
}
function zoomToKingdom(kingdom) {
  const meta = kingdomMeta[kingdom];
  if (!meta) return;
  const bounds = L.latLngBounds(meta.monuments.map(m => [m.lat, m.lng]));
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
}

// ---------- UI construction ----------
function buildUI(kingdomOrder) {
  const layerListEl = document.getElementById('layer-list');
  const timelineEl = document.getElementById('timeline');

  ERAS.forEach(era => {
    const eraKingdoms = kingdomOrder.filter(k => era.kingdoms.includes(k));
    if (!eraKingdoms.length) return;

    const section = document.createElement('div');
    section.className = 'era-section';
    section.dataset.era = era.id;
    section.innerHTML = `
      <div class="era-header">
        <button class="era-toggle" aria-expanded="true" aria-label="Collapse era">
          <svg class="era-caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <span class="era-dot" style="background:hsl(${era.hue}, 68%, 55%)"></span>
        <span class="era-name">${era.name}</span>
        <span class="era-count">${eraKingdoms.length}</span>
        <input type="checkbox" class="era-check" title="Toggle all in era"/>
      </div>
      <div class="era-body"></div>`;
    layerListEl.appendChild(section);

    section.querySelector('.era-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      const collapsed = section.classList.toggle('collapsed');
      e.currentTarget.setAttribute('aria-expanded', !collapsed);
    });
    section.querySelector('.era-check').addEventListener('click', (e) => {
      e.stopPropagation();
      const show = e.target.checked;
      eraKingdoms.forEach(k => setKingdomVisible(k, show, { silent: true }));
      syncUrlKingdoms(); updateVisibleCount();
    });

    const body = section.querySelector('.era-body');
    eraKingdoms.forEach(kingdom => {
      const meta = kingdomMeta[kingdom];
      const row = document.createElement('div');
      row.className = 'layer-item';
      const kEsc = escAttr(kingdom);
      row.innerHTML = `
        <input type="checkbox" ${meta.visible ? 'checked' : ''} aria-label="Toggle ${kEsc}"/>
        <span class="color-badge" style="background:${meta.color}"></span>
        <div class="kingdom-info">
          <span class="kingdom-name"></span>
          <span class="kingdom-meta"></span>
        </div>
        <button class="zoom-btn" title="Zoom to ${kEsc}" aria-label="Zoom to ${kEsc}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>`;
      row.querySelector('.kingdom-name').textContent = kingdom;
      const monCount = meta.monuments.length;
      row.querySelector('.kingdom-meta').textContent =
        `${monCount} ${monCount === 1 ? 'monument' : 'monuments'}` +
        (meta.rangeLabel ? ' · ' + meta.rangeLabel : '');

      const cb = row.querySelector('input');
      const zoomBtn = row.querySelector('.zoom-btn');
      cb.addEventListener('change', (e) => setKingdomVisible(kingdom, e.target.checked));
      zoomBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        setKingdomVisible(kingdom, true);
        zoomToKingdom(kingdom);
      });
      meta.checkbox = cb;
      body.appendChild(row);

      // Timeline pill
      const pill = document.createElement('button');
      pill.className = 'tl-pill' + (meta.visible ? ' active' : '');
      pill.innerHTML = `
        <span class="tl-dot" style="background:${meta.color}"></span>
        <span class="tl-name"></span>
        ${meta.shortYear ? `<span class="tl-year"></span>` : ''}
      `;
      pill.querySelector('.tl-name').textContent = kingdom;
      if (meta.shortYear) pill.querySelector('.tl-year').textContent = meta.shortYear;
      pill.title = kingdom + (meta.rangeLabel ? ' · ' + meta.rangeLabel : '');
      pill.addEventListener('click', () => {
        const willShow = !meta.visible;
        setKingdomVisible(kingdom, willShow);
        if (willShow) zoomToKingdom(kingdom);
      });
      meta.pill = pill;
      timelineEl.appendChild(pill);
    });

    syncEraCheckbox(era.id);
  });
}

// ---------- Boot ----------
fetch('monuments.json')
  .then(r => r.json())
  .then(data => {
    const kingdomOrder = [];
    data.forEach(m => { if (!kingdomOrder.includes(m.kingdom)) kingdomOrder.push(m.kingdom); });

    kingdomOrder.forEach(kingdom => {
      const era = ERAS.find(e => e.kingdoms.includes(kingdom)) || ERAS[ERAS.length - 1];
      const eraKs = kingdomOrder.filter(k => era.kingdoms.includes(k));
      const idxInEra = eraKs.indexOf(kingdom);
      const color = kingdomColor(era, idxInEra, eraKs.length);
      const monuments = data.filter(m => m.kingdom === kingdom);
      const ranges = monuments.map(m => parseEraYears(m.era)).filter(Boolean);
      const range = ranges.length ? {
        start: Math.min(...ranges.map(r => r.start)),
        end:   Math.max(...ranges.map(r => r.end))
      } : null;
      kingdomMeta[kingdom] = {
        era, color, slug: slugify(kingdom),
        monuments, range,
        rangeLabel: formatRange(range),
        shortYear: shortYearLabel(range),
        layer: null, visible: false, checkbox: null, pill: null
      };
    });

    kingdomOrder.forEach(kingdom => {
      const meta = kingdomMeta[kingdom];
      const layer = L.layerGroup();
      const icon = createTeardropIcon(meta.color, kingdom);
      meta.monuments.forEach(m => {
        const slug = slugify(m.name);
        const marker = L.marker([m.lat, m.lng], { icon });
        const enriched = { ...m, slug, marker };
        marker.on('click', () => openInfoCard(enriched));
        layer.addLayer(marker);
        allMonumentsList.push(enriched);
      });
      meta.layer = layer;
    });

    const urlState = readUrl();
    const defaultSlugs = ERAS.find(e => e.id === DEFAULT_ERA_ID).kingdoms.map(slugify);
    const targetSlugs = urlState.k || defaultSlugs;
    kingdomOrder.forEach(k => {
      kingdomMeta[k].visible = targetSlugs.includes(kingdomMeta[k].slug);
    });

    buildUI(kingdomOrder);

    kingdomOrder.forEach(k => {
      const meta = kingdomMeta[k];
      if (meta.visible) map.addLayer(meta.layer);
    });
    updateVisibleCount();

    fuseEngine = new Fuse(allMonumentsList, {
      keys: ['name', 'kingdom', 'description'],
      threshold: 0.4,
      distance: 100
    });

    if (urlState.m) {
      const target = allMonumentsList.find(m => m.slug === urlState.m);
      if (target) { setKingdomVisible(target.kingdom, true); openInfoCard(target); }
    }

    maybeShowOnboarding();
  })
  .catch(err => console.error('Error loading monuments.json:', err));

// ---------- Search ----------
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

function renderSearch(results) {
  searchActiveIdx = -1;
  if (!results.length) {
    searchResults.innerHTML = `<div class="search-result-item empty">No monuments found</div>`;
    searchResults.style.display = 'block';
    return;
  }
  searchResults.innerHTML = '';
  results.forEach((res, i) => {
    const row = document.createElement('div');
    row.className = 'search-result-item';
    row.dataset.idx = i;
    row.dataset.slug = res.item.slug;
    row.innerHTML = `<div class="search-result-title"></div><div class="search-result-sub"></div>`;
    row.querySelector('.search-result-title').textContent = res.item.name;
    row.querySelector('.search-result-sub').textContent = res.item.kingdom;
    row.addEventListener('click', () => selectMonumentBySlug(res.item.slug));
    row.addEventListener('mouseenter', () => setSearchActive(i));
    searchResults.appendChild(row);
  });
  searchResults.style.display = 'block';
}
function setSearchActive(i) {
  const items = searchResults.querySelectorAll('.search-result-item:not(.empty)');
  items.forEach(el => el.classList.remove('active'));
  if (i >= 0 && items[i]) {
    items[i].classList.add('active');
    items[i].scrollIntoView({ block: 'nearest' });
  }
  searchActiveIdx = i;
}
searchInput.addEventListener('input', (e) => {
  const q = e.target.value.trim();
  if (!q || !fuseEngine) { searchResults.style.display = 'none'; return; }
  renderSearch(fuseEngine.search(q).slice(0, 6));
});
searchInput.addEventListener('keydown', (e) => {
  const items = searchResults.querySelectorAll('.search-result-item:not(.empty)');
  if (e.key === 'Escape') { searchResults.style.display = 'none'; searchInput.blur(); return; }
  if (!items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); setSearchActive(Math.min(items.length - 1, searchActiveIdx + 1)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setSearchActive(Math.max(0, searchActiveIdx - 1)); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    const idx = searchActiveIdx >= 0 ? searchActiveIdx : 0;
    const slug = items[idx]?.dataset.slug;
    if (slug) selectMonumentBySlug(slug);
  }
});
function selectMonumentBySlug(slug) {
  const item = allMonumentsList.find(m => m.slug === slug);
  if (!item) return;
  setKingdomVisible(item.kingdom, true);
  openInfoCard(item);
  searchResults.style.display = 'none';
  searchInput.value = '';
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box-container')) searchResults.style.display = 'none';
});

// ---------- Sidebar + bulk toggle ----------
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
  setTimeout(() => map.invalidateSize(), 360);
}
function toggleAllLayers(show) {
  Object.keys(kingdomMeta).forEach(k => setKingdomVisible(k, show, { silent: true }));
  ERAS.forEach(e => syncEraCheckbox(e.id));
  syncUrlKingdoms(); updateVisibleCount();
}
document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebar);
document.getElementById('btn-all').addEventListener('click', () => toggleAllLayers(true));
document.getElementById('btn-reset').addEventListener('click', () => toggleAllLayers(false));
document.getElementById('card-close').addEventListener('click', closeInfoCard);

// ---------- Onboarding toast ----------
function maybeShowOnboarding() {
  try { if (localStorage.getItem('dm-onboarded')) return; } catch {}
  const toast = document.getElementById('onboard-toast');
  if (!toast) return;
  toast.classList.add('visible');
  const dismiss = () => {
    toast.classList.remove('visible');
    try { localStorage.setItem('dm-onboarded', '1'); } catch {}
  };
  toast.querySelector('.onboard-close')?.addEventListener('click', dismiss);
  setTimeout(dismiss, 9000);
}
