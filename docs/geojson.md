# GeoJSON Route Animation

This document covers how routes are built, animated, and how terrain is handled in MapCut.

---

## How the route line works
  
All route animation is built on a single static MapLibre GeoJSON `LineString` source. The geometry is computed once when a waypoint is saved and stored in the `Waypoint` object in IndexedDB — it is never recomputed during playback.

```ts
{
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [[lng, lat], [lng, lat], ...],
  },
}
```

The line is revealed progressively during playback using MapLibre's `line-trim-offset` paint property — no per-frame geometry rebuilding needed.

```ts
// Fully hidden at start
map.setPaintProperty('route-line', 'line-trim-offset', [0, 1])

// Progressively reveal during flyTo (driven by requestAnimationFrame)
map.setPaintProperty('route-line', 'line-trim-offset', [0, trimEnd])

// Fully visible when arrived
map.setPaintProperty('route-line', 'line-trim-offset', [0, 0])
```

`line-trim-offset: [start, end]` hides the fraction of the line between `start` and `end`. So `[0, 0.5]` hides the second half, leaving the first half visible.

---

## Path source by transport mode

Transport mode is stored per waypoint transition:

```ts
interface Waypoint {
  // ...existing fields
  transportMode: 'fly' | 'drive' | 'train' | 'walk'
}
```

| Mode | Path source | Notes |
|---|---|---|
| `fly` | Geodesic great-circle interpolation | Planes follow great-circle routes |
| `drive` | OSRM driving API | Actual road network geometry |
| `train` | OSRM driving API (approximation) | No universal rail routing API; road route is close enough visually |
| `walk` | OpenRouteService foot-hiking | Covers OSM-mapped trails |

---

## Fallback chain (drive / train / walk)

Not all locations have routable road or trail data. Use this fallback order:

```
1. Primary routing API (OSRM for drive/train, ORS for walk)
   ↓ no route returned
2. Geodesic great-circle interpolation (straight line over the globe surface)
```

Example:
```ts
async function fetchRoute(
  from: [number, number],
  to: [number, number],
  mode: 'fly' | 'drive' | 'train' | 'walk',
): Promise<[number, number][]> {
  if (mode === 'fly') return geodesicPath(from, to)

  const coords = await tryRoutingAPI(from, to, mode)
  if (coords) return coords

  // Fallback: geodesic straight line
  console.warn('No route found, falling back to geodesic interpolation')
  return geodesicPath(from, to)
}
```

Geodesic interpolation is appropriate as a fallback even for ground transport — it at least produces a geometrically correct arc over the globe surface, which looks intentional rather than broken.

---

## Geodesic interpolation (fly + fallback)

A raw straight line between two distant points cuts through the Earth on the globe projection. Inserting ~100–150 intermediate great-circle points makes the line curve correctly over the surface.

This is implemented in Rust/Wasm (see [WASM_IMPROVEMENT.md](WASM_IMPROVEMENT.md) Slot 2) using the `geo` crate:

```ts
import { interpolatePath } from '../lib/wasm/geoUtils'

const coordinates = interpolatePath(
  [waypointA.coordinates, waypointB.coordinates],
  150, // points per segment
)
```

---

## Terrain following

**2D GeoJSON lines are automatically draped on terrain** when `map.setTerrain()` is active. No z-coordinates needed — MapLibre renders the line on the terrain mesh surface, so walking routes over mountain passes look correct for free.

```
Without terrain active:  line floats at sea level, clips through mountains
With terrain active:     2D line drapes on the terrain surface automatically
```

---

## Elevation data (optional — for camera and UI charts)

If you need per-point elevation (e.g., to keep the camera above terrain during a walking route animation, or to render an elevation profile chart), query MapTiler's elevation API using the same key:

```ts
const res = await fetch(
  `https://api.maptiler.com/elevation/point?lon=${lng}&lat=${lat}&key=${KEY}`
)
const { elevation } = await res.json() // meters above sea level
```

Add elevation as a z-coordinate to make a 3D `LineString`:
```ts
// [lng, lat] → [lng, lat, elevation_meters]
```

**Performance note**: Do not query once per interpolated point. Sample every 10th point and linearly interpolate elevation between samples.

Use cases:
- Camera `altitude` / `pitch` control along a walking route
- Elevation profile chart in the WaypointPanel UI

---

## Relevant files

| File | Role |
|---|---|
| `src/components/Globe/RoutePath.tsx` | MapLibre source + layer setup, `line-trim-offset` updates |
| `src/lib/map/pathUtils.ts` | GeoJSON construction, geodesic fallback |
| `src/lib/map/animate.ts` | Drives `line-trim-offset` in sync with `flyTo` |
| `src/lib/wasm/geoUtils.ts` | Rust/Wasm geodesic interpolation wrapper |
