'use strict';

/* ------------------------------------------------------------------ *
 * Georeference
 *
 * Derived by overlaying the paper map on satellite imagery (see
 * calibrate.html). The drawn panel sits inside map.png at offset
 * (37, 82) and is 719 x 827 px, so its centre is pixel (396.5, 495.5).
 *
 * Cross-checked against three distance labels printed on the map — the
 * 0.64 K entrance road, the 0.3 K link north of Dos Rios and the 2.1 K
 * Black "Diamond" loop — which all agree at 2.0 metres per pixel.
 * ------------------------------------------------------------------ */
const CAL = {
  refPx: 396.5,
  refPy: 495.5,
  refLat: 10.417722,
  refLon: -85.772692,
  metresPerPixel: 2.0,
  rotationDeg: -3.62     // positive = map drawn clockwise of north-up
};

// The drawn map inside map.png. Outside this rectangle we are off the map.
const PANEL = { x: 37, y: 82, w: 719, h: 827 };

const M_PER_DEG_LAT = 110574;
const _t = CAL.rotationDeg * Math.PI / 180;
const AX = [Math.cos(_t), -Math.sin(_t)];   // image +x, in (east, north) metres
const AY = [-Math.sin(_t), -Math.cos(_t)];  // image +y
const MPD_LON = 111320 * Math.cos(CAL.refLat * Math.PI / 180);

/** lat/lon -> map.png pixel coordinates */
function toPixel(lat, lon) {
  const E = (lon - CAL.refLon) * MPD_LON;
  const N = (lat - CAL.refLat) * M_PER_DEG_LAT;
  return {
    x: CAL.refPx + (E * AX[0] + N * AX[1]) / CAL.metresPerPixel,
    y: CAL.refPy + (E * AY[0] + N * AY[1]) / CAL.metresPerPixel
  };
}

const onMap = p => p.x >= PANEL.x && p.x <= PANEL.x + PANEL.w &&
                   p.y >= PANEL.y && p.y <= PANEL.y + PANEL.h;

/* ------------------------------------------------------------------ */

const cv = document.getElementById('map');
const ctx = cv.getContext('2d');
const img = new Image();
const elDot = document.getElementById('statusDot');
const elText = document.getElementById('statusText');

let imgReady = false;
let fix = null;                        // { lat, lon, accuracy, t }
let scale = 1, originX = 0, originY = 0;   // map.png -> screen

function layout() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (!imgReady) return;
  scale = Math.min(w / img.width, h / img.height);
  originX = (w - img.width * scale) / 2;
  originY = (h - img.height * scale) / 2;
  draw();
}

function draw() {
  if (!imgReady) return;
  const w = cv.clientWidth, h = cv.clientHeight;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#e8e6dc';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, originX, originY, img.width * scale, img.height * scale);

  if (!fix) return;
  const p = toPixel(fix.lat, fix.lon);
  if (!onMap(p)) return;

  const x = originX + p.x * scale;
  const y = originY + p.y * scale;

  // GPS accuracy, drawn at the map's real scale
  const r = (fix.accuracy / CAL.metresPerPixel) * scale;
  if (r > 3) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40,120,255,.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,120,255,.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#1a73e8';
  ctx.fill();
}

function setStatus(kind, text) {
  elDot.className = 'dot ' + kind;
  elText.textContent = text;
}

/* ------------------------------------------------------------------ */

function onFix(pos) {
  const c = pos.coords;
  fix = { lat: c.latitude, lon: c.longitude, accuracy: c.accuracy, t: Date.now() };

  if (!onMap(toPixel(fix.lat, fix.lon))) {
    setStatus('warn', "You're outside the area this map covers");
  } else {
    setStatus(fix.accuracy <= 25 ? 'ok' : 'warn', `± ${Math.round(fix.accuracy)} m`);
  }
  draw();
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

/* ------------------------------------------------------------------ */

img.addEventListener('load', () => { imgReady = true; layout(); startGeolocation(); });
img.addEventListener('error', () => setStatus('bad', 'Could not load map.png'));
img.src = 'map.png';

window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 250));

/* Keep the page fixed. `touch-action: none` covers Chrome and Android, but
 * iOS Safari ignores both that and `user-scalable=no` for pinch, and desktop
 * browsers zoom on ctrl+wheel — so block those explicitly. */
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, e => e.preventDefault(), { passive: false });
}
document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault());

// Go grey if the fix stops updating, so a frozen dot never looks live.
setInterval(() => {
  if (fix && Date.now() - fix.t > 30000) setStatus('warn', 'GPS signal lost');
}, 5000);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
