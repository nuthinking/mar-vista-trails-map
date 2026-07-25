# Mar Vista Trails — live GPS on the paper map

A single page that shows the Mar Vista trails map (Guanacaste, Costa Rica) with
your phone's GPS position drawn on it as a blue dot. That's all it does.

The whole image — map and legend — is scaled to fit the screen, so there is
nothing to zoom, pan or tap. No dependencies, no build step, works offline once
loaded.

```
index.html      the app
app.js          georeference + drawing + GPS
styles.css
map.png         the scanned trails map (787 × 1280)
sw.js           service worker — caches everything for offline use
manifest.webmanifest, icons/     "Add to Home Screen" support

calibrate.html  dev tool: overlays the map on satellite imagery to re-derive
                the georeference. Not needed to run the app.
panel.png       the map area cropped out of map.png, used only by calibrate.html
```

## Running it

Geolocation only works on `https://` or `localhost`. Locally:

```sh
python3 -m http.server 8712
# then open http://localhost:8712/
```

To use it on a phone it needs HTTPS. Drop the folder onto Netlify Drop or
Cloudflare Pages, or push it to a repo and turn on GitHub Pages — it is all
static files. Then open the URL on the phone and use **Add to Home Screen**;
after the first load it runs with no signal.

## The georeference

The paper map carries no coordinates, so it was matched to satellite imagery by
overlaying it in `calibrate.html` and lining the road network up by hand. The
result is one block at the top of `app.js`:

| | |
|---|---|
| Reference pixel | `(396.5, 495.5)` in `map.png` — the centre of the drawn panel |
| Reference position | `10.417722, −85.772692` |
| Scale | **2.0 metres per pixel** |
| Rotation | **3.62° anticlockwise** of north-up |

Three independent checks agree with this fit:

* the map's own `0.64 K` label on the entrance road,
* its `0.3 K` label on the link north of Dos Rios,
* its `2.1 K` label on the Black "Diamond" loop.

As a fourth check, converting the map's tennis-courts symbol back to
coordinates lands on the real courts, and the fitness-centre and Gracia symbols
land on the buildings Google labels with those names.

Expect roughly **10–20 m** of agreement. That ceiling is the paper map itself —
it is a drawing with smoothed, simplified roads, not a survey — and phone GPS
under tree cover adds another 5–15 m. The shaded ring around the dot is the
GPS accuracy, drawn at the map's own scale.

### Re-tuning it

Open `calibrate.html` on the local server. It draws `panel.png` over Esri
satellite tiles with controls for centre, scale and rotation (arrow keys move,
`+`/`−` scale, `[`/`]` rotate, hold Shift for fine steps). The panel prints the
resulting numbers; copy them into `CAL` in `app.js`.

`panel.png` is `map.png` cropped to the drawn area — offset `(37, 82)`, size
`719 × 827`. Its centre is pixel `(396.5, 495.5)` of the full image, which is
why that is the reference point. The same rectangle is `PANEL` in `app.js`,
used to decide whether you are on or off the map.

## Note

**`sw.js` caches aggressively.** After changing any file, bump `CACHE`
(`marvista-v2` → `-v3`) or the phone will keep serving the old version.
