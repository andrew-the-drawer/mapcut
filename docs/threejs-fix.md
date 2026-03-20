# Three.js Arc Layer on MapLibre Globe — Bug Fixes

## Context

The `ArcCustomLayer` renders Three.js `Line2` arcs between waypoints on a MapLibre v5 globe. All changes in `src/lib/map/ArcCustomLayer.ts`.

---

## Fix 1: Static arcs invisible (RESOLVED)

**Three bugs**, verified by reading MapLibre v5.19 source code:

### Bug 1a (PRIMARY): Wrong projection matrix + wrong coordinate space

Used `args.defaultProjectionData.mainMatrix` with Mercator `[0,1]` coordinates. In globe mode, that matrix is for MapLibre's internal tile shader pipeline — not for custom layer geometry.

**Fix:** Use `args.modelViewProjectionMatrix` (= `_globeViewProjMatrixNoCorrection` in globe mode) which accepts unit-sphere coordinates directly. Replace `lngLatAltToMercator` with `lngLatAltToGlobe`:

```typescript
const EARTH_RADIUS = 6_371_008.8
function lngLatAltToGlobe(lng: number, lat: number, altMeters: number): [number, number, number] {
  const lngRad = (lng * Math.PI) / 180
  const latRad = (lat * Math.PI) / 180
  const r = 1.0 + altMeters / EARTH_RADIUS
  return [
    Math.sin(lngRad) * Math.cos(latRad) * r,
    Math.sin(latRad) * r,
    Math.cos(lngRad) * Math.cos(latRad) * r,
  ]
}
```

### Bug 1b: Missing `linewidth` in LineMaterial

`_buildLine()` declared `width` but never passed it to `LineMaterial`. Default was 1px.

### Bug 1c (minor): `camera.matrixAutoUpdate` not disabled

Set to `false` since we assign the projection matrix manually each frame.

---

## Fix 2: Arc animation not drawing (RESOLVED)

### Root cause: Per-frame GPU buffer reallocation on a shared WebGL context

`updateAnimation()` called `geometry.setPositions()` every animation frame:

```typescript
// OLD — broken
updateAnimation(id: string, visibleCount: number): void {
  const sliced = entry.coords.slice(0, Math.max(2, visibleCount))
  const positions: number[] = []
  for (const pt of sliced) { /* ... */ positions.push(gx, gy, gz) }
  entry.line.geometry.setPositions(positions)   // ← allocates new InstancedInterleavedBuffer each frame
  entry.line.computeLineDistances()
}
```

`LineGeometry.setPositions()` creates an entirely new `InstancedInterleavedBuffer` (new GPU buffer object) each call. On a shared WebGL context where `renderer.resetState()` is called every frame (required for MapLibre coexistence), Three.js's internal buffer tracking (`WebGLAttributes`, `WebGLBindingStates`) loses track of the freshly-allocated buffers — the line silently disappears.

### Fix: Pre-allocate full geometry, animate via `instanceCount`

`LineGeometry` extends `InstancedBufferGeometry`. Each point-to-point segment is one GPU instance. Setting `geometry.instanceCount` controls how many segments the GPU draws — no buffer work needed.

```typescript
// setSegments — build line with ALL coords upfront
const line = this._buildLine(seg.coords, seg.color)       // full geometry
const totalSegments = Math.max(seg.coords.length - 1, 1)
line.geometry.instanceCount = visibleSegments              // show partial
this.segments.set(seg.id, { line, coords: seg.coords, totalSegments })

// updateAnimation — single integer assignment per frame
updateAnimation(id: string, visibleCount: number): void {
  const entry = this.segments.get(id)
  if (!entry) return
  const clamped = Math.max(2, Math.min(visibleCount, entry.coords.length))
  entry.line.geometry.instanceCount = clamped - 1
}
```

This is both correct (no buffer reallocation on shared GL context) and more performant (zero GPU allocation per frame).

---

## Verification

1. Add two waypoints with `fly` transport mode
2. Arcs should be visible as curved 3D lines above the globe surface
3. Play animation — arcs should progressively reveal (line draws from start to end)
4. Rotate the globe — arcs on the back side should be occluded (depthTest is on)
5. Zoom in past globe→mercator transition threshold — arcs may disappear (known limitation; globe-primary for now)

## Key Source References

- `maplibre-gl-csp-dev.js:52501` — `angularCoordinatesRadiansToVector` (globe coordinate convention)
- `maplibre-gl-csp-dev.js:53380` — `modelViewProjectionMatrix` getter = `_globeViewProjMatrixNoCorrection`
- `maplibre-gl-csp-dev.js:53507-53508` — how MapLibre transforms sphere coords with this matrix
- `maplibre-gl-csp-dev.js:53549-53554` — how `_globeViewProjMatrixNoCorrection` is constructed
- `maplibre-gl-csp-dev.js:59908-59922` — how custom layer render args are assembled
