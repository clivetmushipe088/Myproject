/*
 * app.js — NutriSearch
 * =====================
 * Author : Clive Tanaka Mushipe
 * Course : ALU Back-End Engineering — 2026
 *
 * External API
 * ------------
 * Open Food Facts — https://world.openfoodfacts.org/
 * Docs     : https://openfoodfacts.github.io/openfoodfacts-server/api/
 * Endpoint : GET https://world.openfoodfacts.org/cgi/search.pl
 * Key      : None required — Open Food Facts is a free, open-source
 *            public database. No API key = no sensitive data to expose.
 *
 * User interactions implemented
 * ------------------------------
 *  1. Keyword search
 *  2. Suggestion pills (quick searches)
 *  3. Sort  — Default | Calories ↑ | Calories ↓ | Protein ↓ | Carbs ↑
 *  4. Filter — All | High Protein (>20g) | Low Calorie (<150) | Low Carb (<10g) | High Cal (>300)
 *  5. Pagination — "Load more" fetches the next page
 */

// ── API config ───────────────────────────────────────────────
// Open Food Facts allows direct browser requests (CORS enabled).
// No API key needed — it's a public open-source food database.
const API_BASE = 'https://world.openfoodfacts.org/cgi/search.pl';

// only request the fields we actually use — keeps responses fast
const FIELDS = [
  'product_name',
  'brands',
  'serving_size',
  'nutriments',
].join(',');

// ── App state ────────────────────────────────────────────────
let currentQuery = '';
let currentPage  = 1;
let allFoods     = [];
let sortMode     = 'default';
let filterMode   = 'all';
let isLoading    = false;

// ── DOM refs ─────────────────────────────────────────────────
const searchInput = document.getElementById('searchInput');
const searchBtn   = document.getElementById('searchBtn');
const cardsGrid   = document.getElementById('cardsGrid');
const resultsMeta = document.getElementById('resultsMeta');
const loadMoreBtn = document.getElementById('loadMoreBtn');

// ── Events ───────────────────────────────────────────────────

searchBtn.addEventListener('click', () => triggerSearch());

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') triggerSearch();
});

// suggestion pills fire a pre-filled search
document.querySelectorAll('.pill').forEach(pill => {
  pill.addEventListener('click', () => {
    searchInput.value = pill.dataset.query;
    triggerSearch();
  });
});

// sort buttons — re-render locally, no extra API call
document.querySelectorAll('[data-sort]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    sortMode = btn.dataset.sort;
    renderCards();
  });
});

// filter buttons — same, re-render locally
document.querySelectorAll('[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterMode = btn.dataset.filter;
    renderCards();
  });
});

// load more — fetch next page and append
loadMoreBtn.addEventListener('click', () => {
  currentPage++;
  fetchFoods(currentQuery, currentPage, true);
});

// ── triggerSearch ────────────────────────────────────────────
function triggerSearch() {
  const q = searchInput.value.trim();
  if (!q) { searchInput.focus(); return; }

  // strip HTML tags — basic input sanitisation
  const sanitised = q.replace(/<[^>]*>/g, '').slice(0, 100);

  if (sanitised !== currentQuery) {
    currentQuery = sanitised;
    currentPage  = 1;
    allFoods     = [];
    // reset sort + filter on new search
    sortMode   = 'default';
    filterMode = 'all';
    document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-sort="default"]').classList.add('active');
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-filter="all"]').classList.add('active');
  }

  fetchFoods(sanitised, currentPage, false);
}

// ── fetchFoods ───────────────────────────────────────────────
// Calls the Open Food Facts search endpoint.
// append=true means we're paginating, not starting a new search.
async function fetchFoods(query, page = 1, append = false) {
  if (isLoading) return;
  isLoading = true;

  if (!append) {
    showLoading();
    document.body.classList.add('has-results');
  } else {
    loadMoreBtn.textContent = 'Loading…';
    loadMoreBtn.disabled    = true;
  }

  try {
    /*
     * Open Food Facts search params:
     *   search_terms — the keyword
     *   json=1       — return JSON
     *   page_size=20 — 20 results per page
     *   page         — which page
     *   fields       — only return the fields we need (faster)
     */
    const url = API_BASE
      + '?search_terms=' + encodeURIComponent(query)
      + '&json=1'
      + '&page_size=20'
      + '&page=' + page
      + '&fields=' + FIELDS;

    // No custom headers needed — Open Food Facts is fully CORS-enabled.
    // Browsers block custom User-Agent headers so we just use the default.
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status >= 500) throw new Error('Open Food Facts is currently down (' + response.status + '). Please try again later.');
      throw new Error('Unexpected error: ' + response.status + ' ' + response.statusText);
    }

    const data = await response.json();

    /*
     * OFF response shape:
     * {
     *   count: 1234,
     *   page: 1,
     *   page_size: 20,
     *   products: [ { product_name, brands, serving_size, nutriments: { ... } } ]
     * }
     */
    const raw   = data.products || [];
    const items = raw.map(normalise).filter(f => f.name !== 'Unknown Product');

    allFoods = append ? allFoods.concat(items) : items;

    if (allFoods.length === 0 && !append) {
      showEmpty(query);
      return;
    }

    renderCards();

    // OFF returns page_size items if more pages exist
    loadMoreBtn.style.display = raw.length >= 20 ? 'block' : 'none';
    loadMoreBtn.textContent   = 'Load more results →';
    loadMoreBtn.disabled      = false;

  } catch (err) {
    // log the real error so we can see exactly what's going wrong
    console.error('[NutriSearch] caught error:', err.name, err.message, err);
    showError(err.name + ': ' + err.message);
  } finally {
    isLoading = false;
  }
}

// ── normalise ────────────────────────────────────────────────
// Open Food Facts has inconsistent field names across products.
// This converts every raw product into one clean, consistent shape
// so the rest of the code never has to deal with the messiness.
function normalise(p) {
  const n = p.nutriments || {};

  // calories: OFF uses 'energy-kcal_100g' or falls back to kJ
  let calories = n['energy-kcal_100g'] != null ? n['energy-kcal_100g']
               : n['energy-kcal']      != null ? n['energy-kcal']
               : n['energy_100g']      != null ? Math.round(n['energy_100g'] / 4.184)
               : null;

  return {
    name:     (p.product_name || '').trim() || 'Unknown Product',
    brand:    (p.brands       || '').trim(),
    serving:  p.serving_size  || '100g',
    calories: calories != null ? Math.round(calories) : null,
    protein:  roundMacro(n['proteins_100g']      != null ? n['proteins_100g']      : n['proteins']),
    carbs:    roundMacro(n['carbohydrates_100g']  != null ? n['carbohydrates_100g'] : n['carbohydrates']),
    fat:      roundMacro(n['fat_100g']            != null ? n['fat_100g']           : n['fat']),
  };
}

function roundMacro(v) {
  if (v == null || isNaN(v)) return null;
  return Math.round(v * 10) / 10;
}

// ── getFilteredAndSorted ─────────────────────────────────────
// Applies the active filter, then sorts the remaining results.
function getFilteredAndSorted() {
  // 1. filter
  let foods = allFoods.filter(food => {
    const cal  = food.calories || 0;
    const prot = food.protein  || 0;
    const carb = food.carbs    || 0;
    switch (filterMode) {
      case 'high-protein': return prot > 20;
      case 'low-cal':      return cal > 0 && cal < 150;
      case 'low-carb':     return carb < 10;
      case 'high-cal':     return cal > 300;
      default:             return true;
    }
  });

  // 2. sort
  const n = v => v != null ? v : -1; // nulls go to bottom
  switch (sortMode) {
    case 'cal-asc':   foods.sort((a, b) => n(a.calories) - n(b.calories)); break;
    case 'cal-desc':  foods.sort((a, b) => n(b.calories) - n(a.calories)); break;
    case 'prot-desc': foods.sort((a, b) => n(b.protein)  - n(a.protein));  break;
    case 'carb-asc':  foods.sort((a, b) => n(a.carbs)    - n(b.carbs));    break;
  }

  return foods;
}

// ── renderCards ──────────────────────────────────────────────
function renderCards() {
  cardsGrid.innerHTML = '';
  const foods = getFilteredAndSorted();

  if (foods.length === 0) {
    cardsGrid.innerHTML =
      '<div class="state-box">' +
        '<span class="state-icon">🔎</span>' +
        '<p class="state-text">No results match this filter.<br/>' +
          '<span style="color:var(--accent);cursor:pointer" id="clearFilter">Clear filter</span>' +
        '</p>' +
      '</div>';
    document.getElementById('clearFilter').addEventListener('click', () => {
      filterMode = 'all';
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      document.querySelector('[data-filter="all"]').classList.add('active');
      renderCards();
    });
    updateMeta(0);
    return;
  }

  foods.forEach(food => cardsGrid.appendChild(buildCard(food)));
  updateMeta(foods.length);
}

// ── updateMeta ───────────────────────────────────────────────
function updateMeta(shown) {
  const total      = allFoods.length;
  const filterText = filterMode !== 'all' ? ' <span class="dim">(filtered)</span>' : '';
  resultsMeta.innerHTML =
    'Showing <strong>' + shown + '</strong>' +
    (shown !== total ? ' of <strong>' + total + '</strong>' : '') +
    ' results for <strong>"' + escHtml(currentQuery) + '"</strong>' +
    filterText;
}

// ── buildCard ────────────────────────────────────────────────
function buildCard(food) {
  const cals  = food.calories != null ? food.calories : '—';
  const prot  = food.protein  != null ? food.protein  + 'g' : '—';
  const carbs = food.carbs    != null ? food.carbs    + 'g' : '—';
  const fat   = food.fat      != null ? food.fat      + 'g' : '—';

  const card = document.createElement('div');
  card.className = 'food-card';
  card.innerHTML =
    '<div>' +
      '<p class="food-name">' + escHtml(food.name) + '</p>' +
      (food.brand ? '<p class="food-brand">' + escHtml(food.brand) + '</p>' : '') +
    '</div>' +
    '<div class="macros">' +
      '<div class="macro cal"><span class="macro-val">'  + cals  + '</span><span class="macro-label">kcal</span></div>'    +
      '<div class="macro prot"><span class="macro-val">' + prot  + '</span><span class="macro-label">protein</span></div>' +
      '<div class="macro carb"><span class="macro-val">' + carbs + '</span><span class="macro-label">carbs</span></div>'   +
      '<div class="macro fat"><span class="macro-val">'  + fat   + '</span><span class="macro-label">fat</span></div>'     +
    '</div>' +
    '<p class="serving">per ' + escHtml(food.serving) + '</p>';
  return card;
}

// ── UI states ────────────────────────────────────────────────
function showLoading() {
  cardsGrid.innerHTML =
    '<div class="state-box">' +
      '<div class="spinner"></div>' +
      '<p class="state-text">Searching Open Food Facts database…</p>' +
    '</div>';
  resultsMeta.innerHTML     = '';
  loadMoreBtn.style.display = 'none';
}

function showEmpty(query) {
  cardsGrid.innerHTML =
    '<div class="state-box">' +
      '<span class="state-icon">🔍</span>' +
      '<p class="state-text">No results found for <strong>"' + escHtml(query) + '"</strong>.<br/>Try a different food name.</p>' +
    '</div>';
  resultsMeta.innerHTML     = '';
  loadMoreBtn.style.display = 'none';
}

function showError(msg) {
  cardsGrid.innerHTML =
    '<div class="state-box">' +
      '<span class="state-icon">⚠️</span>' +
      '<p class="state-text">Something went wrong.<br/>' +
        '<span style="color:var(--danger);font-size:.72rem;line-height:1.8">' + escHtml(msg) + '</span>' +
      '</p>' +
    '</div>';
  resultsMeta.innerHTML     = '';
  loadMoreBtn.style.display = 'none';
}

// ── Utility ──────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
