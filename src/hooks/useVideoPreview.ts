import { useCallback, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { WaypointEntry } from '../components/WaypointPanel'
import type { RouteCoordsMap } from './useRouteCoords'
import type { ArcCustomLayer } from '../lib/map/ArcCustomLayer'
import { AnimationSequencer } from '../lib/animation/AnimationSequencer'
import { PreviewRenderer } from '../lib/preview/PreviewRenderer'

// ── Types ─────────────────────────────────────────────────────────────────────

export type PreviewState = 'idle' | 'rendering' | 'ready' | 'cancelled'

export interface StartPreviewParams {
  map: maplibregl.Map
  arcLayer: ArcCustomLayer
  container: HTMLElement
  waypoints: WaypointEntry[]
  routeData: RouteCoordsMap
}

export interface UseVideoPreviewReturn {
  state: PreviewState
  progress: number           // 0–1
  frameIndex: number
  totalFrames: number
  blobURL: string | null
  startPreview: (params: StartPreviewParams) => void
  cancelPreview: () => void
  closePreview: () => void
}

// ── useVideoPreview ───────────────────────────────────────────────────────────

const PREVIEW_FPS = 24;

export function useVideoPreview(): UseVideoPreviewReturn {
  const [state, setState] = useState<PreviewState>('idle')
  const [progress, setProgress] = useState(0)
  const [frameIndex, setFrameIndex] = useState(0)
  const [totalFrames, setTotalFrames] = useState(0)
  const [blobURL, setBlobURL] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const currentBlobURLRef = useRef<string | null>(null)

  const startPreview = useCallback((params: StartPreviewParams) => {
    const { map, arcLayer, container, waypoints, routeData } = params

    if (waypoints.length < 2) return

    // Abort any in-progress render
    abortControllerRef.current?.abort()

    // Revoke previous blob URL
    if (currentBlobURLRef.current) {
      URL.revokeObjectURL(currentBlobURLRef.current)
      currentBlobURLRef.current = null
      setBlobURL(null)
    }

    const ac = new AbortController()
    abortControllerRef.current = ac

    const sequencer = new AnimationSequencer(waypoints, routeData, PREVIEW_FPS)
    const renderer = new PreviewRenderer(map, arcLayer, container, sequencer, {
      fps: PREVIEW_FPS,
      onProgress: (pct, fi, total) => {
        setProgress(pct)
        setFrameIndex(fi)
        setTotalFrames(total)
      },
    })

    setProgress(0)
    setFrameIndex(0)
    setTotalFrames(sequencer.totalFrames)
    setState('rendering')

    renderer.render(ac.signal).then(blob => {
      if (ac.signal.aborted) return
      const url = URL.createObjectURL(blob)
      currentBlobURLRef.current = url
      setBlobURL(url)
      setState('ready')
    }).catch(err => {
      if ((err as DOMException)?.name === 'AbortError') {
        setState('cancelled')
      } else {
        console.error('[VideoPreview] render error:', err)
        setState('cancelled')
      }
    })
  }, [])

  const cancelPreview = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setState('idle')
  }, [])

  const closePreview = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    if (currentBlobURLRef.current) {
      URL.revokeObjectURL(currentBlobURLRef.current)
      currentBlobURLRef.current = null
    }
    setBlobURL(null)
    setState('idle')
  }, [])

  return {
    state,
    progress,
    frameIndex,
    totalFrames,
    blobURL,
    startPreview,
    cancelPreview,
    closePreview,
  }
}
