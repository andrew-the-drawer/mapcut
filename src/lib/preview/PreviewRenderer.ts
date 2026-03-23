import maplibregl from 'maplibre-gl'
import type { ArcCustomLayer, ArcSegment } from '../map/ArcCustomLayer'
import type { AnimationSequencer, AnimationFrame } from '../animation/AnimationSequencer'
import { VideoMuxer } from './VideoMuxer'
import { buildRevealGradient } from '../map/mapUtils'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wait for the map to finish rendering the current frame.
 * After `jumpTo()`, MapLibre schedules a re-render. We wait for `idle` (tiles loaded,
 * rendering complete). Falls back after 1 s in case tiles are slow.
 */
function waitForMapIdle(map: maplibregl.Map): Promise<void> {
  return new Promise<void>(resolve => {
    const timeout = setTimeout(resolve, 1000)
    map.once('idle', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SegmentMeta = AnimationFrame['segments'][number]

export interface PreviewRendererOptions {
  width?: number
  height?: number
  fps?: number
  onProgress: (pct: number, frameIndex: number, totalFrames: number) => void
}

// ── PreviewRenderer ───────────────────────────────────────────────────────────

const DEFAULT_WIDTH = 640
const DEFAULT_HEIGHT = 360
const DEFAULT_FPS = 24

export class PreviewRenderer {
  private readonly width: number
  private readonly height: number
  private readonly fps: number
  private readonly onProgress: PreviewRendererOptions['onProgress']

  constructor(
    private readonly map: maplibregl.Map,
    private readonly arcLayer: ArcCustomLayer,
    private readonly container: HTMLElement,
    private readonly sequencer: AnimationSequencer,
    options: PreviewRendererOptions,
  ) {
    this.width = options.width ?? DEFAULT_WIDTH
    this.height = options.height ?? DEFAULT_HEIGHT
    this.fps = options.fps ?? DEFAULT_FPS
    this.onProgress = options.onProgress
  }

  async render(signal?: AbortSignal): Promise<Blob> {
    const { map, arcLayer, container, sequencer } = this

    if (typeof VideoEncoder === 'undefined') {
      throw new Error(
        'VideoEncoder is not available. Preview requires Chrome 94+, Firefox 130+, or Safari 16.4+.',
      )
    }

    // Save original container size
    const origWidth = container.style.width
    const origHeight = container.style.height

    // Resize to preview resolution
    container.style.width = `${this.width}px`
    container.style.height = `${this.height}px`
    map.resize()

    // Actual canvas dimensions (accounts for device pixel ratio)
    const canvas = map.getCanvas()
    const actualWidth = canvas.width
    const actualHeight = canvas.height

    // Muxer + encoder
    const muxer = new VideoMuxer(this.fps)
    await muxer.start()

    let encoderError: Error | null = null
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta ?? undefined).catch(e => {
          encoderError = e instanceof Error ? e : new Error(String(e))
        })
      },
      error: e => {
        encoderError = new Error(String(e))
      },
    })

    encoder.configure({
      codec: muxer.isMP4 ? 'avc1.42001f' : 'vp09.00.10.08',
      width: actualWidth,
      height: actualHeight,
      bitrate: 2_000_000,
      framerate: this.fps,
      latencyMode: 'quality',
    })

    const totalFrames = sequencer.totalFrames
    let frameIndex = 0
    let segmentMeta: SegmentMeta[] = []
    let arcInitialized = false

    // Clear arc layer before starting
    arcLayer.setSegments([])
    arcLayer.setTipMarker(null, '')

    try {
      for (const frame of sequencer.frames()) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        if (encoderError) throw encoderError

        // On first frame, register all fly segments so updateAnimation works
        if (!arcInitialized) {
          segmentMeta = frame.segments.map(s => ({ ...s }))
          const flySegs: ArcSegment[] = frame.segments
            .filter(s => s.transportMode === 'fly' && s.coords.length >= 2)
            .map(s => ({ id: s.id, coords: s.coords, color: s.color, visibleCount: 2 }))
          arcLayer.setSegments(flySegs)
          arcInitialized = true
        }

        // 1. Set camera (instant, no animation)
        map.jumpTo({
          center: frame.center,
          zoom: frame.zoom,
          pitch: frame.pitch,
          bearing: frame.bearing,
        })

        // 2. Update route reveal state
        for (const seg of frame.segments) {
          if (seg.transportMode === 'fly') {
            if (seg.coords.length >= 2) {
              arcLayer.updateAnimation(
                seg.id,
                Math.max(2, Math.ceil(seg.progress * seg.coords.length)),
              )
            }
          } else {
            const layerId = `ml-route-${seg.id}`
            if (map.getLayer(layerId)) {
              map.setPaintProperty(
                layerId,
                'line-gradient',
                buildRevealGradient(seg.color, seg.progress),
              )
            }
          }
        }

        // 2b. Update tip marker (THREE.js sphere on arc, captured in VideoFrame)
        if (frame.activeTip && !frame.isOutro) {
          const tipSeg = frame.segments.find(s => s.id === frame.activeTip!.segmentId)
          arcLayer.setTipMarker(frame.activeTip.coord, tipSeg?.color ?? '#ffffff')
        } else {
          arcLayer.setTipMarker(null, '')
        }

        // 3. Wait for map to finish rendering (tiles loaded, GPU idle)
        await waitForMapIdle(map)
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        if (encoderError) throw encoderError

        // 4. Capture canvas pixels
        const videoFrame = new VideoFrame(map.getCanvas(), {
          timestamp: Math.round((frameIndex * 1_000_000) / this.fps),
        })

        // 5. Encode frame (keyframe every 2 seconds)
        encoder.encode(videoFrame, { keyFrame: frameIndex % (this.fps * 2) === 0 })
        videoFrame.close()

        this.onProgress((frameIndex + 1) / totalFrames, frameIndex + 1, totalFrames)
        frameIndex++
      }

      // Flush remaining encoded frames
      await encoder.flush()
      encoder.close()

      return await muxer.finalize()
    } finally {
      // Safe close (may already be closed on success path)
      try { encoder.close() } catch { /* already closed */ }

      // Restore all routes to full visibility
      if (segmentMeta.length > 0) {
        const flySegs: ArcSegment[] = segmentMeta
          .filter(s => s.transportMode === 'fly' && s.coords.length >= 2)
          .map(s => ({
            id: s.id,
            coords: s.coords,
            color: s.color,
            visibleCount: s.coords.length,
          }))
        arcLayer.setSegments(flySegs)

        for (const s of segmentMeta) {
          if (s.transportMode !== 'fly') {
            const layerId = `ml-route-${s.id}`
            if (map.getLayer(layerId)) {
              map.setPaintProperty(layerId, 'line-gradient', buildRevealGradient(s.color, 1))
              map.setPaintProperty(layerId, 'line-opacity', 0.9)
            }
          }
        }
      }

      arcLayer.setTipMarker(null, '')

      // Restore container size
      container.style.width = origWidth
      container.style.height = origHeight
      map.resize()
    }
  }
}
