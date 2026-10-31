'use strict';

// Ook in index.html (?v= achter app.css en app.js) en in CHANGELOG.md.
const VERSION = '1.0.1';
const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';
const LANG = 'nl-NL';
// Offline land-uit-coördinaten (grenzen zitten in het bestand zelf), vastgepind met SRI-hash.
const CC_SRC = 'https://cdn.jsdelivr.net/npm/@rapideditor/country-coder@5.6.1/dist/country-coder.iife.js';
const CC_SRI = 'sha384-AEg1TWvjy0rd0sWIw3abe1ndRzAsJzTXrhG5cZjhp+drsxB3BWTPtgNrwlWi+EVo';

const LANES = [
  { key: 'sub', label: 'Abonnement', names: true, max: 6 },
  { key: 'free', label: 'Gratis', names: true, max: 4 },
  { key: 'rent', label: 'Huren', names: false, max: 6 },
  { key: 'buy', label: 'Kopen', names: false, max: 6 },
];
// Per land: diensten van eigen bodem eerst in "Mijn diensten" (herkend op naam, enkel voor de volgorde),
// en diensten die TMDB niet kent. Van die laatste is het aanbod onbekend: de app geeft alleen een zoeklink.
const LOCAL = {
  BE: {
    local: ['VRT MAX', 'VTM GO', 'RTL Play', 'RTBF Auvio', 'Telenet', 'Be TV Go'],
    extra: [
      // Play (ex-GoPlay) neemt geen zoekterm uit de link over.
      { id: 'x-play', name: 'Play', url: 'https://www.play.tv/zoeken' },
      { id: 'x-streamz', name: 'Streamz', url: 'https://www.streamz.be/streamz/zoeken', param: 'query' },
      // Arte heeft geen Nederlandstalige site.
      { id: 'x-arte', name: 'Arte', url: 'https://www.arte.tv/fr/search/', param: 'q' },
    ],
  },
};
const EXTRA_HOSTS = new Set(['www.play.tv', 'www.streamz.be', 'www.arte.tv']);
const SOURCE_LABEL = { gps: 'GPS', manual: 'Gekozen', taal: 'Geschat' };
const MESSAGES = {
  auth: 'TMDB herkent je sleutel niet. Kopieer het API Read Access Token opnieuw en plak het hieronder.',
  rate: 'TMDB krijgt even te veel verzoeken. Probeer het over een paar seconden opnieuw.',
  offline: 'Geen verbinding met TMDB. Controleer je internetverbinding.',
  http: 'TMDB gaf een fout terug. Probeer het later opnieuw.',
};

const $ = (sel) => document.querySelector(sel);

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('wkih.' + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem('wkih.' + key, JSON.stringify(value)); } catch { /* opslag geblokkeerd */ }
  },
  del(key) {
    try { localStorage.removeItem('wkih.' + key); } catch { /* opslag geblokkeerd */ }
  },
};

const regionNames = (() => {
  try { return new Intl.DisplayNames(['nl'], { type: 'region' }); } catch { return null; }
})();
function countryName(code) {
  try { return regionNames?.of(code) || code; } catch { return code; }
}
function languageCountry() {
  for (const tag of navigator.languages || [navigator.language]) {
    const m = /-([a-z]{2})\b/i.exec(tag || '');
    if (m) return m[1].toUpperCase();
  }
  return 'BE';
}

const state = {
  token: store.get('token', ''),
  country: store.get('country', null) || { code: languageCountry(), source: 'taal' },
  subs: new Set(store.get('subs', [])),
  type: 'all',
  query: '',
  regions: null,
  subsList: null,
  located: false,
};
let cards = [];

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

/* ---------- TMDB ---------- */

class ApiError extends Error {
  constructor(kind, status) {
    super(kind);
    this.kind = kind;
    this.status = status;
  }
}

async function api(path, params = {}, signal) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers = { accept: 'application/json' };
  // v3-sleutel (32 hex) gaat als parameter, het Read Access Token als Bearer.
  if (/^[a-f0-9]{32}$/i.test(state.token)) url.searchParams.set('api_key', state.token);
  else headers.authorization = 'Bearer ' + state.token;
  let res;
  try {
    res = await fetch(url, { headers, signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('offline');
  }
  if (res.status === 401) throw new ApiError('auth', 401);
  if (res.status === 429) throw new ApiError('rate', 429);
  if (!res.ok) throw new ApiError('http', res.status);
  return res.json();
}

function limiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve().then(fn).then(resolve, reject).finally(() => {
      active--;
      next();
    });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}
const enqueue = limiter(6);

const providerCache = new Map();
function getProviders(item) {
  const key = item.media_type + ':' + item.id;
  let p = providerCache.get(key);
  if (!p) {
    p = api(`/${item.media_type}/${item.id}/watch/providers`).then((r) => r.results || {});
    p.catch(() => providerCache.delete(key));
    providerCache.set(key, p);
  }
  return p;
}

/* ---------- Lijst ---------- */

let listCtl;
async function loadList() {
  if (!state.token) return;
  listCtl?.abort();
  listCtl = new AbortController();
  const { signal } = listCtl;
  const q = state.query.trim();
  const t = state.type;
  const results = $('#results');
  $('#list-title').textContent = q ? `Resultaten voor “${q}”` : 'Populair deze week';
  results.setAttribute('aria-busy', 'true');
  try {
    const data = q
      ? await api(t === 'all' ? '/search/multi' : `/search/${t}`, { query: q, language: LANG, include_adult: 'false' }, signal)
      : await api(`/trending/${t}/week`, { language: LANG }, signal);
    const items = (data.results || [])
      .map((r) => ({ ...r, media_type: r.media_type || t }))
      .filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
    hideNotice();
    renderList(items, q);
  } catch (e) {
    if (e.name !== 'AbortError') handleError(e);
  } finally {
    if (!signal.aborted) results.removeAttribute('aria-busy');
  }
}

function renderList(items, q) {
  const ol = $('#results');
  cards = [];
  ol.replaceChildren();
  if (!items.length) {
    ol.append(h('li', { class: 'empty' }, q
      ? `Niets gevonden voor “${q}”. Probeer een andere spelling of de originele titel.`
      : 'Geen titels gevonden.'));
    return;
  }
  for (const item of items) {
    const card = buildCard(item);
    ol.append(h('li', null, card.el));
    enqueue(() => (card.el.isConnected ? getProviders(item) : null))
      .then((res) => {
        if (!res) return;
        card.results = res;
        card.fill();
      })
      .catch((e) => card.fail(e));
  }
}

function refillAll() {
  for (const card of cards) if (card.results) card.fill();
}

function poster(item, title) {
  const placeholder = () => h('span', { class: 'poster poster-none', 'aria-hidden': 'true' }, title.slice(0, 1));
  if (!item.poster_path) return placeholder();
  const img = h('img', {
    class: 'poster', src: IMG + 'w154' + item.poster_path, alt: '',
    loading: 'lazy', decoding: 'async', width: '64', height: '96',
  });
  img.addEventListener('error', () => img.replaceWith(placeholder()), { once: true });
  return img;
}

function buildCard(item) {
  const title = item.title || item.name || 'Zonder titel';
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const kind = item.media_type === 'tv' ? 'Serie' : 'Film';
  const avail = h('span', { class: 'avail' }, h('span', { class: 'loading' }, 'Beschikbaarheid laden…'));
  const detail = h('div', { class: 'detail' });
  const el = h('details', { class: 'card' },
    h('summary', null,
      poster(item, title),
      h('span', { class: 'info' },
        h('h3', { class: 'title' }, title),
        h('span', { class: 'meta' }, [kind, year].filter(Boolean).join(' · ')),
        avail),
      h('span', { class: 'chev', 'aria-hidden': 'true' })),
    detail);
  const card = {
    el,
    results: null,
    fill() {
      const v = view(card.results);
      avail.replaceChildren(...summary(v));
      detail.replaceChildren(...details(item, v));
    },
    fail(e) {
      avail.replaceChildren(h('span', { class: 'none' }, 'Beschikbaarheid kon niet geladen worden.'));
      if (e?.kind === 'auth' || e?.kind === 'offline') handleError(e);
    },
  };
  detail.append(h('p', { class: 'hint' }, 'Beschikbaarheid laden…'));
  cards.push(card);
  return card;
}

const byPriority = (a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999);
function uniq(list) {
  const seen = new Set();
  return list.filter((p) => !seen.has(p.provider_id) && seen.add(p.provider_id));
}

function view(results) {
  const code = state.country.code;
  const r = results[code] || {};
  const lanes = {
    sub: uniq(r.flatrate || []).sort(byPriority),
    free: uniq([...(r.free || []), ...(r.ads || [])]).sort(byPriority),
    rent: uniq(r.rent || []).sort(byPriority),
    buy: uniq(r.buy || []).sort(byPriority),
  };
  const elsewhere = Object.entries(results)
    .filter(([c, v]) => c !== code && v.flatrate?.length)
    .map(([c, v]) => ({
      name: countryName(c),
      providers: uniq(v.flatrate).sort(byPriority),
      mine: v.flatrate.some((p) => state.subs.has(p.provider_id)),
    }))
    .sort((a, b) => (b.mine - a.mine) || a.name.localeCompare(b.name, 'nl'));
  return {
    code,
    link: /^https:\/\/www\.themoviedb\.org\//.test(r.link || '') ? r.link : null,
    lanes,
    mine: lanes.sub.filter((p) => state.subs.has(p.provider_id)),
    elsewhere,
    any: Object.values(lanes).some((l) => l.length),
  };
}

function chip(p, withName) {
  const mine = state.subs.has(p.provider_id);
  const el = h('span', {
    class: 'chip' + (withName ? '' : ' logo-only') + (mine ? ' is-mine' : ''),
    title: p.provider_name,
  });
  const name = () => h('span', null, p.provider_name);
  if (p.logo_path) {
    const img = h('img', {
      src: IMG + 'w92' + p.logo_path, alt: withName ? '' : p.provider_name,
      width: '20', height: '20', loading: 'lazy', decoding: 'async',
    });
    img.addEventListener('error', () => {
      img.remove();
      if (!withName) el.append(name());
    }, { once: true });
    el.append(img);
  }
  if (withName || !p.logo_path) el.append(name());
  return el;
}

function summary(v) {
  const out = [];
  if (v.mine.length) {
    out.push(h('span', { class: 'mine' }, 'In jouw abonnement: ' + v.mine.map((p) => p.provider_name).join(', ')));
  }
  if (!v.any) {
    const n = v.elsewhere.length;
    out.push(h('span', { class: 'none' }, `Niet te zien in ${countryName(v.code)}.`
      + (n ? ` Wel inbegrepen in ${n} ${n === 1 ? 'ander land' : 'andere landen'}.` : '')));
    return out;
  }
  const lanes = h('span', { class: 'lanes' });
  for (const lane of LANES) {
    const list = v.lanes[lane.key];
    if (!list.length) continue;
    const chips = h('span', { class: 'chips' }, list.slice(0, lane.max).map((p) => chip(p, lane.names)));
    if (list.length > lane.max) chips.append(h('span', { class: 'more' }, `+${list.length - lane.max}`));
    lanes.append(h('span', { class: 'lane' },
      h('span', { class: 'lane-label' }, h('span', { class: `key key-${lane.key}` }), lane.label),
      chips));
  }
  out.push(lanes);
  return out;
}

// De aangevinkte diensten zonder TMDB-gegevens, of alle als er geen aangevinkt is.
function extraServices() {
  const extra = LOCAL[state.country.code]?.extra || [];
  const mine = extra.filter((s) => state.subs.has(s.id));
  return mine.length ? mine : extra;
}

function searchLink(service, title) {
  let url;
  try { url = new URL(service.url); } catch { return null; }
  if (url.protocol !== 'https:' || !EXTRA_HOSTS.has(url.hostname)) return null;
  if (service.param) url.searchParams.set(service.param, title);
  return url.href;
}

function searchBlock(item) {
  const title = item.title || item.name || '';
  const links = extraServices()
    .map((s) => ({ s, href: searchLink(s, title) }))
    .filter((l) => l.href);
  if (!links.length) return null;
  const typed = links.filter((l) => !l.s.param).map((l) => l.s.name);
  return h('div', { class: 'block' },
    h('h4', null, 'Zelf zoeken bij'),
    h('p', { class: 'search-links' }, links.map(({ s, href }) =>
      h('a', { class: 'ext', href, target: '_blank', rel: 'noopener noreferrer' }, s.name))),
    h('p', { class: 'hint' }, 'TMDB weet niet of de titel hier staat.'
      + (typed.length ? ` Bij ${typed.join(' en ')} typ je de titel zelf in.` : '')));
}

function details(item, v) {
  const out = [];
  if (item.overview) out.push(h('p', { class: 'overview' }, item.overview));
  for (const [key, label] of [['sub', 'Inbegrepen bij'], ['free', 'Gratis bij'], ['rent', 'Huren bij'], ['buy', 'Kopen bij']]) {
    const list = v.lanes[key];
    if (list.length) {
      out.push(h('div', { class: 'block' },
        h('h4', null, label),
        h('p', { class: 'names' }, list.map((p) => p.provider_name).join(', '))));
    }
  }
  if (v.link) {
    out.push(h('a', { class: 'ext', href: v.link, target: '_blank', rel: 'noopener noreferrer' },
      `Aanbieders en links in ${countryName(v.code)}`));
  }
  const search = searchBlock(item);
  if (search) out.push(search);
  if (v.elsewhere.length) {
    const max = 8;
    const ul = h('ul', { class: 'elsewhere' });
    v.elsewhere.forEach((c, i) => {
      const li = h('li', { class: c.mine ? 'is-mine' : null },
        h('span', { class: 'cn' }, c.name),
        h('span', null, c.providers.map((p) => p.provider_name).join(', ')));
      li.hidden = i >= max;
      ul.append(li);
    });
    const block = h('div', { class: 'block' }, h('h4', null, 'In een abonnement in andere landen'), ul);
    if (v.elsewhere.length > max) {
      const btn = h('button', { class: 'link-btn', type: 'button' }, `Toon alle ${v.elsewhere.length} landen`);
      btn.addEventListener('click', () => {
        ul.querySelectorAll('li[hidden]').forEach((li) => { li.hidden = false; });
        btn.remove();
      });
      block.append(btn);
    }
    out.push(block);
  }
  if (!out.length) out.push(h('p', { class: 'hint' }, 'Geen extra informatie.'));
  return out;
}

/* ---------- Meldingen ---------- */

function showNotice(text) {
  const el = $('#notice');
  el.textContent = text;
  el.hidden = false;
}
function hideNotice() {
  $('#notice').hidden = true;
}
function handleError(e) {
  if (e?.kind === 'auth') {
    store.del('token');
    state.token = '';
    start();
    $('#token-msg').textContent = MESSAGES.auth;
    return;
  }
  showNotice(MESSAGES[e?.kind] || MESSAGES.http);
}

/* ---------- Land ---------- */

function renderCountry(status) {
  $('#country-name').textContent = countryName(state.country.code);
  $('#country-src').textContent = status || SOURCE_LABEL[state.country.source] || '';
}

function checkRegion() {
  const note = $('#region-note');
  const code = state.country.code;
  if (state.regions && !state.regions.has(code)) {
    note.textContent = `TMDB heeft geen streaminggegevens voor ${countryName(code)}. Kies een ander land via de landknop bovenaan.`;
    note.hidden = false;
  } else {
    note.hidden = true;
  }
}

function fillCountrySelect() {
  const codes = new Set(state.regions || []);
  codes.add(state.country.code);
  const options = [...codes]
    .map((c) => ({ c, n: countryName(c) }))
    .sort((a, b) => a.n.localeCompare(b.n, 'nl'))
    .map(({ c, n }) => h('option', { value: c }, n));
  const sel = $('#country-select');
  sel.replaceChildren(...options);
  sel.value = state.country.code;
}

function setCountry(code, source) {
  const changed = code !== state.country.code;
  state.country = { code, source };
  store.set('country', state.country);
  renderCountry();
  fillCountrySelect();
  checkRegion();
  if (changed) {
    refillAll();
    state.subsList = null;
    if ($('#settings-dlg').open) loadSubs();
  }
}

let ccPromise;
function loadCountryCoder() {
  if (window.countryCoder) return Promise.resolve(window.countryCoder);
  ccPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CC_SRC;
    s.integrity = CC_SRI;
    s.crossOrigin = 'anonymous';
    s.referrerPolicy = 'no-referrer';
    s.addEventListener('load', () => (window.countryCoder ? resolve(window.countryCoder) : reject(new Error('cc'))));
    s.addEventListener('error', () => {
      ccPromise = null;
      s.remove();
      reject(new Error('cc'));
    });
    document.head.append(s);
  });
  return ccPromise;
}

function locateError(e) {
  if (e?.code === 1) return 'Je browser geeft geen toegang tot je locatie. Sta locatie toe in de instellingen van je browser, of kies hieronder een land.';
  if (e?.code === 2 || e?.code === 3) return 'Je locatie kon niet bepaald worden. Probeer het opnieuw of kies hieronder een land.';
  if (e?.code === 'nocountry') return 'Op deze plek ligt geen land. Kies hieronder een land.';
  return 'Het land kon niet bepaald worden. Kies hieronder een land.';
}

let locating = null;
function locate(fromUser) {
  const msg = $('#locate-msg');
  if (!('geolocation' in navigator)) {
    if (fromUser) msg.textContent = 'Deze browser kan je locatie niet bepalen. Kies hieronder een land.';
    return Promise.resolve();
  }
  if (fromUser) msg.textContent = 'Locatie bepalen…';
  if (locating) return locating;
  renderCountry('…');
  locating = new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false, timeout: 15000, maximumAge: 30 * 60 * 1000,
    });
  })
    .then(async (pos) => {
      const cc = await loadCountryCoder();
      const code = cc.iso1A2Code([pos.coords.longitude, pos.coords.latitude]);
      if (!code) throw Object.assign(new Error('nocountry'), { code: 'nocountry' });
      setCountry(code, 'gps');
      msg.textContent = `Je bent in ${countryName(code)}.`;
    })
    .catch((e) => {
      renderCountry();
      if (fromUser) msg.textContent = locateError(e);
    })
    .finally(() => { locating = null; });
  return locating;
}

async function loadRegions() {
  try {
    const data = await api('/watch/providers/regions', { language: LANG });
    state.regions = new Set((data.results || []).map((r) => r.iso_3166_1));
    fillCountrySelect();
    checkRegion();
  } catch (e) {
    handleError(e);
  }
}

/* ---------- Mijn diensten ---------- */

function subItem(id, name, logo) {
  const input = h('input', { type: 'checkbox', id: 'sub-' + id });
  input.checked = state.subs.has(id);
  input.addEventListener('change', () => {
    if (input.checked) state.subs.add(id);
    else state.subs.delete(id);
    store.set('subs', [...state.subs]);
    refillAll();
  });
  const img = logo ? h('img', { src: IMG + 'w92' + logo, alt: '', width: '24', height: '24', loading: 'lazy' }) : null;
  img?.addEventListener('error', () => img.remove(), { once: true });
  return h('li', { 'data-name': name.toLowerCase() },
    h('label', { for: input.id }, input, img, h('span', null, name)));
}

function subsGroup(title, items, hint) {
  return h('section', { class: 'subs-group' },
    title && h('h3', null, title),
    hint && h('p', { class: 'hint' }, hint),
    h('ul', { class: 'subs' }, items));
}

async function loadSubs() {
  const code = state.country.code;
  const box = $('#subs');
  $('#subs-country').textContent = countryName(code);
  $('#subs-filter').value = '';
  if (state.subsList?.code !== code) {
    box.replaceChildren(h('p', { class: 'hint' }, 'Diensten laden…'));
    try {
      const [movie, tv] = await Promise.all(['movie', 'tv'].map((k) => api(`/watch/providers/${k}`, { watch_region: code, language: LANG })));
      const prio = (p) => p.display_priorities?.[code] ?? p.display_priority ?? 999;
      const providers = uniq([...(movie.results || []), ...(tv.results || [])]).sort((a, b) => prio(a) - prio(b));
      state.subsList = { code, providers };
    } catch (e) {
      box.replaceChildren(h('p', { class: 'hint' }, MESSAGES[e.kind] || MESSAGES.http));
      return;
    }
  }
  const { providers } = state.subsList;
  const local = LOCAL[code];
  const names = (local?.local || []).map((n) => n.toLowerCase());
  const rank = (p) => names.indexOf(p.provider_name.toLowerCase());
  const own = providers.filter((p) => rank(p) >= 0).sort((a, b) => rank(a) - rank(b));
  const rest = providers.filter((p) => rank(p) < 0);
  // Aangevinkte diensten bovenaan, maar alleen bij openen: niets verspringt onder je vinger.
  const ordered = [
    ...rest.filter((p) => state.subs.has(p.provider_id)),
    ...rest.filter((p) => !state.subs.has(p.provider_id)),
  ];
  const item = (p) => subItem(p.provider_id, p.provider_name, p.logo_path);
  const groups = [];
  if (own.length) groups.push(subsGroup(`Diensten in ${countryName(code)}`, own.map(item)));
  groups.push(subsGroup(own.length ? 'Overige' : null, ordered.map(item)));
  if (local?.extra?.length) {
    groups.push(subsGroup('Zonder gegevens bij TMDB', local.extra.map((s) => subItem(s.id, s.name, null)),
      'TMDB weet niet wat er bij deze diensten te zien is. Bij elke titel krijg je een link om er zelf te zoeken.'));
  }
  box.replaceChildren(...groups);
}

/* ---------- Start ---------- */

function start() {
  const ready = Boolean(state.token);
  $('#setup').hidden = ready;
  $('#list').hidden = !ready;
  $('#q').disabled = !ready;
  $('#settings-btn').disabled = !ready;
  document.querySelectorAll('.seg button').forEach((b) => { b.disabled = !ready; });
  if (!ready) {
    hideNotice();
    return;
  }
  if (!state.regions) loadRegions();
  if (!state.located && state.country.source !== 'manual') {
    state.located = true;
    locate(false);
  }
  loadList();
}

// Elk open venster krijgt een stap in de geschiedenis, zodat de terugknop of -veeg het sluit.
function openDialog(dlg) {
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
  try { history.pushState({ dialog: dlg.id }, ''); } catch { /* geschiedenis niet beschikbaar */ }
}
window.addEventListener('popstate', () => {
  document.querySelectorAll('dialog[open]').forEach((dlg) => dlg.close());
});

let savingToken = false;
$('#token-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (savingToken) return;
  const input = $('#token-input');
  const msg = $('#token-msg');
  const token = input.value.trim().replace(/^Bearer\s+/i, '');
  if (!token) {
    msg.textContent = 'Plak eerst je sleutel in het veld.';
    return;
  }
  if (!/^[\w.-]+$/.test(token)) {
    msg.textContent = 'Deze sleutel bevat tekens die er niet in horen. Kopieer hem opnieuw vanaf themoviedb.org.';
    return;
  }
  msg.textContent = 'Sleutel controleren…';
  savingToken = true;
  state.token = token;
  try {
    await api('/authentication');
    store.set('token', token);
    input.value = '';
    msg.textContent = '';
    start();
  } catch (err) {
    state.token = '';
    msg.textContent = MESSAGES[err.kind] || MESSAGES.http;
  } finally {
    savingToken = false;
  }
});

// Een volledige sleutel plakken of laten invullen door 1Password slaat hem meteen op.
let autoSave;
const autoSaveToken = () => {
  clearTimeout(autoSave);
  const v = $('#token-input').value.trim();
  if (/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(v) || /^[a-f0-9]{32}$/i.test(v)) {
    autoSave = setTimeout(() => $('#token-form').requestSubmit(), 300);
  }
};
$('#token-input').addEventListener('input', autoSaveToken);
$('#token-input').addEventListener('change', autoSaveToken);

let debounce;
$('#q').addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    if ($('#q').value.trim() === state.query.trim()) return;
    state.query = $('#q').value;
    loadList();
  }, 350);
});
$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  clearTimeout(debounce);
  state.query = $('#q').value;
  loadList();
  $('#q').blur();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest('input, select, textarea, dialog')) return;
  e.preventDefault();
  $('#q').focus();
});

document.querySelectorAll('.seg button').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (state.type === btn.dataset.type) return;
    state.type = btn.dataset.type;
    document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    loadList();
  });
});

$('#country-btn').addEventListener('click', () => {
  fillCountrySelect();
  $('#locate-msg').textContent = state.country.source === 'gps'
    ? `Bepaald via je locatie: ${countryName(state.country.code)}.`
    : '';
  openDialog($('#country-dlg'));
});
$('#locate-btn').addEventListener('click', () => locate(true));
$('#country-select').addEventListener('change', (e) => {
  setCountry(e.target.value, 'manual');
  $('#locate-msg').textContent = `Ingesteld op ${countryName(e.target.value)}. Tik op “Gebruik mijn locatie” om weer automatisch te werken.`;
});

$('#settings-btn').addEventListener('click', () => {
  $('#token-state').textContent = 'Ingesteld. De sleutel staat alleen in deze browser.';
  loadSubs();
  openDialog($('#settings-dlg'));
});
$('#subs-filter').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  $('#subs').querySelectorAll('li[data-name]').forEach((li) => { li.hidden = q && !li.dataset.name.includes(q); });
  $('#subs').querySelectorAll('.subs-group').forEach((g) => { g.hidden = !g.querySelector('li[data-name]:not([hidden])'); });
});
$('#token-clear').addEventListener('click', () => {
  store.del('token');
  state.token = '';
  $('#settings-dlg').close();
  $('#results').replaceChildren();
  cards = [];
  start();
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-close]');
  if (btn) btn.closest('dialog').close();
});
document.querySelectorAll('dialog').forEach((dlg) => {
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => {
    if (history.state?.dialog === dlg.id) history.back();
  });
});

document.querySelectorAll('[data-version]').forEach((el) => { el.textContent = 'Versie ' + VERSION; });
renderCountry();
start();
