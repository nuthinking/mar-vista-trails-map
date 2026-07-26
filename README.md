# Mar Vista Trails — live GPS on the map

A single page showing the Mar Vista trails map (Guanacaste, Costa Rica) with
your phone's GPS position on it as a blue dot. Pinch to zoom up to 2x, drag to
pan. No chrome unless something is wrong.

```
index.html          markup + the legend drawer
app.js              georeference, marker, pan/zoom, drawer
styles.css
2k-map.webp         the map — 249 KB, the only asset the app loads
manifest.webmanifest, icons/     "Add to Home Screen"
sw.js               offline cache — NOT registered, see below

map.png             the original photo of the paper map, legend and all.
                    Archival, never loaded — everything else derives from it.
mar-vista-trails.png  logo, source for every icon
calibrate.html      dev tool: overlays 2k-map.webp on satellite imagery to
                    re-derive the georeference
```

Total app payload: **281 KB**, of which 249 KB is the map.

## The georeference

The paper map carries no coordinates, so it was matched to satellite imagery by
overlaying it in `calibrate.html` and lining the road network up by hand.

The sheet covers **1425.9 x 2567.4 m** with the reference point at
**(0.50045, 0.49018)** of the image — not its centre.

Reference point `10.417722, -85.772692`, map drawn **3.62 degrees
anticlockwise** of north.

The 2k map is an extended redraw on a taller canvas. Its geometry was
**measured, not assumed** — ten trail-head squares matched against the scan give

    x_ai = 1.0085 * x_paper - 0.0038
    y_ai = 0.64424 * y_paper + 0.16806

predicting every point to within 0.0012 of the sheet (about 3 px). The map sits
27 px above the image centre, so the extension is slightly deeper below than
above.

Three printed distances agree with a paper width of 1438 m: the `0.64 K`
entrance road, the `0.3 K` link north of Dos Rios and the `2.1 K` Black
"Diamond" loop. As an independent check, converting the map's tennis-courts
symbol back to coordinates lands on the real courts.

Expect roughly **10-20 m**. That ceiling is the map itself — a drawing with
smoothed roads, not a survey — and phone GPS under tree cover adds 5-15 m.

**Off the map:** nothing is drawn and the status bar says so. The dot is never
clamped to the edge, which would claim you are at the boundary when you might
be a kilometre past it.

## Offline caching is OFF

`OFFLINE_CACHE = false` in `app.js`. It does more than skip registration — an
installed worker stays in control and keeps serving its own cached copy, so the
app actively unregisters any worker and deletes every cache on load. Set it
back to `true` before putting this on a phone for real, and bump `CACHE` in
`sw.js` on every change.

This bit us repeatedly: a stale worker serves a stale `app.js`, which is the
very file that would have fixed it. To break that loop by hand, run this in the
console for **the exact origin the page was loaded from** (`localhost:8712`,
`127.0.0.1:5500` and any ngrok URL are all separate), then reload twice:

```js
navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
```

On iOS this works from Mac Safari's Web Inspector over USB. Note that Safari's
`Develop -> Disable Caches` does **not** touch service workers.

**Build stamp.** `app.js` logs `[marvista] build ...` to the console and shows
the same string at the foot of the legend drawer. Asset URLs carry `?v=` for
the same reason — without it browsers serve a stale stylesheet while the HTML
updates, which looks exactly like a broken layout.

## Gotchas worth remembering

* **Safari needs `width`/`height` on an SVG**, not just a `viewBox`. Chrome
  infers intrinsic size from the viewBox; Safari does not.
* **Geolocation needs HTTPS or `localhost`.** Over plain `http://` on a LAN IP
  the map renders but the dot never appears; the status bar says so.
* **Lossless WebP loses to PNG** on flat artwork — q100 came out at 2532 KB
  against the PNG's 2243 KB. q80 is 249 KB with 1.6% error on the drawn lines.
  No PNG fallback is shipped: WebP has been in Safari since iOS 14, and the
  fallback would have added 2.2 MB to the offline cache for nobody.
* The accuracy halo is sized from `offsetWidth`, not `getBoundingClientRect()`
  — the latter includes the zoom transform and would grow quadratically.
