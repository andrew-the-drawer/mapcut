import type { WaypointEntry } from '../../components/WaypointPanel'
import type { RouteCoordsMap } from '../../hooks/useRouteCoords'
import { TRANSPORT_COLORS, type TransportMode } from '../map/pathUtils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnimationFrame {
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number
  segments: {
    id: string
    progress: number       // 0–1
    transportMode: TransportMode
    coords: number[][]
    color: string
  }[]
  activeTip?: {
    segmentId: string
    coord: number[]        // [lng, lat, altMeters?]
    bearing: number        // degrees
  }
}

interface SegmentInfo {
  wp: WaypointEntry
  coords: number[][]
  color: string
  startCoord: [number, number]
  endCoord: [number, number]
  totalDist: number          // haversine km
  transitionFrames: number
  pauseFrames: number
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function haversine(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const sin2 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(sin2), Math.sqrt(1 - sin2))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Spherical linear interpolation between two lng/lat points along a great circle. */
function geodesicInterpolate(
  from: [number, number],
  to: [number, number],
  t: number,
): [number, number] {
  const R = Math.PI / 180
  const D = 180 / Math.PI
  const lat1 = from[1] * R
  const lng1 = from[0] * R
  const lat2 = to[1] * R
  const lng2 = to[0] * R

  const x1 = Math.cos(lat1) * Math.cos(lng1)
  const y1 = Math.cos(lat1) * Math.sin(lng1)
  const z1 = Math.sin(lat1)
  const x2 = Math.cos(lat2) * Math.cos(lng2)
  const y2 = Math.cos(lat2) * Math.sin(lng2)
  const z2 = Math.sin(lat2)

  const dot = Math.min(1, Math.max(-1, x1 * x2 + y1 * y2 + z1 * z2))
  const omega = Math.acos(dot)
  if (omega < 1e-10) return [from[0], from[1]]

  const s = Math.sin(omega)
  const a = Math.sin((1 - t) * omega) / s
  const b = Math.sin(t * omega) / s

  const x = a * x1 + b * x2
  const y = a * y1 + b * y2
  const z = a * z1 + b * z2

  return [Math.atan2(y, x) * D, Math.atan2(z, Math.sqrt(x * x + y * y)) * D]
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAUSE_MS = 600
const INITIAL_FLY_MS = 2000
const INITIAL_CENTER: [number, number] = [15, 25]
const INITIAL_ZOOM = 2
const TARGET_ZOOM = 7
const MAP_PITCH = 45

// ── AnimationSequencer ────────────────────────────────────────────────────────

export class AnimationSequencer {
  private readonly segmentInfos: SegmentInfo[]
  private readonly _totalFrames: number

  constructor(
    private readonly waypoints: WaypointEntry[],
    private readonly routeData: RouteCoordsMap,
    private readonly fps: number,
  ) {
    this.segmentInfos = this._buildSegmentInfos()
    this._totalFrames = this._computeTotalFrames()
  }

  get totalFrames(): number {
    return this._totalFrames
  }

  private _buildSegmentInfos(): SegmentInfo[] {
    const infos: SegmentInfo[] = []
    const pauseFrames = Math.round((PAUSE_MS / 1000) * this.fps)

    for (let i = 1; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i]
      const prevWp = this.waypoints[i - 1]
      const coords = this.routeData[prevWp.id]?.[wp.id]?.routeCoords ?? []
      const color = TRANSPORT_COLORS[wp.transportMode]

      const startCoord =
        coords.length >= 2 ? (coords[0] as [number, number]) : prevWp.coordinates
      const endCoord =
        coords.length >= 2
          ? (coords[coords.length - 1] as [number, number])
          : wp.coordinates
      const totalDist = haversine(startCoord, endCoord)
      const durationMs = Math.min(2500 + totalDist * 0.5, 6000)
      const transitionFrames = Math.max(1, Math.round((durationMs / 1000) * this.fps))

      infos.push({
        wp,
        coords,
        color,
        startCoord,
        endCoord,
        totalDist,
        transitionFrames,
        // No pause after the last segment
        pauseFrames: i < this.waypoints.length - 1 ? pauseFrames : 0,
      })
    }
    return infos
  }

  private _computeTotalFrames(): number {
    const initialFrames = Math.round((INITIAL_FLY_MS / 1000) * this.fps)
    const segmentFrames = this.segmentInfos.reduce(
      (sum, s) => sum + s.transitionFrames + s.pauseFrames,
      0,
    )
    return initialFrames + segmentFrames
  }

  *frames(): Generator<AnimationFrame> {
    if (this.waypoints.length < 2) return

    const initialFrames = Math.round((INITIAL_FLY_MS / 1000) * this.fps)
    const segmentProgress = this.segmentInfos.map(() => 0)

    const makeSegments = () =>
      this.segmentInfos.map((info, idx) => ({
        id: info.wp.id,
        progress: segmentProgress[idx],
        transportMode: info.wp.transportMode,
        coords: info.coords,
        color: info.color,
      }))

    // Phase 1: initial fly-in to first waypoint
    const wp0 = this.waypoints[0].coordinates
    for (let f = 0; f < initialFrames; f++) {
      const t = initialFrames > 1 ? f / (initialFrames - 1) : 1
      const easedT = easeInOut(t)
      yield {
        center: geodesicInterpolate(INITIAL_CENTER, wp0, easedT),
        zoom: lerp(INITIAL_ZOOM, TARGET_ZOOM, easedT),
        pitch: MAP_PITCH,
        bearing: 0,
        segments: makeSegments(),
      }
    }

    // Phase 2: segments
    for (let si = 0; si < this.segmentInfos.length; si++) {
      const seg = this.segmentInfos[si]
      const fromCenter = si === 0 ? wp0 : this.segmentInfos[si - 1].wp.coordinates
      const toCenter = seg.wp.coordinates
      // Zoom-out-then-in: zoom out proportional to distance
      const zoomMid = Math.max(1, TARGET_ZOOM - Math.log2(Math.max(1, seg.totalDist / 500)))

      // Transition frames
      for (let f = 0; f < seg.transitionFrames; f++) {
        const t = seg.transitionFrames > 1 ? f / (seg.transitionFrames - 1) : 1
        const easedT = easeInOut(t)
        const center = geodesicInterpolate(fromCenter, toCenter, easedT)
        const zoom =
          t < 0.5
            ? lerp(TARGET_ZOOM, zoomMid, easedT * 2)
            : lerp(zoomMid, TARGET_ZOOM, (easedT - 0.5) * 2)

        segmentProgress[si] = easedT

        let activeTip: AnimationFrame['activeTip']
        if (seg.coords.length >= 2) {
          const tipIdx = Math.min(
            Math.max(0, Math.floor(easedT * (seg.coords.length - 1))),
            seg.coords.length - 1,
          )
          const tipCoord = seg.coords[tipIdx]
          const prevCoord = seg.coords[Math.max(0, tipIdx - 1)]
          const dx = tipCoord[0] - prevCoord[0]
          const dy = tipCoord[1] - prevCoord[1]
          activeTip = {
            segmentId: seg.wp.id,
            coord: tipCoord,
            bearing: Math.atan2(dx, dy) * (180 / Math.PI),
          }
        }

        yield { center, zoom, pitch: MAP_PITCH, bearing: 0, segments: makeSegments(), activeTip }
      }

      segmentProgress[si] = 1

      // Pause frames
      for (let f = 0; f < seg.pauseFrames; f++) {
        yield {
          center: toCenter,
          zoom: TARGET_ZOOM,
          pitch: MAP_PITCH,
          bearing: 0,
          segments: makeSegments(),
        }
      }
    }
  }
}
