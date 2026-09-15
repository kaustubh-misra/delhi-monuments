const map = L.map('map').setView([28.6139, 77.2090], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const kingdomLayers = {};
const allMonumentsList = [];
let fuseEngine = null;

const colors = [
  '#ff3b30', '#0a84ff', '#30d158', '#ffd60a', '#bf5af2', '#64d2ff', 
  '#ff375f', '#ac8e68', '#ff9f0a', '#5e5ce6', '#32ade6', '#ff453a', 
  '#e5c07b', '#98c379', '#56b6c2', '#c678dd', '#d19a66', '#e06c75'
];

function createTeardropIcon(color, kingdomName) {
  const slug = kingdomName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const emblemPath = `emblems/${slug}.png`;

  const svgPin = `
    <svg width="30" height="40" viewBox="0 0 30 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.71573 0 0 6.71573 0 15C0 26.25 15 40 15 40C15 40 30 26.25 30 15C30 6.71573 23.2843 0 15 0Z" fill="${color}"/>
      <circle cx="15" cy="15" r="10" fill="#ffffff"/>
    </svg>
  `;

  const html = `
    <div class="teardrop-wrapper">
      ${svgPin}
      <img src="${emblemPath}" class="emblem-img" 
           style="position:absolute; top:6px; left:6px; width:18px; height:18px; border-radius:50%; object-fit:cover;" 
           onerror="this.remove()" />
    </div>
  `;

  return L.divIcon({
    className: 'custom-teardrop-marker',
    html: html,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -36]
  });
}

// Fetch monument lead image from Wikipedia REST API dynamically
async function fetchWikipediaImage(title) {
  try {
    const cleanTitle = title.split('(')[0].trim();
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTitle)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.thumbnail && data.thumbnail.source) {
        return data.thumbnail.source;
      }
    }
  } catch (e) {
    console.log("No wiki image found for:", title);
  }
  return null;
}

// Open Google Maps Info Card on click
async function openInfoCard(monument, kingdomColor) {
  const card = document.getElementById('info-card');
  const hero = document.getElementById('card-hero');
  const loader = document.getElementById('card-loader');

  document.getElementById('card-title').textContent = monument.name;
  document.getElementById('card-kingdom-badge').textContent = monument.kingdom;
  document.getElementById('card-kingdom-badge').style.background = kingdomColor;
  document.getElementById('card-era-badge').textContent = monument.era !== 'N/A' ? monument.era : 'Historical Period';
  document.getElementById('card-desc').textContent = monument.description;
  
  // Google Maps directions link
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${monument.lat},${monument.lng}`;
  document.getElementById('card-directions-btn').href = gmapsUrl;

  // Reset image state
  hero.style.backgroundImage = 'none';
  loader.style.display = 'flex';
  loader.textContent = 'Searching photo...';

  card.classList.add('active');

  // Center map smoothly on monument
  map.flyTo([monument.lat, monument.lng], 15, { duration: 1 });

  // Load Wikipedia image asynchronously
  const imgUrl = await fetchWikipediaImage(monument.name);
  if (imgUrl) {
    hero.style.backgroundImage = `url('${imgUrl}')`;
    loader.style.display = 'none';
  } else {
    loader.textContent = '🏛️ Delhi Heritage Monument';
  }
}

function closeInfoCard() {
  document.getElementById('info-card').classList.remove('active');
}

fetch('monuments.json')
  .then(res => res.json())
  .then(data => {
    const kingdoms = [];
    data.forEach(m => {
      if (!kingdoms.includes(m.kingdom)) kingdoms.push(m.kingdom);
    });

    const layerListEl = document.getElementById('layer-list');

    kingdoms.forEach((kingdom, idx) => {
      const color = colors[idx % colors.length];
      const layerGroup = L.layerGroup();
      const kingdomMonuments = data.filter(m => m.kingdom === kingdom);
      
      const dateExtent = kingdomMonuments.find(m => m.era && m.era !== 'N/A')?.era || '';

      kingdomMonuments.forEach(m => {
        const icon = createTeardropIcon(color, kingdom);
        const marker = L.marker([m.lat, m.lng], { icon: icon });

        // Trigger slide-out info card on marker click
        marker.on('click', () => {
          openInfoCard(m, color);
        });

        layerGroup.addLayer(marker);
        allMonumentsList.push({ ...m, marker: marker, color: color });
      });

      layerGroup.addTo(map);
      kingdomLayers[kingdom] = layerGroup;

      const label = document.createElement('label');
      label.className = 'layer-item';
      label.innerHTML = `
        <input type="checkbox" id="k-${idx}" checked onchange="toggleKingdom('${kingdom}', this.checked)">
        <span class="color-badge" style="background:${color}"></span>
        <div class="kingdom-info">
          <span class="kingdom-name">${kingdom}</span>
          ${dateExtent ? `<span class="kingdom-date">${dateExtent}</span>` : ''}
        </div>
      `;
      layerListEl.appendChild(label);
    });

    fuseEngine = new Fuse(allMonumentsList, {
      keys: ['name', 'kingdom', 'description'],
      threshold: 0.4,
      distance: 100
    });
  })
  .catch(err => console.error("Error loading monuments.json:", err));

// Search Handling
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

searchInput.addEventListener('input', (e) => {
  const query = e.target.value.trim();
  if (!query || !fuseEngine) {
    searchResults.style.display = 'none';
    return;
  }

  const results = fuseEngine.search(query).slice(0, 6);

  if (results.length === 0) {
    searchResults.innerHTML = `<div class="search-result-item" style="color:#8e8e93;">No monuments found</div>`;
  } else {
    searchResults.innerHTML = results.map(res => `
      <div class="search-result-item" onclick="selectMonument('${res.item.name.replace(/'/g, "\\'")}')">
        <div class="search-result-title">${res.item.name}</div>
        <div class="search-result-sub">${res.item.kingdom}</div>
      </div>
    `).join('');
  }
  searchResults.style.display = 'block';
});

function selectMonument(monumentName) {
  const item = allMonumentsList.find(m => m.name === monumentName);
  if (item) {
    if (!map.hasLayer(kingdomLayers[item.kingdom])) {
      map.addLayer(kingdomLayers[item.kingdom]);
      const checkbox = Array.from(document.querySelectorAll('.layer-item')).find(el => el.textContent.includes(item.kingdom))?.querySelector('input');
      if (checkbox) checkbox.checked = true;
    }

    openInfoCard(item, item.color);
    searchResults.style.display = 'none';
    searchInput.value = '';
  }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box-container')) {
    searchResults.style.display = 'none';
  }
});

function toggleKingdom(kingdom, show) {
  if (show) map.addLayer(kingdomLayers[kingdom]);
  else map.removeLayer(kingdomLayers[kingdom]);
}

function toggleAllLayers(show) {
  document.querySelectorAll('#layer-list input[type="checkbox"]').forEach(cb => {
    cb.checked = show;
    cb.dispatchEvent(new Event('change'));
  });
}