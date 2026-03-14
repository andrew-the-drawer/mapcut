# Fix Three.js Arc Layer on MapLibre Globe

## Context

The `ArcCustomLayer` renders Three.js `Line2` arcs between waypoints on a MapLibre v5 globe. The arcs are currently **invisible**. The geodesic path calculation in `pathUtils.ts` is mathematically correct (standard slerp + sine altitude arc). The issue is in `ArcCustomLayer.ts`.

## Root Cause Analysis

**Two confirmed bugs + one minor bug**, verified by reading MapLibre v5.19 source code:

### Bug 1 (PRIMARY — arcs invisible): Wrong projection matrix + wrong coordinate space

The current code uses:
```typescript
this.camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix)
```
with Mercator [0,1] coordinates from `MercatorCoordinate.fromLngLat()`.

In **globe mode**, `defaultProjectionData.mainMatrix` comes from `VerticalPerspectiveTransform.getProjectionData()` — this is designed for MapLibre's internal tile shader pipeline (which converts tile→mercator→sphere in GLSL *before* applying this matrix). Using it directly with raw Mercator coords produces garbage output.

The correct matrix is **`args.modelViewProjectionMatrix`**, which in globe mode equals `_globeViewProjMatrixNoCorrection`. This matrix accepts **unit-sphere coordinates** directly (confirmed at `maplibre-gl-csp-dev.js:53507-53508`):
```javascript
// MapLibre internal usage:
const spherePos = projectTileCoordinatesToSphere(x, y, ...)
const vectorMultiplier = 1.0 + elevation / earthRadius
const pos = [spherePos[0]*vectorMultiplier, spherePos[1]*vectorMultiplier, spherePos[2]*vectorMultiplier, 1]
transformMat4(pos, pos, this._globeViewProjMatrixNoCorrection)
```

### Bug 2 (lines are 1px): Missing `linewidth` in LineMaterial

`_buildLine(coords, color, width = 3)` declares `width` but never passes it to `LineMaterial`. Default linewidth is 1px.

### Bug 3 (minor): `camera.matrixAutoUpdate` not disabled

Wastes computation; should be `false` since we set the projection matrix manually.

## Implementation Plan

All changes in `src/lib/map/ArcCustomLayer.ts`.

### Step 1: Replace coordinate conversion function

Replace `lngLatAltToMercator` with `lngLatAltToGlobe` using MapLibre's globe convention (`angularCoordinatesRadiansToVector` at line 52501):

```typescript
const EARTH_RADIUS = 6_371_008.8 // meters, matches MapLibre

function lngLatAltToGlobe(lng: number, lat: number, altMeters: number): [number, number, number] {
  const lngRad = (lng * Math.PI) / 180
  const latRad = (lat * Math.PI) / 180
  const r = 1.0 + altMeters / EARTH_RADIUS  // unit sphere + altitude ratio
  return [
    Math.sin(lngRad) * Math.cos(latRad) * r,  // X
    Math.sin(latRad) * r,                       // Y
    Math.cos(lngRad) * Math.cos(latRad) * r,   // Z
  ]
}
```

Update both `_buildLine()` and `updateAnimation()` to call `lngLatAltToGlobe` instead of `lngLatAltToMercator`.

### Step 2: Change projection matrix source

In `render()`:
```typescript
// BEFORE:
this.camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix)
// AFTER:
this.camera.projectionMatrix.fromArray(args.modelViewProjectionMatrix)
```

### Step 3: Fix linewidth

In `_buildLine()`, add `linewidth: width` to LineMaterial constructor.

### Step 4: Disable camera matrixAutoUpdate

In `onAdd()`, after creating camera:
```typescript
this.camera.matrixAutoUpdate = false
```

### Step 5: Depth test tuning (if needed)

If arcs are partially occluded after steps 1-4, switch to `depthTest: false, depthWrite: false` in LineMaterial. Since the arcs have altitude they should render above the globe, but depth buffer compatibility between MapLibre's globe and Three.js unit-sphere z-values may not be perfect.

## Verification

1. Add two waypoints with `fly` transport mode
2. Arcs should be visible as curved 3D lines above the globe surface
3. Play animation — arcs should progressively reveal
4. Rotate the globe — arcs on the back side should be occluded (if depthTest is on) or always visible (if off)
5. Zoom in past globe→mercator transition threshold — arcs may disappear (known limitation; globe-primary for now)

## Key Source References

- `maplibre-gl-csp-dev.js:52501` — `angularCoordinatesRadiansToVector` (globe coordinate convention)
- `maplibre-gl-csp-dev.js:53380` — `modelViewProjectionMatrix` getter = `_globeViewProjMatrixNoCorrection`
- `maplibre-gl-csp-dev.js:53507-53508` — how MapLibre transforms sphere coords with this matrix
- `maplibre-gl-csp-dev.js:53549-53554` — how `_globeViewProjMatrixNoCorrection` is constructed
- `maplibre-gl-csp-dev.js:59908-59922` — how custom layer render args are assembled
