# MapCut — Technical Plan (Client-Side Only)

A web app for creating cinematic travel story videos: animated 3D globe transitions between locations, with media (photos, videos, text) attached to each destination. Runs entirely in the browser — no backend, no server, no account required.

**Reference product**: mult.dev (animated map video creator), extended with per-destination rich media/notes editing.

---

## 1. Product Vision

The user builds a "journey" by:
1. Dropping waypoints on an interactive 3D globe
2. Attaching photos, videos, and notes to each waypoint
3. Playing back a cinematic animation that flies between waypoints and reveals the media at each stop
4. Exporting the result as an MP4 video (encoded entirely in the browser)
5. Sharing via a `.mapcut` project file (JSON + media bundled as a ZIP)

**No login. No cloud. Everything lives on the user's device.**

---

## 2. Core Technical Challenges

| Challenge | Solution |
|---|---|
| Smooth 3D globe fly-to animation | MapLibre GL JS `flyTo` + custom easing |
| DOM media overlays synced to WebGL | CSS layer above the canvas, toggled by animation state |
| Video export combining WebGL + DOM overlays | WebCodecs API (frame capture) + FFmpeg.wasm (MP4 encode) in a Web Worker |
| Large media file storage in-browser | **OPFS** (Origin Private File System) — no quota limits, sandboxed to origin |
| Project portability without a server | Export/import as a `.mapcut` ZIP (JSON metadata + raw media files) |
| Path drawing between waypoints | MapLibre GeoJSON source with `line-trim-offset` for progressive reveal |

---

## 3. Tech Stack

### Frontend
| Role | Library | Reason |
|---|---|---|
| Framework | **Vite + React 18** + TypeScript | Lightweight CSR, no SSR overhead, fast HMR |
| Map / Globe | **MapLibre GL JS v5** | Open-source Mapbox fork, MIT licensed, globe projection since v5 (Jan 2025), identical `flyTo` API |
| State | **Zustand** | Simple, co-located slices; works well with map side-effects |
| Rich text notes | **TipTap 2** | Headless, extensible, lightweight |
| UI | **Tailwind CSS** + **shadcn/ui** | Rapid, accessible component primitives |
| Animations (UI) | **Framer Motion** | Panel transitions, overlay entry/exit |
| DnD (timeline) | **@dnd-kit/core** + **@dnd-kit/sortable** | Accessible drag-to-reorder |

### Storage (all client-side)
| Role | API / Library | Reason |
|---|---|---|
| Project metadata + small data | **IndexedDB** (via `idb`) | Structured storage, works offline |
| Media blobs (images, video, audio) | **OPFS** (Origin Private File System) | Large file storage, no quota warnings, synchronous in workers |
| Project export/import | **JSZip** | Bundle JSON + media into a single `.mapcut` file |

### Video Export (all in-browser)
| Role | Library | Reason |
|---|---|---|
| Canvas frame capture | **WebCodecs API** (`VideoEncoder`) | Hardware-accelerated, faster-than-realtime encoding |
| MP4 muxing + audio mix | **FFmpeg.wasm** (`@ffmpeg/ffmpeg`) | Full FFmpeg compiled to WebAssembly, runs in a Web Worker |
| Worker communication | Native `Worker` + `SharedArrayBuffer` | Keep the UI thread unblocked during encode |
| File save | **File System Access API** (`showSaveFilePicker`) | Native save dialog; fallback to `<a download>` |

### External APIs (no server required)
| Service | Usage | Cost |
|---|---|---|
| **MapTiler Cloud** | Map tiles + satellite imagery + terrain DEM tiles (served to MapLibre) | Free tier: 100k map loads/month |
| **MapTiler Geocoding API** | Waypoint search by place name (client-side, same key) | Included in free tier |

---

## 4. Visual: Satellite + 3D Terrain

The core visual — identical to the mult.dev reference and the screenshot below — is achieved by combining three MapLibre features:

```
┌────────────────────────────────────────────────────────┐
│  Layer 3: GeoJSON overlays (route line + markers)      │ ← MapLibre vector layers
│  Layer 2: 3D terrain extrusion                         │ ← map.setTerrain() + DEM tiles
│  Layer 1: Satellite imagery (base raster tiles)        │ ← MapTiler Satellite style
└────────────────────────────────────────────────────────┘
        Camera: pitch 60–70°, bearing variable
```

### 1. Satellite base style
```js
const map = new maplibregl.Map({
  style: `https://api.maptiler.com/maps/satellite/style.json?key=${KEY}`,
  // ...
})
```
MapTiler's `satellite` style serves aerial imagery tiles — the photorealistic rock/snow/forest texture seen in the screenshot.

### 2. 3D terrain extrusion
MapTiler provides **Terrain RGB v2** tiles — a DEM (Digital Elevation Model) where elevation is encoded in the RGB channels. MapLibre reads these and extrudes the mesh in 3D:

```js
map.on('load', () => {
  map.addSource('maptiler-dem', {
    type: 'raster-dem',
    url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${KEY}`,
    tileSize: 256,
  })
  map.setTerrain({ source: 'maptiler-dem', exaggeration: 1.5 })
})
```

`exaggeration: 1.5` amplifies the vertical scale slightly for a more dramatic cinematic look (can be tuned per project).

### 3. Pitched camera
```js
map.flyTo({
  center: [86.925, 27.988], // e.g. Everest Base Camp
  zoom: 12,
  pitch: 70,               // tilt to show terrain depth
  bearing: -30,            // rotate for best angle
  duration: 5000,
  curve: 1.42,
})
```

### What this achieves
- Mountains, valleys, glaciers rendered in true 3D with satellite photo texture
- Camera tilts and arcs cinematically between waypoints
- Blue animated route line drawn on top (GeoJSON `line` layer)
- Waypoint markers float above terrain (MapLibre auto-elevates markers with terrain)
- All tiles (satellite + DEM) served from MapTiler's free tier — no extra cost

> **Note**: Terrain RGB tiles are counted against the same 100k map load quota as regular tiles. For a typical session with 10–20 waypoints this is negligible.

---

## 5. Application Architecture

```
mapcut/
├── public/
│   └── ffmpeg/                   # FFmpeg.wasm worker assets (copied from @ffmpeg/core)
├── src/
│   ├── main.tsx                  # Vite entry point
│   ├── App.tsx                   # Router (react-router-dom): / and /studio/:projectId
│   ├── pages/
│   │   ├── Home.tsx              # Project gallery (loaded from IndexedDB)
│   │   └── Studio.tsx            # Editor view shell
│   ├── components/
│   │   ├── Globe/
│   │   │   ├── GlobeMap.tsx      # MapLibre GL canvas wrapper
│   │   │   ├── WaypointMarkers.tsx
│   │   │   └── RoutePath.tsx     # Animated GeoJSON path line
│   │   ├── Editor/
│   │   │   ├── EditorShell.tsx   # 3-panel layout
│   │   │   ├── Timeline.tsx      # Ordered waypoint list + drag-to-reorder
│   │   │   └── WaypointPanel.tsx # Right panel: media, notes, camera settings
│   │   ├── MediaEditor/
│   │   │   ├── MediaDropzone.tsx
│   │   │   ├── ImageCard.tsx
│   │   │   └── VideoCard.tsx
│   │   ├── Overlay/
│   │   │   ├── LocationOverlay.tsx  # During playback: title + media + notes
│   │   │   └── ProgressBar.tsx
│   │   └── Export/
│   │       └── ExportModal.tsx
│   ├── lib/
│   │   ├── store/
│   │   │   ├── projectStore.ts   # Zustand: project, waypoints, settings
│   │   │   └── playbackStore.ts  # Zustand: animation state machine
│   │   ├── map/
│   │   │   ├── animate.ts        # Fly-to sequencer
│   │   │   └── pathUtils.ts      # GeoJSON path helpers
│   │   ├── storage/
│   │   │   ├── idb.ts            # IndexedDB: project list + metadata
│   │   │   └── opfs.ts           # OPFS: read/write media blobs
│   │   └── export/
│   │       ├── captureFrames.ts  # WebCodecs canvas frame capture
│   │       ├── encodeVideo.ts    # FFmpeg.wasm Worker wrapper
│   │       └── projectZip.ts     # JSZip: .mapcut export/import
│   └── types/
│       └── index.ts
├── index.html
├── vite.config.ts
└── package.json
```

---

## 7. Data Model

```typescript
// src/types/index.ts

interface Project {
  id: string
  title: string
  createdAt: string             // ISO date
  updatedAt: string
  settings: ProjectSettings
  waypoints: Waypoint[]
}

interface Waypoint {
  id: string
  title: string
  coordinates: [number, number] // [longitude, latitude]
  zoom: number                  // map zoom level at this stop (default 10)
  pitch: number                 // camera pitch in degrees (default 45)
  bearing: number               // camera bearing in degrees (default 0)
  displayDuration: number       // seconds to linger at this waypoint (default 3)
  transitionDuration: number    // seconds for the fly-to animation (default 4)
  media: MediaItem[]
  notes: string                 // TipTap JSON string
}

interface MediaItem {
  id: string
  type: 'image' | 'video'
  opfsPath: string              // path within OPFS: `/{projectId}/{mediaId}.{ext}`
  url?: string                  // ephemeral object URL, resolved at runtime
  caption?: string
  order: number
}

interface ProjectSettings {
  mapStyle: MapStyle
  showPath: boolean             // draw animated line between waypoints
  pathColor: string             // default '#ffffff'
  pathWidth: number             // default 2
  musicOpfsPath?: string        // background audio stored in OPFS
  exportFps: 24 | 30 | 60
  exportResolution: '720p' | '1080p'
}

// MapTiler style URLs — swap the key at runtime via VITE_MAPTILER_KEY
type MapStyle =
  | 'satellite'    // MapTiler Satellite Streets  — cinematic default
  | 'dark'         // MapTiler Dataviz Dark       — sleek dark globe
  | 'topo'         // MapTiler Topo               — outdoor/terrain look
  | 'streets'      // MapTiler Streets            — clean light style

// Resolved at runtime:
// `https://api.maptiler.com/maps/${style}/style.json?key=${VITE_MAPTILER_KEY}`
```

---

## 8. Storage Strategy

### IndexedDB (via `idb`)
Stores lightweight, structured data:
- Project list (metadata only — id, title, dates, settings)
- No binary blobs here

### OPFS (Origin Private File System)
Stores all binary files in a virtual filesystem at `/{projectId}/{filename}`:
- Images: `/{projectId}/{mediaId}.jpg`
- Videos: `/{projectId}/{mediaId}.mp4`
- Background music: `/{projectId}/music.mp3`

OPFS advantages over IndexedDB for blobs:
- No storage quota prompts
- Synchronous access available in Web Workers (used by FFmpeg.wasm)
- Much faster read/write for large files

### Project Export/Import (`.mapcut` file)
A `.mapcut` file is a ZIP containing:
```
project.json          ← Project metadata + waypoints (no binary)
media/
  {mediaId}.jpg
  {mediaId}.mp4
  music.mp3
```
Uses `JSZip` to create/parse. On import, files are written back to OPFS.

---

## 9. Animation Engine

The playback is a **state machine**:

```
IDLE → PLAYING → [FLY_TO waypoint N] → [DISPLAY waypoint N] → [FLY_TO waypoint N+1] → ... → DONE
```

Implementation (`src/lib/map/animate.ts`):

```typescript
import maplibregl from 'maplibre-gl'

async function playSequence(map: maplibregl.Map, waypoints: Waypoint[], onEnter, onLeave) {
  for (const wp of waypoints) {
    // 1. Fly to the waypoint (cinematic arc)
    await flyToWaypoint(map, wp)

    // 2. Show the media overlay
    onEnter(wp)

    // 3. Hold for displayDuration
    await sleep(wp.displayDuration * 1000)

    // 4. Hide overlay, move on
    onLeave(wp)
  }
}

function flyToWaypoint(map: maplibregl.Map, wp: Waypoint): Promise<void> {
  return new Promise(resolve => {
    map.flyTo({
      center: wp.coordinates,
      zoom: wp.zoom,
      pitch: wp.pitch,
      bearing: wp.bearing,
      duration: wp.transitionDuration * 1000,
      curve: 1.42,         // zoom-out-then-in arc (cinematic feel)
      easing: t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t,
    })
    map.once('moveend', resolve)
  })
}
```

### Path Animation
Route path drawn as a MapLibre GeoJSON line. The `line-trim-offset` paint property is updated as the animation progresses to reveal the path incrementally — no per-frame JS updates needed.

---

## 10. Media Overlay System

During playback, a full-screen CSS layer sits above the MapLibre canvas (`z-index: 10`, `pointer-events: none`). `LocationOverlay` fades in via Framer Motion `AnimatePresence`:

```
┌─────────────────────────────────────────────────────┐
│  [MapLibre GL Canvas – full screen WebGL]           │
│                                                     │
│  ┌──── Location Overlay (absolute, z-index 10) ──┐  │
│  │  📍 Kyoto, Japan                              │  │
│  │  ─────────────────────────────               │  │
│  │  [img] [img] [video] ←scroll→               │  │
│  │  ─────────────────────────────               │  │
│  │  "Cherry blossoms in full bloom..."          │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 11. Video Export Pipeline (100% Client-Side)

```
User clicks Export
      │
      ▼
ExportModal: choose resolution + FPS
      │
      ▼
① Playback loop runs in "capture mode"
  - MapLibre canvas: preserveDrawingBuffer: true
  - LocationOverlay: rendered to OffscreenCanvas via html-to-image
  - Both composited into a single OffscreenCanvas each frame
      │
      ▼
② WebCodecs VideoEncoder
  - Encodes each composited frame as H.264 at target FPS
  - Runs in a dedicated Web Worker (non-blocking)
  - Emits encoded chunks to FFmpeg.wasm worker
      │
      ▼
③ FFmpeg.wasm (in Worker)
  - Receives video chunks + audio file from OPFS
  - Muxes video + audio into MP4 container
  - Outputs final MP4 bytes
      │
      ▼
④ File System Access API
  - showSaveFilePicker() → user picks save location
  - Fallback: URL.createObjectURL(blob) + <a download>
```

**Performance note**: FFmpeg.wasm runs at ~3–5x real-time speed. A 2-minute video encodes in ~5–10 minutes. A progress bar shows encoding status via `Worker` `postMessage` callbacks.

---

## 12. Editor UI Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  MapCut  [Project Title ✏]                   [↓ Save] [▶ Preview] [Export]  │
├────────────────┬─────────────────────────────────┬───────────────────────────┤
│  TIMELINE      │                                 │  WAYPOINT EDITOR          │
│                │                                 │                           │
│  ① Tokyo       │        3D GLOBE                 │  📍 Name: Kyoto           │
│  ② Kyoto   ◄── │    (MapLibre GL fullscreen)     │  🔍 Zoom: ──●─────  10   │
│  ③ Osaka       │                                 │  📐 Pitch: ───●────  45  │
│  ④ Hiroshima   │                                 │  ⏱ Display: ─●───── 3s   │
│                │                                 │  ✈ Fly time: ──●─── 4s   │
│  [+ Add place] │                                 │                           │
│                │                                 │  MEDIA                    │
│  PROJECT       │                                 │  [+ Upload images/video]  │
│  Map style:    │                                 │  [img1] [img2] [vid1]     │
│  [Satellite ▼] │                                 │                           │
│  Show path: ✓  │                                 │  NOTES                    │
│  Music: [+ Add]│                                 │  [Rich text editor...]    │
│                │                                 │                           │
│  [↓ Export     │                                 │                           │
│   .mapcut]     │                                 │                           │
└────────────────┴─────────────────────────────────┴───────────────────────────┘
```

---

## 13. Implementation Phases

### Phase 1 — Core Globe Editor
- [ ] Vite + React + TypeScript + Tailwind + shadcn/ui setup
- [ ] MapLibre GL v5 integration with 3D globe mode (`projection: 'globe'`) + MapTiler satellite style
- [ ] Click-to-add-waypoint on map + geocoder search
- [ ] Zustand project store (waypoints CRUD)
- [ ] IndexedDB persistence (auto-save on change)
- [ ] Timeline panel with waypoint list
- [ ] Fly-to animation sequencer
- [ ] Animated route path between waypoints

### Phase 2 — Media & Notes
- [ ] OPFS wrapper for media blob read/write
- [ ] File upload (images + video) per waypoint → OPFS
- [ ] Media carousel in WaypointPanel (object URLs resolved from OPFS)
- [ ] TipTap rich text notes editor
- [ ] LocationOverlay during playback (title + media slideshow + notes)
- [ ] Drag-to-reorder waypoints in timeline (@dnd-kit)

### Phase 3 — Polish & Settings
- [ ] Map style selector (satellite, dark, light, outdoors)
- [ ] Per-waypoint camera controls (zoom, pitch, bearing sliders)
- [ ] Animation timing controls (transition duration, display duration)
- [ ] Background music upload → OPFS + playback sync during preview
- [ ] Project home page (gallery of saved projects from IndexedDB)

### Phase 4 — Export
- [ ] `.mapcut` project export (JSZip: JSON + OPFS media)
- [ ] `.mapcut` project import (unzip → restore to IndexedDB + OPFS)
- [ ] Client-side video export: WebCodecs frame capture + FFmpeg.wasm encode
- [ ] Export modal (resolution, FPS, progress bar)
- [ ] File System Access API save dialog (with `<a download>` fallback)

---

## 14. Key Dependencies

```json
{
  "dependencies": {
    "react": "^18.3",
    "react-dom": "^18.3",
    "react-router-dom": "^6.23",
    "typescript": "^5.4",
    "maplibre-gl": "^5.0",
    "@maplibre/maplibre-gl-geocoder": "^1.5",
    "zustand": "^4.5",
    "@tiptap/react": "^2.4",
    "@tiptap/starter-kit": "^2.4",
    "framer-motion": "^11.2",
    "tailwindcss": "^3.4",
    "@dnd-kit/core": "^6.1",
    "@dnd-kit/sortable": "^8.0",
    "idb": "^8.0",
    "jszip": "^3.10",
    "@ffmpeg/ffmpeg": "^0.12",
    "@ffmpeg/util": "^0.12",
    "html-to-image": "^1.11",
    "uuid": "^9.0"
  },
  "devDependencies": {
    "vite": "^5.2",
    "@vitejs/plugin-react": "^4.2",
    "vite-plugin-cross-origin-isolation": "^0.1"
  }
}
```

> **Note**: `vite-plugin-cross-origin-isolation` sets `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers required by `SharedArrayBuffer`, which FFmpeg.wasm depends on.

---

## 15. Environment Variables

```bash
# .env
VITE_MAPTILER_KEY=xxxx      # MapTiler Cloud API key (free tier, only external dependency)
```

That's it — no backend secrets, no database URLs. Get a free key at [maptiler.com/cloud](https://www.maptiler.com/cloud/).

---

## 16. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| FFmpeg.wasm encode is slow | Show progress bar + estimated time; consider WebCodecs-only encode for speed |
| `SharedArrayBuffer` requires COOP/COEP headers | Use `vite-plugin-cross-origin-isolation` in dev; set headers in host (Netlify/Cloudflare config) |
| `preserveDrawingBuffer: true` drops FPS during edit | Only enable during capture mode; reset to `false` after export |
| OPFS not supported in older browsers | Target Chrome 102+, Firefox 111+, Safari 15.2+; show unsupported banner otherwise |
| Large media fills device storage | Warn user when project exceeds 500 MB; offer per-file delete in UI |
| MapTiler key abuse (public key) | Restrict key to allowed domains in MapTiler Cloud dashboard |

---

## 17. Deployment

Any **static host** works — no server required:

- **Cloudflare Pages** — Recommended: free, sets COOP/COEP headers natively (needed for FFmpeg.wasm)
- **Netlify** — Free tier, set headers via `netlify.toml`
- **GitHub Pages** — Free, but requires a service worker hack to inject COOP/COEP headers
- **Vercel** — Free static deploy, set headers via `vercel.json`

```toml
# netlify.toml example
[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"
```

---

*End of plan. Start implementation with Phase 1.*
