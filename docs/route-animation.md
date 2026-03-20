# Route Animation System

## Overview

Animated route reveal between waypoints, synced with MapLibre's `flyTo` camera transition. Each segment draws a route line progressively while a transport icon follows the tip.

## Icon System

White SVG silhouettes on solid 40px blue circles with glow. Defined in `TRANSPORT_SVG` (`src/pages/EditorPage.tsx`).

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
