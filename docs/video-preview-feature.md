# Video Preview Feature — Plan

## Goal

Allow users to preview their animation as a video **locally in the browser**, before committing to a full MP4 export. The preview should render a lower-resolution video blob, display it in a `<video>` element with playback controls (play, pause, scrub), and complete fast enough (~5-15 seconds for a 2-minute animation) to support iterative editing.

---

## Why Preview Before Export

Full video export (WebCodecs + FFmpeg.wasm → MP4) takes 5-10 minutes for a 2-minute video. Users need a fast feedback loop to check:
- Camera angles and transitions
- Route reveal timing
- Segment ordering
- Overall pacing

A preview renders at reduced resolution/FPS and skips the FFmpeg mux step, producing a playable blob in seconds.

---

## Architecture Overview

```
[Preview button]
      │
      ▼
① Enable capture mode
   - preserveDrawingBuffer: true
   - Resize MapLibre canvas to preview resolution (e.g. 640×360)
   - Disable UI panels (hide timeline, waypoint editor)
      │
      ▼
② Replay animation in "capture mode"
   - Same playAnimation() logic, but driven by requestAnimationFrame
   - Each frame: capture canvas pixels → feed to VideoEncoder
   - Progress bar: "Rendering preview… 45%"
      │
      ▼
③ WebCodecs VideoEncoder → EncodedVideoChunks
   - H.264 baseline profile @ preview resolution
   - 24 FPS (lower than export's 30/60)
   - Chunks collected in an array
      │
      ▼
④ Mux chunks into WebM/MP4 container (no FFmpeg needed)
   - Use mediabunny (replaces deprecated webm-muxer / mp4-muxer)
   - Produces a Blob in memory
      │
      ▼
⑤ Display in VideoPreviewModal
   - <video src={blobURL}> with native controls
   - Play, pause, scrub, fullscreen
   - "Export Full Quality" button → triggers real export pipeline
   - "Close" discards the blob
```

---

## Key Design Decisions

### 1. JS muxer instead of FFmpeg.wasm

FFmpeg.wasm is the bottleneck in full export (requires SharedArrayBuffer, COOP/COEP headers, large WASM download, slow mux). For preview:
- Use `mediabunny` (pure TS, no WASM, tree-shakable to ~11 KB) to wrap WebCodecs output into a WebM or MP4 container
- `mediabunny` is the official successor to the now-deprecated `webm-muxer` and `mp4-muxer` packages (same author, unified API)
- WebM output plays natively in Chrome, Firefox, Edge; MP4 output for Safari
- Pick format at runtime based on browser — single package handles both

### 2. Reduced resolution

Preview renders at a fixed lower resolution to reduce frame capture and encoding time:

| Export Quality | Preview Resolution | Speedup vs Export |
|---|---|---|
| 1080p (1920×1080) | 640×360 | ~9× fewer pixels |
| 720p (1280×720) | 640×360 | ~4× fewer pixels |

### 3. Frame-stepped animation (not real-time)

Instead of replaying the animation in real time and hoping every frame is captured, the preview drives the animation **frame by frame**:
1. Advance camera to next interpolated position
2. Wait for `map.once('idle')` (all tiles loaded, render complete)
3. Capture the canvas
4. Repeat

This guarantees every frame is clean (no missing tiles, no mid-render captures) at the cost of wall-clock time. At 640×360, each frame takes ~15-30ms to render + encode, so a 2-min video at 24 FPS = 2,880 frames ≈ 45-90 seconds total.

### 4. Reuse existing animation logic

The preview reuses `playAnimation()`'s segment sequencing but replaces the real-time `flyTo` + `move` event approach with a deterministic frame stepper. This requires extracting the animation into a **generator** that yields frame-by-frame camera states.

---

## Components to Build

### 1. `src/lib/animation/AnimationSequencer.ts` — Animation as a generator

Extract the camera path computation from `EditorPage.playAnimation()` into a reusable, frame-by-frame generator.

```typescript
interface AnimationFrame {
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number
  // Route reveal state per segment
  segments: {
    id: string
    progress: number       // 0–1
    transportMode: TransportMode
    coords: number[][]
    color: string
  }[]
  // Which segment's tip icon is active
  activeTip?: {
    segmentId: string
    coord: number[]        // [lng, lat, altMeters?]
    bearing: number        // degrees, for fly-mode rotation
  }
}

class AnimationSequencer {
  constructor(
    waypoints: WaypointEntry[],
    routeData: RouteCoordsMap,
    fps: number,
  ) {}

  /** Total number of frames in the animation */
  get totalFrames(): number

  /** Generate frames one at a time */
  *frames(): Generator<AnimationFrame>
}
```

**Frame generation logic:**

For each segment between waypoints:
1. **Fly-to phase**: Interpolate camera from waypoint N to waypoint N+1 over `transitionDuration * fps` frames. Use the same easing curve as `flyTo` (`curve: 1.42`, quadratic ease-in-out). Compute intermediate `center`, `zoom`, `pitch`, `bearing` per frame.
2. **Inter-segment pause**: Hold the camera for `pauseDuration * fps` frames (600ms default = ~14 frames at 24 FPS).

Camera interpolation during fly-to:
```
t = frameInSegment / totalSegmentFrames  (0–1, linear)
easedT = t < 0.5 ? 2*t*t : -1+(4-2*t)*t  (quadratic ease-in-out)

center = geodesicInterpolate(startCoord, endCoord, easedT)
zoom = lerp(startZoom, endZoom, easedT)     // use flyTo's zoom-out-then-in curve
pitch = lerp(startPitch, endPitch, easedT)
bearing = lerpAngle(startBearing, endBearing, easedT)
```

The zoom curve should mimic MapLibre's `flyTo` zoom behavior: zoom out to show both waypoints, then zoom in at the destination. Approximate with:
```
zoomMid = startZoom - log2(distance / 500)  // zoom out proportional to distance
zoom = t < 0.5
  ? lerp(startZoom, zoomMid, easedT * 2)
  : lerp(zoomMid, endZoom, (easedT - 0.5) * 2)
```

Route progress is synced to `easedT` — same as the current haversine-based sync but deterministic.

### 2. `src/lib/preview/PreviewRenderer.ts` — Frame capture engine

Orchestrates the frame-stepped render loop.

```typescript
class PreviewRenderer {
  constructor(
    map: maplibregl.Map,
    arcLayer: ArcCustomLayer,
    sequencer: AnimationSequencer,
    options: {
      width: number        // preview canvas width
      height: number       // preview canvas height
      fps: number          // 24 for preview
      onProgress: (pct: number) => void
    },
  ) {}

  /**
   * Render all frames and return a playable video Blob.
   * Can be aborted via AbortSignal.
   */
  async render(signal?: AbortSignal): Promise<Blob>
}
```

**Render loop (per frame):**

```
for (const frame of sequencer.frames()) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  // 1. Set camera position (no animation — instant jump)
  map.jumpTo({
    center: frame.center,
    zoom: frame.zoom,
    pitch: frame.pitch,
    bearing: frame.bearing,
  })

  // 2. Update route reveal state
  for (const seg of frame.segments) {
    if (seg.transportMode === 'fly') {
      arcLayer.updateAnimation(seg.id, Math.ceil(seg.progress * seg.coords.length))
    } else {
      map.setPaintProperty(`ml-route-${seg.id}`, 'line-gradient', buildRevealGradient(seg.color, seg.progress))
    }
  }

  // 3. Update tip icon position (if active)
  updateTipIcon(frame.activeTip)

  // 4. Wait for map to finish rendering (tiles loaded, GPU idle)
  await waitForMapIdle(map)

  // 5. Capture canvas pixels
  const canvas = map.getCanvas()
  const videoFrame = new VideoFrame(canvas, { timestamp: frameIndex * (1_000_000 / fps) })

  // 6. Encode frame
  encoder.encode(videoFrame)
  videoFrame.close()

  onProgress(frameIndex / totalFrames)
  frameIndex++
}
```

**`waitForMapIdle` implementation:**
```typescript
function waitForMapIdle(map: maplibregl.Map): Promise<void> {
  return new Promise(resolve => {
    if (map.isSourceLoaded('maptiler-dem') && !map.isMoving()) {
      resolve()
    } else {
      map.once('idle', resolve)
    }
  })
}
```

### 3. `src/lib/preview/VideoMuxer.ts` — Container muxer wrapper

Wraps `mediabunny` behind a simple interface. `mediabunny` replaces the deprecated `webm-muxer` and `mp4-muxer` packages with a unified API.

Key API differences from the old libraries:
- `Muxer` → `Output`; format config is a separate `Mp4OutputFormat` / `WebMOutputFormat` object
- `ArrayBufferTarget` → `BufferTarget`
- Track registration is done via `output.addVideoTrack(source)` after construction
- `await output.start()` must be called before adding any data
- Adding chunks: `await videoSource.add(EncodedPacket.fromEncodedChunk(chunk), meta)`
- `finalize()` is now async: `await output.finalize()`
- Codec strings are short names: `'avc'` (H.264), `'vp9'` (VP9)

```typescript
import {
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  BufferTarget,
  EncodedVideoPacketSource,
  EncodedPacket,
} from 'mediabunny'

class VideoMuxer {
  private target: BufferTarget
  private output: Output
  private videoSource: EncodedVideoPacketSource
  private readonly isMP4: boolean

  constructor(fps: number) {
    this.target = new BufferTarget()
    this.isMP4 = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)

    if (this.isMP4) {
      this.output = new Output({
        format: new Mp4OutputFormat({ fastStart: 'reserve' }),
        target: this.target,
      })
      this.videoSource = new EncodedVideoPacketSource('avc')
    } else {
      this.output = new Output({
        format: new WebMOutputFormat(),
        target: this.target,
      })
      this.videoSource = new EncodedVideoPacketSource('vp9')
    }

    this.output.addVideoTrack(this.videoSource, { frameRate: fps })
  }

  /** Must be called before addVideoChunk */
  async start(): Promise<void> {
    await this.output.start()
  }

  async addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): Promise<void> {
    const packet = EncodedPacket.fromEncodedChunk(chunk)
    await this.videoSource.add(packet, meta ? { decoderConfig: meta.decoderConfig } : undefined)
  }

  async finalize(): Promise<Blob> {
    this.videoSource.close()
    await this.output.finalize()
    const mimeType = this.isMP4 ? 'video/mp4' : 'video/webm'
    return new Blob([this.target.buffer!], { type: mimeType })
  }
}
```

### 4. `src/components/VideoPreviewModal.tsx` — Preview UI

```
┌─────────────────────────────────────────────────┐
│  Preview                                    ✕   │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │                                           │  │
│  │         <video> with native controls      │  │
│  │         (play, pause, scrub, fullscreen)   │  │
│  │                                           │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  [Close]                    [Export Full Quality]│
└─────────────────────────────────────────────────┘
```

**During rendering (before video is ready):**
```
┌─────────────────────────────────────────────────┐
│  Generating Preview…                        ✕   │
├─────────────────────────────────────────────────┤
│                                                 │
│  ████████████████████░░░░░░░░░░░  67%           │
│  Rendering frame 1,930 / 2,880                  │
│                                                 │
│  [Cancel]                                       │
└─────────────────────────────────────────────────┘
```

**State machine:**
```
IDLE → RENDERING → READY → IDLE
              ↘ CANCELLED → IDLE
```

### 5. Integration into `EditorPage.tsx`

Add a "Preview" button next to the Play button in `WaypointPanel`:
- Disabled when < 2 waypoints or routes still loading
- Opens `VideoPreviewModal` in RENDERING state
- Creates `AnimationSequencer` + `PreviewRenderer`, calls `.render()`
- On completion, transitions modal to READY state with `<video>` element
- "Export Full Quality" in the modal triggers the full export pipeline (Phase 4 of PLAN.md)

---

## Dependencies to Install

```bash
npm install mediabunny
```

| Package | Size | Purpose |
|---|---|---|
| `mediabunny` | ~11 KB (tree-shaken) | MP4 + WebM container muxing — replaces deprecated `mp4-muxer` and `webm-muxer` |

**No FFmpeg.wasm needed for preview.** `mediabunny` is pure TypeScript, no WASM, no SharedArrayBuffer, no COOP/COEP headers required.

**Note:** `mp4-muxer` and `webm-muxer` are deprecated by their author (Vanilagy) in favor of `mediabunny`. Do not install the old packages.

**License:** MPL-2.0 — safe to use in commercial/closed-source apps; only modifications to mediabunny's own files must be published under MPL-2.0.

---

## Browser Requirements

| API | Chrome | Firefox | Safari | Notes |
|---|---|---|---|---|
| WebCodecs (`VideoEncoder`) | 94+ | 130+ | 16.4+ | Core frame encoding |
| `VideoFrame(canvas)` | 94+ | 130+ | 16.4+ | Canvas → VideoFrame |
| `HTMLCanvasElement.getContext('webgl2')` | 56+ | 51+ | 15+ | Already required by MapLibre |

**Fallback for browsers without WebCodecs**: Use `MediaRecorder` API with real-time playback capture. Lower quality, but universal support. Detect at runtime:

```typescript
const hasWebCodecs = typeof VideoEncoder !== 'undefined'
```

---

## Canvas Resizing Strategy

The map canvas must be resized to the preview resolution before capture.

```typescript
// Before preview:
const originalSize = { width: container.clientWidth, height: container.clientHeight }
container.style.width = `${previewWidth}px`
container.style.height = `${previewHeight}px`
map.resize()

// ... render all frames ...

// After preview:
container.style.width = `${originalSize.width}px`
container.style.height = `${originalSize.height}px`
map.resize()
```

**Alternative (offscreen)**: Create a second MapLibre map instance on an `OffscreenCanvas`. This avoids resizing the user's editor but requires duplicating map state (style, terrain, sources, layers). More complex but preserves the editing view during preview generation. Recommended for v2.

---

## WebCodecs Encoder Configuration

```typescript
const encoder = new VideoEncoder({
  output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
  error: (e) => console.error('Encode error:', e),
})

// VP9 for WebM targets (Chrome/Firefox/Edge), H.264 for MP4 targets (Safari)
// mediabunny uses short codec names: 'avc' / 'vp9'
// WebCodecs VideoEncoder still uses full codec strings
const isMP4 = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)
encoder.configure({
  codec: isMP4 ? 'avc1.42001f' : 'vp09.00.10.08',  // Baseline H.264 or VP9 for WebCodecs
  width: previewWidth,
  height: previewHeight,
  bitrate: 2_000_000,       // 2 Mbps — good enough for preview
  framerate: 24,
  latencyMode: 'quality',   // optimize for file size, not streaming
})
```

---

## Performance Estimates

| Animation Length | Frames (24 FPS) | Render Time (est.) | Output Size |
|---|---|---|---|
| 30 seconds | 720 | ~15-25 sec | ~3-5 MB |
| 1 minute | 1,440 | ~30-50 sec | ~6-10 MB |
| 2 minutes | 2,880 | ~60-90 sec | ~12-20 MB |
| 5 minutes | 7,200 | ~2.5-4 min | ~30-50 MB |

Bottleneck is `map.idle` wait per frame (tile loading). Most tiles will already be cached by the browser from the user's editing session, so subsequent previews of the same route should be faster.

---

## File Structure

```
src/
├── lib/
│   ├── animation/
│   │   └── AnimationSequencer.ts    [NEW] Frame-by-frame animation generator
│   └── preview/
│       ├── PreviewRenderer.ts       [NEW] Capture + encode loop
│       └── VideoMuxer.ts            [NEW] mediabunny wrapper (replaces webm-muxer/mp4-muxer)
├── components/
│   └── VideoPreviewModal.tsx        [NEW] Preview player UI
├── pages/
│   └── EditorPage.tsx               [MODIFY] Add preview button + integration
└── hooks/
    └── useVideoPreview.ts           [NEW] Preview state management hook
```

---

## Implementation Phases

### Phase A — Animation Sequencer (foundation)

1. Create `AnimationSequencer` class with frame generator
2. Implement camera interpolation (center, zoom, pitch, bearing) per frame
3. Implement route progress tracking per frame
4. Unit test: verify frame count matches expected duration × FPS
5. Unit test: verify first/last frame positions match first/last waypoints

### Phase B — Frame Capture + Encoding

1. Install `mediabunny`
2. Create `VideoMuxer` wrapper with browser detection
3. Create `PreviewRenderer` with frame-stepped render loop
4. Implement `preserveDrawingBuffer: true` toggle
5. Implement canvas resize → render → restore flow
6. Test: capture 10 frames → produce playable WebM blob

### Phase C — Preview UI

1. Create `VideoPreviewModal` component (progress bar + video player)
2. Create `useVideoPreview` hook (state machine: IDLE/RENDERING/READY/CANCELLED)
3. Wire "Preview" button in `WaypointPanel`
4. Integrate abort support (cancel mid-render)
5. Add "Export Full Quality" button (placeholder — connects to Phase 4 of PLAN.md)

### Phase D — Polish

1. Handle edge cases: < 2 waypoints, missing route data, encoder errors
2. Add WebCodecs feature detection with graceful fallback message
3. Memory cleanup: revoke blob URLs on modal close
4. Performance: skip duplicate frames when camera hasn't moved (pause segments)
5. Consider: offscreen MapLibre instance (v2, to avoid editor resize flash)

---

## Relationship to Full Export (PLAN.md Phase 4)

The preview system shares infrastructure with the full export pipeline:

| Component | Preview | Full Export |
|---|---|---|
| Animation sequencer | `AnimationSequencer` (shared) | Same class, higher FPS |
| Frame capture | `PreviewRenderer` (shared logic) | Same + `preserveDrawingBuffer` |
| Encoding | WebCodecs `VideoEncoder` (shared) | Same, higher bitrate/resolution |
| Muxing | `mediabunny` (pure TS, replaces deprecated `webm-muxer`/`mp4-muxer`) | **FFmpeg.wasm** (supports audio) |
| Audio | None | Background music mixed in FFmpeg |
| Resolution | 640×360 | 1280×720 or 1920×1080 |
| Tile caching | Browser cache only | OPFS persistent cache (see `video-export-tile-preload.md`) |
| Output | In-memory Blob → `<video>` | File download via File System Access API |

Building preview first establishes the animation sequencer and frame capture patterns. Full export later adds FFmpeg.wasm for audio muxing, higher resolution, and OPFS tile caching on top of the same foundation.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `map.idle` takes too long per frame (slow tiles) | Set a timeout (500ms) — if idle doesn't fire, capture anyway. Most tiles cached from editing. |
| WebCodecs not available (older browsers) | Feature-detect at runtime. Show "Preview requires Chrome 94+" message. Fallback: `MediaRecorder` real-time capture (lower quality). |
| Canvas resize flash visible to user | Overlay a solid dark div during preview generation. Or use offscreen map instance (Phase D). |
| Memory pressure from thousands of encoded chunks | Stream chunks to muxer immediately (don't accumulate). `mediabunny` `Output` with `WebMOutputFormat({ appendOnly: true })` supports streaming. |
| Preview looks different from final export | Both use the same `AnimationSequencer`. Resolution differs, but camera path is identical. |
| Safari VP9 not supported | Runtime detection → use `mediabunny` `Mp4OutputFormat` + `'avc'` codec string for Safari. |
