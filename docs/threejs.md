# Replacing deck.gl with Three.js Custom Layer

## Problem
deck.gl `MapboxOverlay` renders in a **separate canvas** on top of MapLibre (overlay mode). This causes a depth buffer mismatch — 3D arc coordinates with altitude float visually when the camera tilts, and arc endpoints appear disconnected from the map/markers.

**Visual issue**: When tilting the map, fly-mode arcs don't stay attached to waypoint markers. They appear to float above the surface.

## Solution
Render arcs **inside** MapLibre's own WebGL pipeline via `CustomLayerInterface` with `renderingMode: '3d'`, sharing the same depth buffer. This ensures proper depth testing and camera-relative positioning at all tilt angles.

---

## Implementation Plan

### Dependencies
```bash
npm install three
npm install -D @types/three
npm uninstall @deck.gl/core @deck.gl/geo-layers @deck.gl/layers @deck.gl/mapbox
```

### File Changes

#### 1. New file: `src/lib/map/ArcCustomLayer.ts`

```typescript
import THREE from 'three'
import maplibregl from 'maplibre-gl'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'

// Convert [lng, lat, altMeters] to Mercator space for Three.js
function lngLatAltToMercator(lng: number, lat: number, alt: number): [number, number, number] {
  const mc = maplibregl.MercatorCoordinate.fromLngLat({ lng, lat }, alt)
  return [mc.x, mc.y, mc.z]
}

export interface ArcSegment {
  id: string
  coords: number[][]   // [lng, lat, altMeters][]
  color: string        // hex color
  visibleCount: number // coords.length = full arc; partial = animation
}

export class ArcCustomLayer implements maplibregl.CustomLayerInterface {
  readonly id = 'arc-layer'
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.Camera
  private segments = new Map<string, { line: Line2; coords: number[][] }>()
  private _mat = new Float32Array(16)
  private map?: maplibregl.Map
  private _resizeHandler?: () => void

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map

    // Share MapLibre's WebGL2 context
    const glContext = gl as WebGL2RenderingContext
    this.renderer = new THREE.WebGLRenderer({
      canvas: glContext.canvas as HTMLCanvasElement,
      context: glContext,
      antialias: true,
    })
    this.renderer.autoClear = false  // CRITICAL: never clear MapLibre's framebuffer

    this.scene = new THREE.Scene()
    this.camera = new THREE.Camera()

    // Handle canvas resize
    this._resizeHandler = () => {
      const canvas = glContext.canvas as HTMLCanvasElement
      const { clientWidth: w, clientHeight: h } = canvas
      this.segments.forEach(({ line }) => {
        (line.material as LineMaterial).resolution.set(w, h)
      })
    }
    map.on('resize', this._resizeHandler)
  }

  onRemove(_map: maplibregl.Map, _gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    if (this.map && this._resizeHandler) {
      this.map.off('resize', this._resizeHandler)
    }

    // Clean up all geometries and materials
    this.segments.forEach(({ line }) => {
      line.geometry.dispose()
      ;(line.material as LineMaterial).dispose()
      this.scene.remove(line)
    })
    this.segments.clear()
    this.renderer.dispose()
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: any): void {
    // Copy Float64Array to Float32Array (Three.js doesn't support Float64)
    const m = args.modelViewProjectionMatrix
    for (let i = 0; i < 16; i++) {
      this._mat[i] = m[i]
    }

    // Set camera matrix from MapLibre's projection
    this.camera.projectionMatrix.fromArray(this._mat)
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert()

    // Reset Three.js state after MapLibre's GL calls
    this.renderer.resetState()
    this.renderer.render(this.scene, this.camera)
  }

  setSegments(desired: ArcSegment[]): void {
    const desiredIds = new Set(desired.map(s => s.id))

    // Remove segments no longer present
    for (const [id, { line }] of this.segments) {
      if (!desiredIds.has(id)) {
        this.scene.remove(line)
        line.geometry.dispose()
        ;(line.material as LineMaterial).dispose()
        this.segments.delete(id)
      }
    }

    // Add or update segments
    for (const seg of desired) {
      const existing = this.segments.get(seg.id)
      if (existing) {
        // Update color if changed
        ;(existing.line.material as LineMaterial).color.set(seg.color)
        // Update visible count (slice coords for animation)
        this.updateAnimation(seg.id, seg.visibleCount)
      } else {
        // Create new line
        const line = this.buildLine(
          seg.coords.slice(0, seg.visibleCount),
          seg.color,
        )
        this.scene.add(line)
        this.segments.set(seg.id, { line, coords: seg.coords })
      }
    }
  }

  updateAnimation(id: string, visibleCount: number): void {
    const entry = this.segments.get(id)
    if (!entry) return

    // Slice to visible count and rebuild positions
    const sliced = entry.coords.slice(0, Math.max(2, visibleCount))
    const positions: number[] = []
    for (const pt of sliced) {
      const [mx, my, mz] = lngLatAltToMercator(pt[0], pt[1], pt[2] ?? 0)
      positions.push(mx, my, mz)
    }

    // Update geometry in-place (no new allocations)
    ;(entry.line.geometry as LineGeometry).setPositions(positions)
    entry.line.computeLineDistances()
  }

  private buildLine(coords: number[][], color: string, width = 3): Line2 {
    const positions: number[] = []
    for (const pt of coords) {
      const [mx, my, mz] = lngLatAltToMercator(pt[0], pt[1], pt[2] ?? 0)
      positions.push(mx, my, mz)
    }

    const geometry = new LineGeometry()
    geometry.setPositions(positions)

    const canvas = (this.renderer.getContext() as WebGL2RenderingContext).canvas as HTMLCanvasElement
    const material = new LineMaterial({
      color: new THREE.Color(color),
      linewidth: width,
      resolution: new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
      depthTest: true,
      transparent: true,
      opacity: 0.85,
    })

    const line = new Line2(geometry, material)
    line.computeLineDistances()
    return line
  }
}
```

#### 2. Update `src/pages/EditorPage.tsx`

**Remove deck.gl imports:**
```typescript
// Remove:
import { MapboxOverlay } from '@deck.gl/mapbox'
import { PathLayer } from '@deck.gl/layers'
```

**Add Three.js layer import:**
```typescript
import { ArcCustomLayer, type ArcSegment } from '../lib/map/ArcCustomLayer'
```

**Replace `overlayRef`:**
```typescript
// Remove:
const overlayRef = useRef<MapboxOverlay | null>(null)

// Add:
const arcLayerRef = useRef<ArcCustomLayer | null>(null)
```

**In map `load` handler (around line 206):**
```typescript
// Remove:
const overlay = new MapboxOverlay({ layers: [] })
map.addControl(overlay)
overlayRef.current = overlay

// Add:
const arcLayer = new ArcCustomLayer()
map.addLayer(arcLayer)
arcLayerRef.current = arcLayer
```

**In the sync routes effect (around line 277, where fly-mode `PathLayer`s are built):**

Replace the section that builds `pathLayers` with:
```typescript
const arcSegments: ArcSegment[] = []
const pathLayers: any[] = []

for (let i = 1; i < waypoints.length; i++) {
  const wp = waypoints[i]
  const pair = routeData.get(waypoints[i - 1]!.id)?.get(wp.id)

  if (!pair?.rootCoords) continue

  const color = TRANSPORT_COLORS[wp.transportMode]

  if (wp.transportMode === 'fly') {
    // Add to arc layer instead of pathLayers
    arcSegments.push({
      id: wp.id,
      coords: pair.rootCoords,
      color: color,
      visibleCount: pair.rootCoords.length,
    })
  } else {
    // Non-fly modes: MapLibre GeoJSON layers (unchanged)
    addMaplibreRoute(map, wp.id, pair.rootCoords, color)
  }
}

arcLayerRef.current?.setSegments(arcSegments)
```

**In `playAnimation` function (around line 444, in the rAF loop):**

Replace:
```typescript
const currentLayer = new PathLayer({
  id: `route-${wp.id}-anim`,
  data: [{ path: revealedCoords }],
  getPath: (d) => d.path,
  getColor: rgb,
  getWidth: 4,
  widthUnits: 'pixels',
  widthMinPixels: 2,
  capRounded: true,
  jointRounded: true,
  billboard: false,
})
overlay.setProps({ layers: [...completedLayers, currentLayer] })
```

With:
```typescript
arcLayerRef.current?.updateAnimation(wp.id, sliceEnd)
```

**In `restoreAllRoutes` function (around line 515):**

Replace overlay update with:
```typescript
// Rebuild arc segments from current state
const arcSegments: ArcSegment[] = []
for (let i = 1; i < waypoints.length; i++) {
  const wp = waypoints[i]
  const pair = routeData.get(waypoints[i - 1]!.id)?.get(wp.id)

  if (!pair?.rootCoords || wp.transportMode !== 'fly') continue

  arcSegments.push({
    id: wp.id,
    coords: pair.rootCoords,
    color: TRANSPORT_COLORS[wp.transportMode],
    visibleCount: pair.rootCoords.length,
  })
}
arcLayerRef.current?.setSegments(arcSegments)
```

**In the cleanup function at the end of the effect:**
```typescript
return () => {
  arcLayerRef.current = null
  // ... rest of cleanup
}
```

---

## Key Technical Details

### Coordinate Projection
- `MercatorCoordinate.fromLngLat(lngLat, altitude)` handles converting geographic coords to Mercator space
- Altitude is encoded directly into the Z coordinate
- Works correctly with both flat and globe projections

### Three.js Integration
- Uses shared WebGL2 context with MapLibre (not a separate canvas)
- `renderingMode: '3d'` ensures proper depth buffer sharing
- `Line2` + `LineMaterial` for pixel-width lines (native WebGL lines are always 1px)
- `autoClear = false` prevents clearing MapLibre's framebuffer

### Animation
- `updateAnimation()` slices the coordinate array and updates geometry in-place
- Much more efficient than creating new PathLayers per frame
- No GPU allocations per frame

### Performance
- Removes deck.gl dependency (~800KB gzipped)
- Fewer allocations during animation
- Proper depth testing with terrain

---

## Potential Issues

1. **Missing terrain tiles after layer renders**: Add `gl.bindFramebuffer(gl.FRAMEBUFFER, null)` at the start of `render()` if this occurs
2. **Lines appear too thin**: Increase the `width` parameter in `buildLine()` (default 3 pixels)
3. **Arc color not updating**: Ensure `setSegments` is being called on state changes, not just once

---

## Testing Checklist

- [ ] Create 2+ waypoints with fly transport mode
- [ ] Tilt the map — arcs should stay attached to waypoint markers at all angles
- [ ] Click Play — progressive animation should work smoothly
- [ ] Verify no terrain/tile flickering
- [ ] Check bundle size decreased (no deck.gl)
- [ ] Test with globe projection enabled
