'use strict';

/* Bump on every edit. Shown in the legend drawer and logged to the console,
 * so "am I actually looking at the new code?" is answerable at a glance —
 * a stale service worker or HTTP cache will show an older stamp. */
const BUILD = '2026-07-25 · 28';
console.info('%c[marvista] build ' + BUILD, 'color:#3d7a24;font-weight:bold');

/* ------------------------------------------------------------------ *
 * Georeference
 *
 * Derived by overlaying the paper map on satellite imagery (calibrate.html)
 * and checked against three distances printed on the map — the 0.64 K
 * entrance road, the 0.3 K link north of Dos Rios and the 2.1 K Black
 * "Diamond" loop — which all agree with a paper width of 1438 m.
 * ------------------------------------------------------------------ */
const CENTRE = { lat: 10.417722, lon: -85.772692 };

/* The sheet says how much ground it covers and where the reference point sits
 * within it, as a fraction — it is NOT the image centre here.
 *
 * 2k-map is an extended redraw on a taller canvas. Its geometry was
 * measured, not assumed — ten trail-head squares matched against the scan give
 *     x_ai = 1.0085 * x_paper - 0.0038
 *     y_ai = 0.64424 * y_paper + 0.16806
 * predicting every point to within 0.0012 of the sheet (about 3 px). From that:
 *   ground width  = 1438 / 1.0085          = 1425.9 m
 *   ground height = 1654 / 0.64424         = 2567.4 m
 *   reference at  = (0.50045, 0.49018)     — 27 px above the image centre,
 *                                            i.e. the extension is slightly
 *                                            deeper below than above.
 */
const SHEET = { src: '2k-map.webp', w: 1425.9, h: 2567.4, fx: 0.50045, fy: 0.49018 };

const CAL = {
  centreLat: CENTRE.lat,
  centreLon: CENTRE.lon,
  widthMetres: SHEET.w,
  rotationDeg: -3.62      // positive = drawn clockwise of north-up
};
const SHEET_H = SHEET.h;

const M_PER_DEG_LAT = 110574;
const _t = CAL.rotationDeg * Math.PI / 180;
const AX = [Math.cos(_t), -Math.sin(_t)];   // sheet +x, in (east, north) metres
const AY = [-Math.sin(_t), -Math.cos(_t)];  // sheet +y
const MPD_LON = 111320 * Math.cos(CAL.centreLat * Math.PI / 180);

/** lat/lon -> position as a fraction of the sheet, {fx, fy} in 0..1 */
function toFraction(lat, lon) {
  const E = (lon - CAL.centreLon) * MPD_LON;
  const N = (lat - CAL.centreLat) * M_PER_DEG_LAT;
  return {
    fx: SHEET.fx + (E * AX[0] + N * AX[1]) / CAL.widthMetres,
    fy: SHEET.fy + (E * AY[0] + N * AY[1]) / SHEET_H
  };
}

const onSheet = f => f.fx >= 0 && f.fx <= 1 && f.fy >= 0 && f.fy <= 1;

/* ------------------------------------------------------------------ */

const $ = id => document.getElementById(id);
const art = $('art'), me = $('me'), accuracy = $('accuracy');
const elDot = $('statusDot'), elText = $('statusText');

let fix = null;

/* Real DOM, not a canvas: the browser rasterises at the device's own pixel
 * density, so the map stays sharp when zoomed. */
(async () => {
  const src = SHEET.src;
  try {
    /* WebP only — a ninth the size of the PNG (249 KB vs 2243 KB) with 1.6%
     * error on the drawn lines. Supported since iOS 14, so a PNG fallback
     * would just be 2.2 MB of dead weight in the offline cache. */
    art.innerHTML = `<img src="${src}" alt="">`;
    document.documentElement.style.setProperty('--sheet-aspect', CAL.widthMetres / SHEET_H);
    startGeolocation();
  } catch (e) {
    console.error('[marvista]', e);      // never swallow it silently again
    setStatus('bad', 'Could not load ' + src);
  }
})();

/* ------------------------------------------------------------------ */

function place() {
  if (!fix) { me.hidden = true; return; }
  const f = toFraction(fix.lat, fix.lon);
  if (!onSheet(f)) { me.hidden = true; return; }   // never clamp to the edge

  me.hidden = false;
  me.style.left = (f.fx * 100) + '%';
  me.style.top  = (f.fy * 100) + '%';

  /* Accuracy halo, true to the map's scale. At this zoom the whole sheet is
   * 1438 m across, so a good fix is only a few pixels — CSS clamps it to a
   * visible minimum, exactly as Google Maps does, and it grows honestly as
   * the fix degrades. */
  const px = (fix.accuracy / CAL.widthMetres) * sheetWidthPx();
  accuracy.style.width = accuracy.style.height = (px * 2) + 'px';
}

// layout width, NOT getBoundingClientRect — that would double-count the zoom
const sheetWidthPx = () => $('sheet').offsetWidth || 0;

/* ------------------------------------------------------------------ *
 * Places
 *
 * These used to be legend rows, which meant reading a key and then hunting
 * for the badge. Now the badge itself is the control: tap it and it tells
 * you what it is. Positions come from the paper-map pixels measured during
 * calibration, pushed through the same fit as everything else.
 *
 * Hit-testing is by PROXIMITY, not by hit boxes. The fitness centre, Gracia
 * and the Dos Rios gate sit within ~30 px of one another at 1x, so overlapping
 * circles would fight over the tap and whichever was later in the DOM would
 * win. Nearest-wins is unambiguous, and the threshold is in screen pixels so
 * it stays a comfortable finger target at any zoom.
 * ------------------------------------------------------------------ */
const PLACES = [
  { name: 'Miramar gate',   fx: 0.1722, fy: 0.5326 },
  { name: 'Locked gate',    fx: 0.1582, fy: 0.6144 },
  { name: 'Tennis courts',  fx: 0.1912, fy: 0.5985 },
  { name: 'Fitness centre', fx: 0.2711, fy: 0.6368 },
  { name: 'Gracia',         fx: 0.3048, fy: 0.6499 },
  { name: 'Dos Rios gate',  fx: 0.3423, fy: 0.6456 },
  { name: 'Playground',     fx: 0.4745, fy: 0.5389 },
  { name: 'Water pumping station', fx: 0.6326, fy: 0.3105 },
  { name: 'Water pumping station', fx: 0.3737, fy: 0.5520 }
];

let tip = null;

const TAP_RADIUS = 32;        // screen px

function buildPlaces() {
  tip = document.createElement('div');
  tip.id = 'tip';
  tip.hidden = true;
  sheetEl.appendChild(tip);
}

/** nearest place to a tap, in screen pixels, or null */
function placeNear(clientX, clientY) {
  const r = sheetEl.getBoundingClientRect();     // includes the zoom transform
  let best = null, bestD = TAP_RADIUS;
  for (const p of PLACES) {
    const d = Math.hypot(r.left + p.fx * r.width - clientX,
                         r.top  + p.fy * r.height - clientY);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function showTip(p) {
  tip.textContent = p.name;
  tip.style.left = (p.fx * 100) + '%';
  tip.style.top  = (p.fy * 100) + '%';
  tip.hidden = false;
  scaleTip();
}
const hideTip = () => { if (tip) tip.hidden = true; };
// keep the label legible rather than letting it grow with the map
const scaleTip = () => { if (tip) tip.style.transform = `translate(-50%,-100%) scale(${1 / view.s})`; };

/* ------------------------------------------------------------------ *
 * Pan and zoom
 *
 * Capped at 2x: the map is a fixed drawing, so beyond that you are just
 * magnifying pixels. The marker lives inside the sheet, so it scales and
 * pans with the artwork for free.
 * ------------------------------------------------------------------ */
const MAX_ZOOM = 2;
const stage = $('stage'), sheetEl = $('sheet');
const view = { s: 1, tx: 0, ty: 0 };

function clampView() {
  const sw = sheetEl.offsetWidth * view.s;
  const sh = sheetEl.offsetHeight * view.s;
  const vw = stage.clientWidth, vh = stage.clientHeight;
  view.tx = sw <= vw ? (vw - sw) / 2 : Math.min(0, Math.max(vw - sw, view.tx));
  view.ty = sh <= vh ? (vh - sh) / 2 : Math.min(0, Math.max(vh - sh, view.ty));
}

function applyView() {
  clampView();
  sheetEl.style.transform = `translate(${view.tx}px,${view.ty}px) scale(${view.s})`;
  scaleTip();
}

/** zoom about a point in stage coordinates, so the map stays under the fingers */
function zoomAt(cx, cy, factor) {
  const next = Math.min(MAX_ZOOM, Math.max(1, view.s * factor));
  const k = next / view.s;
  view.tx = cx - (cx - view.tx) * k;
  view.ty = cy - (cy - view.ty) * k;
  view.s = next;
  applyView();
}

const pointers = new Map();
let pinchDist = 0, moved = 0, lastTap = 0;

stage.addEventListener('pointerdown', e => {
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moved = 0;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
  }
});

stage.addEventListener('pointermove', e => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const cur = { x: e.clientX, y: e.clientY };
  pointers.set(e.pointerId, cur);
  const r = stage.getBoundingClientRect();

  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0) {
      zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinchDist);
    }
    pinchDist = d;
    moved = 99;
  } else {
    const dx = cur.x - prev.x, dy = cur.y - prev.y;
    moved += Math.hypot(dx, dy);
    view.tx += dx; view.ty += dy;
    applyView();
  }
});

function releasePointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = 0;
}
stage.addEventListener('pointerup', e => {
  releasePointer(e);
  const now = performance.now();
  if (moved < 8) {
    const hit = placeNear(e.clientX, e.clientY);
    if (hit) {
      showTip(hit);
      lastTap = 0;            // never zoom out from under a badge you just named
      return;
    }
    hideTip();
    if (now - lastTap < 300) {                       // double-tap toggles zoom
      const r = stage.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, view.s > 1 ? 1 / view.s : MAX_ZOOM);
      lastTap = 0;
    } else lastTap = now;
  }
});
stage.addEventListener('pointercancel', releasePointer);

stage.addEventListener('wheel', e => {
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });

addEventListener('resize', applyView);

/* No chrome while it is working. The bar appears only when there is something
 * the walker needs to know — no fix, no permission, off the map. */
function setStatus(kind, text) {
  const bar = document.getElementById('status');
  if (!kind || kind === 'ok') { bar.hidden = true; return; }
  bar.hidden = false;
  elDot.className = 'dot ' + kind;
  elText.textContent = text;
}

function onFix(pos) {
  const c = pos.coords;
  fix = { lat: c.latitude, lon: c.longitude, accuracy: c.accuracy, t: Date.now() };

  setStatus(onSheet(toFraction(fix.lat, fix.lon)) ? 'ok' : 'warn',
            "You're outside the area this map covers");
  place();
}

function onGeoError(err) {
  setStatus('bad',
    err.code === err.PERMISSION_DENIED ? 'Location permission denied — allow it for this site'
    : err.code === err.POSITION_UNAVAILABLE ? 'No GPS fix — try stepping into the open'
    : 'GPS timed out — still trying');
}

function startGeolocation() {
  if (!('geolocation' in navigator)) return setStatus('bad', 'This browser has no GPS support');
  if (!window.isSecureContext) return setStatus('bad', 'Needs https:// — GPS is blocked on plain http');
  navigator.geolocation.watchPosition(onFix, onGeoError, {
    enableHighAccuracy: true, maximumAge: 2000, timeout: 30000
  });
}

/* ------------------------------------------------------------------ *
 * Legend drawer
 * ------------------------------------------------------------------ */
const drawer = $('drawer'), scrim = $('scrim'), legendBtn = $('legendBtn');

function setDrawer(open) {
  drawer.hidden = !open;
  scrim.hidden = !open;
  legendBtn.setAttribute('aria-expanded', String(open));
  legendBtn.hidden = open;
}

$('build').textContent = BUILD;
legendBtn.addEventListener('click', () => setDrawer(true));
scrim.addEventListener('click', () => setDrawer(false));
$('drawerClose').addEventListener('click', () => setDrawer(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') setDrawer(false); });

/* ------------------------------------------------------------------ */

/* Keep the page fixed. `touch-action: none` covers Chrome and Android, but
 * iOS Safari ignores both that and `user-scalable=no` for pinch, and desktop
 * browsers zoom on ctrl+wheel — so block those explicitly. */
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, e => e.preventDefault(), { passive: false });
}
document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault());

setInterval(() => {
  if (fix && Date.now() - fix.t > 30000) setStatus('warn', 'GPS signal lost');
}, 5000);

/* ------------------------------------------------------------------ *
 * Offline caching — OFF while we iterate in the browser.
 *
 * A registered worker keeps serving its own cached copy, which silently
 * hides edits. Removing the register() call is not enough: one already
 * installed stays in control, so we actively unregister and bin the
 * caches. Flip OFFLINE_CACHE back to true before this goes on a phone.
 * ------------------------------------------------------------------ */
const OFFLINE_CACHE = false;

if ('serviceWorker' in navigator) {
  if (OFFLINE_CACHE) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  } else {
    navigator.serviceWorker.getRegistrations()
      .then(rs => {
        if (rs.length) console.warn(`[marvista] removing ${rs.length} service worker(s) — reload once more if you still see stale files`);
        return Promise.all(rs.map(r => r.unregister()));
      })
      .catch(() => {});
    if (window.caches) {
      caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).catch(() => {});
    }
  }
}

/* ------------------------------------------------------------------ *
 * Start
 *
 * Runs last so every const above is initialised. Deliberately not inside
 * requestAnimationFrame: a background tab is never given a frame, and the
 * places would silently never be built.
 * ------------------------------------------------------------------ */
buildPlaces();
applyView();
