# Route Animation System

## Overview

Animated route reveal between waypoints, synced with MapLibre's `flyTo` camera transition. Each segment draws a route line progressively while a transport icon follows the tip.

## Icon System

White SVG silhouettes on solid 40px circles with glow. Defined in `TRANSPORT_SVG` (`src/pages/EditorPage.tsx`).

| Mode | Icon | Color |
|------|------|-------|
| fly | airplane | `#60a5fa` |
| drive | car | `#fbbf24` |
| train | locomotive | `#f87171` |
| walk | person | `#34d399` |

All SVGs point **UP** (north = 0°).

**Fly mode** — rotation is computed in **screen space**: both the current and previous arc point are projected to canvas pixels via `ArcCustomLayer.projectToScreen()`, then `atan2(dy, dx) + 90°` gives the CSS clockwise angle. This keeps the icon correctly aligned along the arc under any camera zoom, pitch, or globe tilt.

**Non-fly modes** — the icon is never rotated; it stays upright.

## FlyTo Sync

Route progress is driven by MapLibre's `move` event during `flyTo`, not by elapsed time. This keeps the route reveal in sync with the camera regardless of distance or easing.

```
progress = haversine(startCoord, cameraCenter) / haversine(startCoord, endCoord)
```

The `moveend` event resolves the segment promise (replaces `setTimeout`).

## Fly-Mode: 3D Arc Projection

Fly routes render as elevated 3D arcs via Three.js (`ArcCustomLayer`). The airplane icon must sit **on the arc**, not on the ground.

**How it works:**

1. `ArcCustomLayer.render()` stores the MVP matrix each frame
2. `ArcCustomLayer.projectToScreen(lng, lat, altMeters)` projects a globe coordinate to screen pixels:
   - Converts lng/lat/alt to unit-sphere via `lngLatAltToGlobe()`
   - Multiplies by the stored MVP matrix
   - Converts NDC to canvas pixel coordinates
3. The airplane is a raw absolutely-positioned DOM element (`flyTipElRef`), positioned via CSS `transform: translate(x, y)` from the projection result
4. The element is hidden/shown using `display: none` / `display: flex` (not `''`) to preserve the flexbox centering that keeps the SVG icon centered in the blue circle

Non-fly modes use a standard MapLibre `Marker` (ground-level, no altitude).

## Animation Flow

```
1. Hide all routes (arcs + MapLibre lines)
2. flyTo first waypoint (2000ms)
3. For each segment:
   a. Create tip icon (fly: DOM element, other: MapLibre Marker)
   b. Register arc segment (fly) or prepare GeoJSON source (other)
   c. Start flyTo + listen to 'move' events
   d. On each move: compute progress, reveal route, move icon
   e. On moveend: ensure progress=1, clean up listener
   f. Remove tip, push completed segment
   g. 600ms pause before next segment
4. Restore all routes to fully visible
```

## Key Files

| File | Role |
|------|------|
| `src/pages/EditorPage.tsx` | Animation orchestration, tip markers, sync logic |
| `src/lib/map/ArcCustomLayer.ts` | Three.js arc rendering, MVP projection |
| `src/lib/map/pathUtils.ts` | Route fetching (geodesic / OSRM), transport modes |
| `src/hooks/useRouteCoords.ts` | Route data state management |

---

# Optimization Plan

## Current Architecture Assessment

The animation system is functional and well-structured with:
- Camera-synced progress (haversine-based, not time-based) — correct approach
- GPU-efficient arc rendering (Three.js `Line2` with `instanceCount` reveal)
- Proper abort handling for route fetches

However, several areas have room for optimization at the JS layer, GPU layer, and UX layer.

---

## Optimization 1: Throttle Icon Bearing Calculation

**Priority: High | Effort: Low | Impact: ~85% fewer trig calculations per segment**

### Problem

During fly-mode animation, `updateSegmentProgress` runs on every MapLibre `move` event (~60/sec). Each call computes:
1. `arcLayer.projectToScreen()` for the current tip point (matrix multiply + trig)
2. `arcLayer.projectToScreen()` for the previous point (same)
3. `Math.atan2()` + degree conversion for SVG rotation

This is ~120 matrix multiplications + trig calls per second just for icon rotation.

### Solution

Only recompute bearing when the tip has moved a meaningful number of pixels (threshold: 2px). Cache the last screen position and skip rotation updates when delta < threshold.

```typescript
// In playAnimation, before the segment loop:
let lastScreenX = 0, lastScreenY = 0

// Inside updateSegmentProgress, fly-mode icon positioning:
if (el) {
  const screen = arcLayer.projectToScreen(tipCoord[0], tipCoord[1], tipCoord[2] ?? 0)
  if (screen) {
    el.style.transform = `translate(${screen.x - 20}px, ${screen.y - 20}px)`
    el.style.display = 'flex'

    // Only recompute bearing if tip moved > 2px on screen
    const dx = screen.x - lastScreenX
    const dy = screen.y - lastScreenY
    if (dx * dx + dy * dy > 4) {
      const svg = el.firstElementChild as HTMLElement | null
      if (svg) {
        const screenBearing = Math.atan2(dy, dx) * (180 / Math.PI) + 90
        svg.style.transform = `rotate(${screenBearing}deg)`
      }
      lastScreenX = screen.x
      lastScreenY = screen.y
    }
  } else {
    el.style.display = 'none'
  }
}
```

**Benefit**: Eliminates the second `projectToScreen` call entirely (uses cached delta instead), and skips rotation CSS updates when the icon barely moved. Reduces per-frame work from 2 projections + atan2 to 1 projection + a distance check.

---

## Optimization 2: Replace GeoJSON `setData` with `line-gradient` Progressive Reveal

**Priority: High | Effort: Medium | Impact: Eliminates per-frame JS→GPU geometry re-upload for ground routes**

### Problem

For non-fly modes (drive/train/walk), each `move` event triggers `updateMaplibreRoute()` which calls `GeoJSONSource.setData()` with a sliced coordinate array. This:
1. Serializes the GeoJSON to the worker thread
2. Re-parses and re-tiles the geometry
3. Uploads new vertex buffers to the GPU

At 60 events/sec, this is a heavy serialization + GPU upload pipeline for every frame.

### Solution

Use MapLibre's `line-gradient` paint property with `line-progress` expressions. The full route geometry is uploaded **once** with `lineMetrics: true` on the GeoJSON source. Progressive reveal is achieved by updating the `line-gradient` expression — a paint-only change that doesn't re-upload geometry.

`line-gradient` uses `['line-progress']` (a value from 0 to 1 along the line length) to apply a color ramp. By setting the color to transparent beyond the current progress point, we get a reveal effect.

```typescript
// When creating the route source (once, with lineMetrics enabled):
map.addSource(sourceId, {
  type: 'geojson',
  lineMetrics: true,  // required for line-gradient / line-progress
  data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
})

map.addLayer({
  id: layerId,
  type: 'line',
  source: sourceId,
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-width': 6,
    'line-opacity': 0.9,
    // line-gradient replaces line-color (they are mutually exclusive)
    'line-gradient': buildRevealGradient(color, 0),  // initially hidden
  },
})

// Helper: build a gradient expression that reveals the line up to `progress` (0–1)
function buildRevealGradient(color: string, progress: number) {
  // Clamp to avoid degenerate expressions
  const p = Math.max(0.001, Math.min(progress, 0.999))
  return [
    'interpolate', ['linear'], ['line-progress'],
    0,         color,
    p,         color,
    p + 0.001, 'rgba(0,0,0,0)',
    1,         'rgba(0,0,0,0)',
  ]
}

// During animation (per move event) — paint property update only, no geometry change:
map.setPaintProperty(layerId, 'line-gradient', buildRevealGradient(color, progress))

// After animation — fully reveal:
map.setPaintProperty(layerId, 'line-gradient', buildRevealGradient(color, 1))
```

**Changes required:**
1. `addMaplibreRoute()` — add `lineMetrics: true` to source, replace `'line-color'` with `'line-gradient'` in paint
2. `updateSegmentProgress()` — replace `updateMaplibreRoute(map, wp.id, revealedCoords)` with `setPaintProperty(layerId, 'line-gradient', buildRevealGradient(color, progress))`
3. `updateMaplibreRoute()` — no longer called during animation (still useful for static updates)
4. `restoreAllRoutes()` — set gradient to `progress=1` (fully visible)

**Note**: `line-gradient` and `line-color` are mutually exclusive — when using `line-gradient`, remove `line-color` from the paint spec.

**Benefit**: Geometry is uploaded once. Per-frame updates are paint-only (expression swap), skipping the expensive GeoJSON serialize → parse → tile → GPU upload pipeline.

---

## Optimization 3: Reuse `Vector4` in `projectToScreen`

**Priority: Medium | Effort: Low | Impact: Eliminates ~60 object allocations/sec per animated segment**

### Problem

`projectToScreen()` creates a new `THREE.Vector4` on every call:
```typescript
const vec = new THREE.Vector4(gx, gy, gz, 1).applyMatrix4(this._mvpMatrix)
```

During animation this is called 60+ times/sec. Each call allocates and immediately discards an object.

### Solution

Reuse a class-level `Vector4`:

```typescript
// In ArcCustomLayer class:
private _projVec = new THREE.Vector4()

projectToScreen(lng: number, lat: number, altMeters: number): { x: number; y: number } | null {
  const [gx, gy, gz] = lngLatAltToGlobe(lng, lat, altMeters)
  const vec = this._projVec.set(gx, gy, gz, 1).applyMatrix4(this._mvpMatrix)
  if (vec.w <= 0) return null
  const ndcX = vec.x / vec.w
  const ndcY = vec.y / vec.w
  const canvas = this.map!.getCanvas()
  return {
    x: ((ndcX + 1) / 2) * canvas.clientWidth,
    y: ((1 - ndcY) / 2) * canvas.clientHeight,
  }
}
```

**Benefit**: No allocation per call. Marginal GC pressure reduction — adds up over thousands of frames.

---

## Optimization 4: Stop `triggerRepaint` When Not Animating

**Priority: Medium | Effort: Low | Impact: Eliminates continuous GPU rendering when idle**

### Problem

`ArcCustomLayer.render()` unconditionally calls `this.map?.triggerRepaint()` at the end:

```typescript
render(gl, args) {
  // ... render ...
  this.map?.triggerRepaint()
}
```

This forces MapLibre to re-render every frame (60 FPS continuously), even when no animation is playing and the arcs are static. This burns CPU/GPU and battery on mobile.

### Solution

Only trigger repaint when there's an active animation:

```typescript
// Add to ArcCustomLayer:
private _animating = false

setAnimating(value: boolean) {
  this._animating = value
  if (value) this.map?.triggerRepaint()  // kick off the loop
}

render(gl, args) {
  this._mvpMatrix.fromArray(args.modelViewProjectionMatrix)
  this.camera.projectionMatrix.copy(this._mvpMatrix)
  this.renderer.resetState()
  this.renderer.render(this.scene, this.camera)
  if (this._animating) this.map?.triggerRepaint()
}
```

Call `arcLayer.setAnimating(true)` at animation start, `arcLayer.setAnimating(false)` at the end.

**Note**: MapLibre still repaints on user interaction (pan/zoom/rotate) and `flyTo`, so static arcs will still render correctly when the user moves the camera — those frames are triggered by MapLibre's own internal repaint requests.

**Benefit**: Eliminates idle GPU work. Significant battery savings on laptops/mobile.

---

## Optimization 5: Batch MapLibre Route Opacity Updates

**Priority: Low | Effort: Low | Impact: Minor — reduces API call overhead**

### Problem

At animation start, each non-fly route is faded out individually:
```typescript
for (const id of mapRouteLinesRef.current) {
  setMaplibreRouteOpacity(map, id, 0)
}
```

Each `setPaintProperty` call triggers a style diff and potential repaint scheduling.

### Solution

With `line-gradient` (Optimization 2), the route is hidden by setting the gradient to `progress=0` (fully transparent). This means `setMaplibreRouteOpacity()` is no longer needed inside `updateSegmentProgress` — visibility is fully controlled by the gradient. At animation start, set all ground route gradients to `progress=0` instead of setting opacity to 0. At animation end, restore gradients to `progress=1`.

If `line-gradient` is adopted, this optimization is automatically resolved.

---

## Optimization 6: Parallelize Route Fetching

**Priority: Medium | Effort: Low | Impact: Faster route loading when adding multiple waypoints**

### Problem

When a sequence of waypoints is loaded (e.g., from a `.mapcut` import), each route segment is fetched sequentially as `onWaypointAdded` fires one at a time.

### Solution

Add a bulk fetch method to `useRouteCoords`:

```typescript
const fetchAllRoutes = useCallback((waypoints: WaypointEntry[]) => {
  for (let i = 1; i < waypoints.length; i++) {
    fetchAndStore(
      waypoints[i - 1].id, waypoints[i - 1].coordinates,
      waypoints[i].id, waypoints[i].coordinates,
      waypoints[i].transportMode,
    )
  }
}, [fetchAndStore])
```

All OSRM requests fire concurrently via independent `fetch()` calls (already non-blocking). The `AbortController` per pair ensures stale responses are discarded correctly.

**Benefit**: Importing a 10-waypoint project fetches all 9 segments in parallel (~1 round trip) instead of sequentially (~9 round trips).

---

## Optimization 7: Pre-compute Animation Data Before Playback

**Priority: Medium | Effort: Medium | Impact: Cleaner animation loop, fewer lookups per frame**

### Problem

During `playAnimation`, each frame in the `move` handler:
1. Looks up `routeData[prevId][wpId]` from the React state
2. Recomputes `haversine(startCoord, endCoord)` (constant per segment, computed every frame)
3. Creates closures that capture waypoint state

### Solution

Before the animation loop begins, pre-compute a flat array of segment descriptors:

```typescript
interface AnimSegment {
  wp: WaypointEntry
  coords: number[][]
  color: string
  startCoord: [number, number]
  endCoord: [number, number]
  totalDist: number  // haversine(start, end), computed once
}

const segments: AnimSegment[] = []
for (let i = 1; i < waypoints.length; i++) {
  const wp = waypoints[i]
  const coords = routeData[waypoints[i - 1].id]?.[wp.id]?.rootCoords ?? []
  if (coords.length < 2) continue
  const start = coords[0] as [number, number]
  const end = coords[coords.length - 1] as [number, number]
  segments.push({
    wp,
    coords,
    color: TRANSPORT_COLORS[wp.transportMode],
    startCoord: start,
    endCoord: end,
    totalDist: haversine(start, end),
  })
}
```

**Benefit**: Zero per-frame property lookups or haversine recomputation. The animation loop becomes a clean iteration over a pre-built plan.

---

## Optimization 8: Configurable Animation Timing

**Priority: Low | Effort: Low | Impact: Better UX — shorter/longer flights per user preference**

### Problem

All segments use a hardcoded `DURATION = 3500` ms and `curve: 1.42`. Short hops (e.g., adjacent cities) feel too slow; intercontinental flights may feel rushed.

### Solution

Scale duration by geodesic distance:

```typescript
const baseDuration = 2500  // ms for a ~500km hop
const maxDuration = 6000   // ms cap for intercontinental
const duration = Math.min(baseDuration + seg.totalDist * 0.5, maxDuration)
```

Also expose `transitionDuration` per waypoint (already in the `Waypoint` data model in PLAN.md) to let users fine-tune individual segments.

---

## Implementation Order

| # | Optimization | Priority | Effort | Depends On |
|---|---|---|---|---|
| 1 | Throttle icon bearing | High | Low | — |
| 2 | `line-gradient` reveal | High | Medium | — |
| 3 | Reuse `Vector4` | Medium | Low | — |
| 4 | Stop idle `triggerRepaint` | Medium | Low | — |
| 5 | Batch opacity updates | Low | Low | #2 (auto-resolved) |
| 6 | Parallelize route fetching | Medium | Low | — |
| 7 | Pre-compute animation data | Medium | Medium | — |
| 8 | Configurable timing | Low | Low | #7 (nice pairing) |

**Recommended approach**: Start with #1 + #3 + #4 (quick wins, zero-risk), then #2 (`line-gradient` — biggest impact), then #7 + #8 together.
