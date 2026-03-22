# Video Export: Persistent Tile Cache

## Problem

During video export, WebCodecs captures frames in real-time. If a map tile is still
downloading when a frame is captured, the glitch is baked permanently into the exported MP4.
Satellite tiles are effectively static (global imagery rarely changes), so there is no reason
to re-fetch them on every export.

## Strategy

Two distinct phases before any frame is recorded:

**Phase 1 — Tile Harvesting** (one-time, before first export)
Run a silent pre-pass of the animation. Intercept every tile MapLibre requests via
`transformRequest`, fetch it, and write it to **OPFS** (Origin Private File System).
Tiles are keyed by their URL path (`z/x/y`) and deduplicated across sessions.

**Phase 2 — Cached Render** (every export after harvesting)
Load needed tiles from OPFS into memory as Blob URLs. Register a `transformRequest`
that redirects `api.maptiler.com/...` → local Blob URLs. MapLibre sees instant
responses with no network round-trips, no missing tiles, no glitches.

## Data Flow

```
[Export button pressed]

Phase 1 — Harvesting (skipped if tiles already cached)
  Silent animation replay (no frame capture)
  → transformRequest intercepts every tile URL MapLibre touches
      → not in OPFS? fetch() + write ArrayBuffer to OPFS
      → already cached? skip
  → progress: "Caching tiles… 142 / 300"

Phase 2 — Render
  → load cached tiles from OPFS → Map<url, Blob URL> in memory
  → register transformRequest to redirect matching URLs → Blob URL
  → wait for map.idle()
  → start animation + WebCodecs frame capture
      → all tile requests served instantly from memory
  → FFmpeg.wasm mux → MP4
  → revoke all Blob URLs, restore original transformRequest
  → showSaveFilePicker
```

## Components

### `TileCache` class — `src/lib/map/TileCache.ts`

Wraps OPFS with a simple typed interface.

```ts
class TileCache {
  async get(urlPath: string): Promise<ArrayBuffer | null>
  async set(urlPath: string, data: ArrayBuffer): Promise<void>
  async has(urlPath: string): Promise<boolean>
  async keys(): Promise<string[]>
  async totalBytes(): Promise<number>
  async clear(): Promise<void>
}
```

- Tiles stored as raw `ArrayBuffer` files under an OPFS sub-directory (e.g. `tiles/`)
- Key is the URL path stripped of the API key query param (e.g. `tiles/satellite-v2/5/12/8.jpg`)
- An in-memory `Set<string>` is populated on init from OPFS directory listing for fast `has()` checks

### Tile harvesting — integrated into export flow

- Temporarily register a `transformRequest` that logs every tile URL MapLibre fetches
- Replay the animation at normal speed (the same animation driver as export, but with `preserveDrawingBuffer` off and no frame capture)
- For each new tile URL: `fetch()` the tile + `tileCache.set()`
- Sources to harvest: `satellite-v2` raster tiles + `terrain-rgb-v2` DEM tiles

### Export render — `src/lib/export/`

```ts
// Before capture
const blobUrls = new Map<string, string>()
for (const key of await tileCache.keys()) {
  const buf = await tileCache.get(key)
  blobUrls.set(key, URL.createObjectURL(new Blob([buf!])))
}

map.setTransformRequest((url, resourceType) => {
  if (resourceType === 'Tile') {
    const path = stripApiKey(url)
    const local = blobUrls.get(path)
    if (local) return { url: local }
  }
  return { url }
})

// After capture
blobUrls.forEach(u => URL.revokeObjectURL(u))
map.setTransformRequest(originalTransformRequest)
```

## Export UX Flow

```
[Export button]
  → "Step 1: Caching tiles… (142 / 300)"   ← harvesting pass (first export only)
  → "Step 2: Rendering video…"              ← WebCodecs frame capture
  → "Step 3: Encoding MP4…"                ← FFmpeg.wasm
  → Save file dialog
```

Subsequent exports of the same route skip Step 1 entirely.

## Limitations

| Concern | Detail |
|---|---|
| OPFS storage | Satellite tiles ~50–150 KB each; 1,000 tiles ≈ ~100 MB. Show cache size in Settings. |
| First export | Harvesting pass must replay the exact same camera path as export — use the same animation driver for both. |
| Terrain tiles | Both `satellite-v2` and `terrain-rgb-v2` tile URLs are harvested and cached. |
| API key in URLs | Cached keys strip the `?key=` query param so cache survives key rotation. |
| Offline bonus | Once tiles are cached, export works fully offline. |
| Cache invalidation | Tiles never expire automatically (satellite imagery is static). Provide a manual "Clear tile cache" button in Settings. |
