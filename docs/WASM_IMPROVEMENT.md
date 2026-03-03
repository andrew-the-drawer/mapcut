# MapCut — Rust/Wasm Enhancement Plan

This document extends `PLAN.md` with Rust-compiled-to-WebAssembly additions. Each slot is ranked by fit quality and implementation priority.

---

## Toolchain

| Tool | Role |
|---|---|
| `wasm-pack` | Compile Rust crates → `.wasm` + JS glue code |
| `wasm-bindgen` | JS↔Rust boundary (types, callbacks, memory) |
| `vite-plugin-wasm` | Load `.wasm` modules in Vite |
| `vite-plugin-top-level-await` | Required for async Wasm instantiation at module top-level |

Install Vite plugins:
```bash
npm i -D vite-plugin-wasm vite-plugin-top-level-await
```

`vite.config.ts` additions:
```ts
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait(), crossOriginIsolation()],
})
```

Crate output goes under `src/wasm/` as separate Rust workspace members, each compiled independently via `wasm-pack build --target web`.

---

## Slot 1 — EXIF Extraction + GPS Auto-Placement (Priority: High)

**Where**: `src/lib/storage/` — triggered on image upload in `MediaDropzone`

**Why Rust**: The Rust [`kamadak-exif`](https://crates.io/crates/kamadak-exif) crate is the most complete EXIF parser available in any language. JS alternatives are fragile and often miss GPS sub-second precision or non-standard tags. Parsing binary EXIF is pure CPU work — ideal for Wasm.

**Feature unlocked**: When a user drops a photo, automatically read its GPS coordinates and timestamp, then offer to create a waypoint at that location with the date pre-filled.

### Crate structure

```
src/wasm/exif-parser/
├── Cargo.toml
└── src/
    └── lib.rs
```

```toml
# Cargo.toml
[package]
name = "exif-parser"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"
kamadak-exif = "0.5"
js-sys = "0.3"
serde = { version = "1", features = ["derive"] }
serde-wasm-bindgen = "0.6"
```

```rust
// src/lib.rs
use wasm_bindgen::prelude::*;
use serde::Serialize;

#[derive(Serialize)]
pub struct ExifResult {
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub datetime: Option<String>,
    pub camera_model: Option<String>,
}

#[wasm_bindgen]
pub fn parse_exif(bytes: &[u8]) -> JsValue {
    let result = extract(bytes).unwrap_or(ExifResult {
        lat: None, lng: None, datetime: None, camera_model: None,
    });
    serde_wasm_bindgen::to_value(&result).unwrap()
}

fn extract(bytes: &[u8]) -> Option<ExifResult> {
    let mut cursor = std::io::Cursor::new(bytes);
    let exif = exif::Reader::new().read_from_container(&mut cursor).ok()?;

    let lat = get_gps_coord(&exif, exif::Tag::GPSLatitude, exif::Tag::GPSLatitudeRef);
    let lng = get_gps_coord(&exif, exif::Tag::GPSLongitude, exif::Tag::GPSLongitudeRef);

    let datetime = exif.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY)
        .map(|f| f.display_value().to_string());

    let camera_model = exif.get_field(exif::Tag::Model, exif::In::PRIMARY)
        .map(|f| f.display_value().to_string());

    Some(ExifResult { lat, lng, datetime, camera_model })
}

fn get_gps_coord(exif: &exif::Exif, tag: exif::Tag, ref_tag: exif::Tag) -> Option<f64> {
    let field = exif.get_field(tag, exif::In::PRIMARY)?;
    let ref_field = exif.get_field(ref_tag, exif::In::PRIMARY)?;
    // Convert DMS rational to decimal degrees
    if let exif::Value::Rational(ref v) = field.value {
        let deg = v[0].to_f64();
        let min = v[1].to_f64() / 60.0;
        let sec = v[2].to_f64() / 3600.0;
        let mut decimal = deg + min + sec;
        let ref_str = ref_field.display_value().to_string();
        if ref_str.contains('S') || ref_str.contains('W') {
            decimal = -decimal;
        }
        return Some(decimal);
    }
    None
}
```

### JS integration

```ts
// src/lib/wasm/exifParser.ts
import init, { parse_exif } from '../../wasm/exif-parser/pkg/exif_parser'

let ready = false
export async function initExifParser() {
  if (!ready) { await init(); ready = true }
}

export function extractExif(buffer: ArrayBuffer) {
  return parse_exif(new Uint8Array(buffer)) as {
    lat: number | null
    lng: number | null
    datetime: string | null
    camera_model: string | null
  }
}
```

```ts
// In MediaDropzone.tsx — on file drop
await initExifParser()
const buffer = await file.arrayBuffer()
const exif = extractExif(buffer)
if (exif.lat && exif.lng) {
  promptAutoPlaceWaypoint({ coordinates: [exif.lng, exif.lat], datetime: exif.datetime })
}
```

---

## Slot 2 — Geodesic Path Interpolation (Priority: Medium)

**Where**: `src/lib/map/pathUtils.ts`

**Why Rust**: Computing smooth great-circle paths between waypoints requires many intermediate points for a visually accurate curved line on the globe. The Rust [`geo`](https://crates.io/crates/geo) crate implements proper geodesic algorithms (Vincenty/Karney). This removes the need for `turf.js` as a JS dependency and runs in a tight SIMD-friendly loop.

**Feature unlocked**: High-density geodesic paths (e.g., 200 interpolated points per segment) with zero JS overhead — the globe route line curves correctly over the poles.

### Crate structure

```
src/wasm/geo-utils/
├── Cargo.toml
└── src/
    └── lib.rs
```

```toml
[dependencies]
wasm-bindgen = "0.2"
geo = "0.28"
serde = { version = "1", features = ["derive"] }
serde-wasm-bindgen = "0.6"
```

```rust
use wasm_bindgen::prelude::*;
use geo::{GeodesicIntermediate, Point};
use serde::Serialize;

#[derive(Serialize)]
struct Coord {
    lng: f64,
    lat: f64,
}

/// Returns `n` evenly-spaced points along the geodesic between two coordinates.
#[wasm_bindgen]
pub fn geodesic_interpolate(
    lng1: f64, lat1: f64,
    lng2: f64, lat2: f64,
    n: usize,
) -> JsValue {
    let start = Point::new(lng1, lat1);
    let end = Point::new(lng2, lat2);
    let points: Vec<Coord> = (0..=n)
        .map(|i| {
            let t = i as f64 / n as f64;
            let p = start.geodesic_intermediate(&end, t);
            Coord { lng: p.x(), lat: p.y() }
        })
        .collect();
    serde_wasm_bindgen::to_value(&points).unwrap()
}
```

### JS integration

```ts
// src/lib/wasm/geoUtils.ts
import init, { geodesic_interpolate } from '../../wasm/geo-utils/pkg/geo_utils'

export async function initGeoUtils() { await init() }

export function interpolatePath(
  waypoints: [number, number][],
  pointsPerSegment = 100,
): [number, number][] {
  const result: [number, number][] = []
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [lng1, lat1] = waypoints[i]
    const [lng2, lat2] = waypoints[i + 1]
    const pts = geodesic_interpolate(lng1, lat1, lng2, lat2, pointsPerSegment) as
      { lng: number; lat: number }[]
    pts.forEach(p => result.push([p.lng, p.lat]))
  }
  return result
}
```

Replace the GeoJSON path source construction in `RoutePath.tsx`:
```ts
import { interpolatePath } from '../../lib/wasm/geoUtils'
const coordinates = interpolatePath(waypointCoords, 150)
```

---

## Slot 3 — Frame Pixel Compositing During Video Export (Priority: High)

**Where**: `src/lib/export/captureFrames.ts`

**Why Rust**: Video export is the biggest UX pain point (currently ~3–5x real-time via FFmpeg.wasm alone). Each frame requires compositing the MapLibre WebGL canvas pixels + the DOM overlay pixels into a single frame buffer, then optionally applying post-processing (vignette, letterbox, color grade). This is a tight per-pixel loop — exactly where Rust/Wasm with SIMD is fastest.

**Feature unlocked**: Faster export + free post-processing effects (vignette, color grading) without additional JS libraries.

### Crate structure

```
src/wasm/frame-compositor/
├── Cargo.toml
└── src/
    └── lib.rs
```

```toml
[dependencies]
wasm-bindgen = "0.2"
```

```rust
use wasm_bindgen::prelude::*;

/// Alpha-composite `overlay` (RGBA) onto `base` (RGBA) in-place.
/// Both slices must be width * height * 4 bytes.
#[wasm_bindgen]
pub fn composite_rgba(base: &mut [u8], overlay: &[u8]) {
    for i in (0..base.len()).step_by(4) {
        let src_a = overlay[i + 3] as f32 / 255.0;
        let dst_a = 1.0 - src_a;
        base[i]     = (overlay[i]     as f32 * src_a + base[i]     as f32 * dst_a) as u8;
        base[i + 1] = (overlay[i + 1] as f32 * src_a + base[i + 1] as f32 * dst_a) as u8;
        base[i + 2] = (overlay[i + 2] as f32 * src_a + base[i + 2] as f32 * dst_a) as u8;
        base[i + 3] = 255;
    }
}

/// Apply a radial vignette effect to RGBA pixel data in-place.
#[wasm_bindgen]
pub fn apply_vignette(pixels: &mut [u8], width: u32, height: u32, strength: f32) {
    let cx = width as f32 / 2.0;
    let cy = height as f32 / 2.0;
    let max_dist = (cx * cx + cy * cy).sqrt();
    for y in 0..height {
        for x in 0..width {
            let i = ((y * width + x) * 4) as usize;
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let dist = (dx * dx + dy * dy).sqrt() / max_dist;
            let factor = 1.0 - (dist * strength).min(1.0);
            pixels[i]     = (pixels[i]     as f32 * factor) as u8;
            pixels[i + 1] = (pixels[i + 1] as f32 * factor) as u8;
            pixels[i + 2] = (pixels[i + 2] as f32 * factor) as u8;
        }
    }
}
```

### JS integration

```ts
// src/lib/wasm/frameCompositor.ts
import init, { composite_rgba, apply_vignette } from '../../wasm/frame-compositor/pkg/frame_compositor'

export async function initFrameCompositor() { await init() }

export function compositeFrame(
  baseImageData: ImageData,
  overlayImageData: ImageData,
  vignetteStrength = 0.5,
): ImageData {
  const base = new Uint8Array(baseImageData.data.buffer)
  const overlay = new Uint8Array(overlayImageData.data.buffer)
  composite_rgba(base, overlay)
  if (vignetteStrength > 0) {
    apply_vignette(base, baseImageData.width, baseImageData.height, vignetteStrength)
  }
  return new ImageData(new Uint8ClampedArray(base), baseImageData.width, baseImageData.height)
}
```

In `captureFrames.ts`, replace the Canvas 2D `drawImage` composite approach with `compositeFrame()` before feeding pixels to `VideoEncoder`.

---

## Slot 4 — ZIP Pack/Unpack for `.mapcut` Files (Priority: Low)

**Where**: `src/lib/export/projectZip.ts`

**Why Rust**: The Rust [`zip`](https://crates.io/crates/zip) crate compresses faster than JSZip, especially for large media archives. Bottleneck is often I/O, so gains are moderate — but it removes JSZip from the JS dependency tree.

**Note**: Only worth implementing if `.mapcut` export/import is noticeably slow in practice (projects > 200 MB). Otherwise JSZip is adequate.

---

## Slot 5 — Audio Fade / Mixing (Priority: Low)

**Where**: Between OPFS music read and FFmpeg.wasm mux step

**Why Rust**: The [`dasp`](https://crates.io/crates/dasp) crate (Digital Audio Signal Processing) can apply fade-in/fade-out, normalize levels, and crossfade the background music track before handing PCM audio to FFmpeg. Useful if audio sync becomes complex.

**Note**: FFmpeg.wasm already handles basic audio muxing. Only add this if per-waypoint audio fade or ducking (lowering music volume when a video clip plays) is required.

---

## Updated Dependency List (additions only)

```json
{
  "devDependencies": {
    "vite-plugin-wasm": "^3.3",
    "vite-plugin-top-level-await": "^1.4"
  }
}
```

Rust workspace (`Cargo.toml` at repo root):
```toml
[workspace]
members = [
  "src/wasm/exif-parser",
  "src/wasm/geo-utils",
  "src/wasm/frame-compositor",
]
```

Build all crates:
```bash
wasm-pack build src/wasm/exif-parser --target web --out-dir pkg
wasm-pack build src/wasm/geo-utils --target web --out-dir pkg
wasm-pack build src/wasm/frame-compositor --target web --out-dir pkg
```

---

## Implementation Order

| Priority | Slot | Phase to integrate |
|---|---|---|
| 1 | EXIF extraction + GPS auto-place | Phase 2 (Media & Notes) |
| 2 | Frame compositing + vignette | Phase 4 (Export) |
| 3 | Geodesic path interpolation | Phase 1 (Core Globe Editor) |
| 4 | ZIP pack/unpack | Phase 4 (Export) — only if JSZip is slow |
| 5 | Audio mixing | Phase 3 (Polish) — only if ducking needed |

---

*Extends PLAN.md. Start with the EXIF parser as a self-contained first Rust/Wasm module.*
