# deck.gl Integration Research

Research for rendering 3D flight path lines above terrain in MapLibre GL JS v5 globe mode.

## Problem

MapLibre's `line` layer is a 2D feature draped on terrain. There are no native paint properties
(`line-z-offset`, `line-elevation-reference`, etc.) to float a line above the surface — z coordinates
in GeoJSON are silently ignored when terrain is enabled. This is a fundamental limitation of the layer type.

---

## Integration Overview

`@deck.gl/mapbox` v9.2.9 (actively maintained, published March 2026) is the official integration
package. It exposes `MapboxOverlay`, which attaches deck.gl rendering onto a MapLibre map instance.

```ts
import { MapboxOverlay } from '@deck.gl/mapbox'

const overlay = new MapboxOverlay({ layers: [] })
map.addControl(overlay)

// Update layers at any time
overlay.setProps({ layers: [...] })
```

Two rendering modes via the `interleaved` prop:
- `false` (default) — separate canvas on top of MapLibre; simpler but no z-ordering with map labels
- `true` — deck.gl renders into MapLibre's WebGL2 context; enables proper occlusion and label ordering

For flight paths floating above terrain, **`interleaved: false`** is the safer choice — the 3D lines
will always render on top without depth-fighting issues.

**Constraints:**
- ViewState is managed by MapLibre (deck.gl ignores `viewState`/`controller`)
- Single synchronized `MapView` only (no multi-view)
- WebGL2 required for interleaved mode

---

## Layer Options

### ArcLayer

Best for simple point-to-point great-circle arcs. Designed exactly for flight connections.

```ts
import { ArcLayer } from '@deck.gl/layers'

new ArcLayer({
  id: 'flights',
  data: segments,                          // [{ from: [lng, lat], to: [lng, lat] }, ...]
  getSourcePosition: d => d.from,
  getTargetPosition: d => d.to,
  getSourceColor: [96, 165, 250],          // TRANSPORT_COLORS mapped to RGB
  getTargetColor: [96, 165, 250],
  getHeight: 0.5,                          // Arc elevation multiplier (0 = flat, 1 = very tall)
  getWidth: 3,
  widthUnits: 'pixels',
  greatCircle: true,                       // Shortest path on Earth surface
  numSegments: 100,                        // Smoothness
})
```

**Pros:** Zero setup — just source + target points, handles the arc shape itself.
**Cons:** No built-in progressive reveal. No support for the existing `geodesicPath()` coordinate
arrays (it only takes start/end, not intermediate points).

---

### PathLayer

Accepts arbitrary `[lng, lat, altMeters][]` arrays — compatible with the existing `geodesicPath()`
output. This is the natural drop-in for the current route rendering.

```ts
import { PathLayer } from '@deck.gl/layers'

new PathLayer({
  id: `route-${wp.id}`,
  data: [{ path: pair.rootCoords }],       // rootCoords already has [lng, lat, alt] for fly mode
  getPath: d => d.path,
  getColor: hexToRgb(TRANSPORT_COLORS[wp.transportMode]),
  getWidth: 4,
  widthUnits: 'pixels',
  widthMinPixels: 2,
  capRounded: true,
  jointRounded: true,
  billboard: false,                        // Render in true 3D, not screen-space
})
```

**Pros:** Uses existing coordinate data as-is. Altitude is respected — line floats above terrain.
**Cons:** Each segment renders as a flat ribbon; can go nearly invisible when viewed exactly edge-on
during globe rotation (the "flat surface" problem). In practice this is rarely noticeable for
flight paths viewed from above or at standard pitch angles.

---

## Progressive Reveal Animation

Neither `ArcLayer` nor `PathLayer` has a built-in equivalent to MapLibre's `line-gradient` +
`line-progress` GPU trick. The replacement pattern is **slicing the coordinate array per frame**:

```ts
// In the rAF animation loop:
const progress = Math.min((performance.now() - start) / DURATION, 1)
const sliceEnd = Math.max(2, Math.ceil(progress * allCoords.length))
const revealedCoords = allCoords.slice(0, sliceEnd)

overlay.setProps({
  layers: [
    new PathLayer({
      id: `route-${wp.id}`,
      data: [{ path: revealedCoords }],
      getPath: d => d.path,
      getColor: hexToRgb(color),
      getWidth: 4,
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
      billboard: false,
    }),
  ],
})
```

`overlay.setProps()` is cheap — deck.gl diffs the layer props and only re-uploads geometry that
changed. With 100-point paths this is fast enough to run every rAF tick.

The tip marker and bearing rotation logic stays unchanged (it uses `allCoords[tipIdx]` which is
independent of the deck.gl layer).

---

## Recommended Migration Strategy

### What changes

| Current (MapLibre) | Replacement (deck.gl) |
|---|---|
| `map.addSource(sourceId, { type: 'geojson', lineMetrics: true, ... })` | Removed |
| `map.addLayer({ type: 'line', ... })` | `new PathLayer({ ... })` |
| `map.setPaintProperty(layerId, 'line-gradient', [...])` | `overlay.setProps({ layers: [...] })` |
| `map.setPaintProperty(layerId, 'line-opacity', 0)` | Remove layer from the layers array |
| `activeLayerIdsRef` tracking set | `layersRef` array passed to overlay |

### What stays the same

- `geodesicPath()` — output format is already `[lng, lat, alt][]`, perfect for `PathLayer`
- `fetchOSRMRoute()` and ground-level coords for drive/walk — `PathLayer` renders them correctly too
- MapLibre `Marker` for waypoint dots and the tip icon — unaffected
- `flyTo` animation — unaffected
- `restoreAllRoutes` / stop animation logic — just swap `setPaintProperty` calls for `overlay.setProps`

### New dependency

```
@deck.gl/core @deck.gl/layers @deck.gl/mapbox
```

All three are part of the deck.gl monorepo and ship at the same version. No Vite config changes
needed — deck.gl v9+ is fully ESM-native.

---

## Bundle Size

Deck.gl adds roughly **200–400 KB gzipped** to the bundle (core + layers + mapbox adapter),
depending on tree-shaking. Importing only `PathLayer` from `@deck.gl/layers` rather than the
whole barrel export helps significantly.

The project already uses `vite-plugin-cross-origin-isolation` (for FFmpeg.wasm), which also
satisfies any SharedArrayBuffer requirements that deck.gl may need.

---

## Alternative: ArcLayer for Fly Mode Only

If exact geodesic path fidelity matters less than visual impact, using `ArcLayer` for `fly` routes
and `PathLayer` for drive/walk/train is a clean split:

- `ArcLayer` handles flight arcs automatically with `greatCircle: true` — no geodesic math needed
- `PathLayer` handles ground routes with OSRM coordinates (no altitude, just lat/lng)

For animation, both layers would use the slice-per-frame pattern, or for `ArcLayer` you could
animate `getWidth` from 0 → 4 pixels as a fade-in (less precise but zero geometry updates).

---

## Conclusion

**`PathLayer` is the cleanest path forward.** It:
1. Accepts the existing `[lng, lat, altMeters][]` output from `geodesicPath()` unchanged
2. Floats the line above terrain because deck.gl renders in true 3D
3. Works with MapLibre v5 globe projection
4. Is actively maintained at the same cadence as the rest of deck.gl

The main trade-off is replacing the `line-gradient` GPU animation with a slice-per-frame approach,
which is slightly more CPU-side work but negligible for 100-point paths.
