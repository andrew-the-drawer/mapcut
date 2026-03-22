import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import KeyIcon from '../components/icons/KeyIcon'
import MapOnboarding from '../components/MapOnboarding'
import WaypointPanel, { type WaypointEntry } from '../components/WaypointPanel'
import { ELocalStorageKey } from '../utils/constants'
import { TRANSPORT_COLORS, type TransportMode } from '../lib/map/pathUtils'
import { useRouteCoords } from '../hooks/useRouteCoords'
import { ArcCustomLayer, type ArcSegment } from '../lib/map/ArcCustomLayer'

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// SVG path data for transport icons (all oriented pointing UP / north)
const TRANSPORT_SVG: Record<TransportMode, { viewBox: string; path: string }> = {
  fly: {
    viewBox: '0 0 24 24',
    path: 'M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z',
  },
  drive: {
    viewBox: '0 0 24 24',
    path: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
  },
  train: {
    viewBox: '0 0 24 24',
    path: 'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-6H6V6h5v5zm2 0V6h5v5h-5zm3.5 6c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  },
  walk: {
    viewBox: '0 0 24 24',
    path: 'M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7z',
  },
}

function makeTipMarkerEl(mode: TransportMode): HTMLDivElement {
  const el = document.createElement('div')
  const color = TRANSPORT_COLORS[mode]
  el.style.cssText = `
    width: 40px;
    height: 40px;
    background: ${color};
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 16px ${color}aa, 0 0 32px ${color}55;
    pointer-events: none;
    user-select: none;
  `
  const { viewBox, path } = TRANSPORT_SVG[mode]
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '22')
  svg.setAttribute('height', '22')
  svg.setAttribute('viewBox', viewBox)
  svg.setAttribute('fill', 'white')
  svg.style.cssText = 'display:block;transition:transform 0.1s linear;'
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  p.setAttribute('d', path)
  svg.appendChild(p)
  el.appendChild(svg)
  return el
}

// Opt 7: pre-computed per-segment data for the animation loop
interface AnimSegment {
  wp: WaypointEntry
  coords: number[][]
  color: string
  startCoord: [number, number]
  endCoord: [number, number]
  totalDist: number  // haversine km, computed once
}

// Haversine distance in km between two [lng, lat] points.
function haversine(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const sin2 = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(sin2), Math.sqrt(1 - sin2))
}

// ── MapLibre route line helpers ───────────────────────────────────────────────

function mlIds(id: string) {
  return { sourceId: `ml-route-${id}`, layerId: `ml-route-${id}` }
}

function addMaplibreRoute(
  map: maplibregl.Map,
  id: string,
  coords: number[][],
  color: string,
  opacity = 0.9,
) {
  const { sourceId, layerId } = mlIds(id)
  if (map.getLayer(layerId)) map.removeLayer(layerId)
  if (map.getSource(sourceId)) map.removeSource(sourceId)
  map.addSource(sourceId, {
    type: 'geojson',
    lineMetrics: true,  // Opt 2: required for line-gradient / line-progress
    data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
  })
  map.addLayer({
    id: layerId,
    type: 'line',
    source: sourceId,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    // Opt 2: line-gradient replaces line-color (mutually exclusive); gradient at full reveal
    paint: { 'line-gradient': buildRevealGradient(color, 1), 'line-width': 6, 'line-opacity': opacity },
  })
}

function updateMaplibreRoute(map: maplibregl.Map, id: string, coords: number[][]) {
  const { sourceId } = mlIds(id)
  ;(map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined)?.setData({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: {},
  })
}

function setMaplibreRouteOpacity(map: maplibregl.Map, id: string, opacity: number) {
  const { layerId } = mlIds(id)
  if (map.getLayer(layerId)) map.setPaintProperty(layerId, 'line-opacity', opacity)
}

function removeMaplibreRoute(map: maplibregl.Map, id: string) {
  const { sourceId, layerId } = mlIds(id)
  if (map.getLayer(layerId)) map.removeLayer(layerId)
  if (map.getSource(sourceId)) map.removeSource(sourceId)
}

/**
 * Opt 2: build a line-gradient expression that reveals the line up to `progress` (0–1).
 * Transparent beyond the progress point — no geometry re-upload needed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildRevealGradient(color: string, progress: number): any {
  // Special-case the boundaries to avoid duplicate stops in the interpolate expression
  if (progress >= 1) {
    return ['interpolate', ['linear'], ['line-progress'], 0, color, 1, color]
  }
  if (progress <= 0) {
    return ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,0)']
  }
  // p is capped at 0.998 so p + 0.001 < 1.0 — no duplicate stop
  const p = Math.min(progress, 0.998)
  return [
    'interpolate', ['linear'], ['line-progress'],
    0,         color,
    p,         color,
    p + 0.001, 'rgba(0,0,0,0)',
    1,         'rgba(0,0,0,0)',
  ]
}

function makeWaypointMarkerEl(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `
    width: 13px;
    height: 13px;
    background: #60a5fa;
    border: 2.5px solid white;
    border-radius: 50%;
    box-shadow: 0 0 8px rgba(96,165,250,0.55);
    cursor: pointer;
  `
  return el
}

// ── EditorPage ────────────────────────────────────────────────────────────────

export default function EditorPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const arcLayerRef = useRef<ArcCustomLayer | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  // Waypoint markers keyed by waypoint id
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  // Animation state
  const animFrameRef = useRef<number | null>(null)
  const isPlayingRef = useRef(false)
  const tipMarkerRef = useRef<maplibregl.Marker | null>(null)
  // Raw DOM element for fly-mode tip (positioned via 3D projection onto arc)
  const flyTipElRef = useRef<HTMLDivElement | null>(null)
  // Tracks which waypoint IDs have active MapLibre route source/layers (non-fly modes)
  const mapRouteLinesRef = useRef<Set<string>>(new Set())

  const [apiKey, setApiKey] = useState<string | null>(
    () => localStorage.getItem(ELocalStorageKey.MapTilerKey),
  )
  const [showOnboarding, setShowOnboarding] = useState<boolean>(
    () => !localStorage.getItem(ELocalStorageKey.MapTilerKey),
  )
  const [waypoints, setWaypoints] = useState<WaypointEntry[]>([])
  const [isAnimating, setIsAnimating] = useState(false)

  const { routeData, onWaypointAdded, onWaypointDeleted, onTransportModeChanged } = useRouteCoords()

  // ── Map init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!apiKey || !mapContainerRef.current) return

    const markers = markersRef.current
    const mapRouteLines = mapRouteLinesRef.current

    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    setMapLoaded(false)
    markers.clear()
    arcLayerRef.current = null

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: `https://api.maptiler.com/maps/satellite/style.json?key=${apiKey}`,
      center: [15, 25],
      zoom: 2,
      pitch: 45,
      bearing: 0,
      canvasContextAttributes: {antialias: true}
    })

    mapRef.current = map

    map.on('load', () => {
      map.setProjection({ type: 'globe' })
      map.addSource('maptiler-dem', {
        type: 'raster-dem',
        url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${apiKey}`,
        tileSize: 256,
      })
      map.setTerrain({ source: 'maptiler-dem', exaggeration: 1.5 })

      const arcLayer = new ArcCustomLayer()
      map.addLayer(arcLayer)
      arcLayerRef.current = arcLayer

      setMapLoaded(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
      arcLayerRef.current = null
      markers.clear()
      mapRouteLines.clear()
      setMapLoaded(false)
    }
  }, [apiKey])

  // ── Sync markers ────────────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    const currentIds = new Set(waypoints.map(w => w.id))

    // Remove markers for deleted waypoints
    for (const [id, marker] of markersRef.current) {
      if (!currentIds.has(id)) {
        marker.remove()
        markersRef.current.delete(id)
      }
    }

    // Add markers for new waypoints
    for (const wp of waypoints) {
      if (!markersRef.current.has(wp.id)) {
        const marker = new maplibregl.Marker({ element: makeWaypointMarkerEl() })
          .setLngLat(wp.coordinates)
          .setPopup(
            new maplibregl.Popup({ offset: 20 }).setText(wp.name.split(',')[0]),
          )
          .addTo(map)
        markersRef.current.set(wp.id, marker)
      }
    }
  }, [mapLoaded, waypoints])

  // ── Sync route lines ────────────────────────────────────────────────────────

  useEffect(() => {
    const arcLayer = arcLayerRef.current
    const map = mapRef.current
    if (!arcLayer || !map || !mapLoaded) return

    const arcSegments: ArcSegment[] = []
    const activeNonFlyIds = new Set<string>()

    for (let i = 1; i < waypoints.length; i++) {
      const wp = waypoints[i]
      const prevWp = waypoints[i - 1]
      const pair = routeData[prevWp.id]?.[wp.id]
      if (!pair || pair.loading || pair.rootCoords.length < 2) continue

      const color = TRANSPORT_COLORS[wp.transportMode]

      if (wp.transportMode === 'fly') {
        // Remove MapLibre layer if mode was changed from non-fly
        if (mapRouteLinesRef.current.has(wp.id)) {
          removeMaplibreRoute(map, wp.id)
          mapRouteLinesRef.current.delete(wp.id)
        }
        arcSegments.push({
          id: wp.id,
          coords: pair.rootCoords,
          color,
          visibleCount: pair.rootCoords.length,
        })
      } else {
        activeNonFlyIds.add(wp.id)
        if (map.getLayer(`ml-route-${wp.id}`)) {
          updateMaplibreRoute(map, wp.id, pair.rootCoords)
          setMaplibreRouteOpacity(map, wp.id, 0.9)
        } else {
          addMaplibreRoute(map, wp.id, pair.rootCoords, color)
          mapRouteLinesRef.current.add(wp.id)
        }
      }
    }

    // Remove MapLibre routes for deleted waypoints or mode-changed-to-fly segments
    for (const id of [...mapRouteLinesRef.current]) {
      if (!activeNonFlyIds.has(id)) {
        removeMaplibreRoute(map, id)
        mapRouteLinesRef.current.delete(id)
      }
    }

    arcLayer.setSegments(arcSegments)
  }, [mapLoaded, waypoints, routeData])

  // ── Waypoint actions ────────────────────────────────────────────────────────

  const handleAddWaypoint = useCallback(
    (name: string, coordinates: [number, number]) => {
      const id = `wp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const newWp: WaypointEntry = { id, name, coordinates, transportMode: 'fly' }
      const prevWp = waypoints.length > 0 ? waypoints[waypoints.length - 1] : null
      onWaypointAdded(prevWp, newWp)
      setWaypoints(prev => [...prev, newWp])
      mapRef.current?.flyTo({ center: coordinates, zoom: 6, duration: 2000, curve: 1.42 })
    },
    [waypoints, onWaypointAdded],
  )

  const handleDeleteWaypoint = useCallback((id: string) => {
    const idx = waypoints.findIndex(w => w.id === id)
    if (idx === -1) return
    const prevWp = idx > 0 ? waypoints[idx - 1] : null
    const nextWp = idx < waypoints.length - 1 ? waypoints[idx + 1] : null
    onWaypointDeleted(id, prevWp, nextWp)
    setWaypoints(prev => prev.filter(w => w.id !== id))
  }, [waypoints, onWaypointDeleted])

  const handleTransportModeChange = useCallback((id: string, mode: TransportMode) => {
    const idx = waypoints.findIndex(w => w.id === id)
    if (idx === -1) return
    const prevWp = idx > 0 ? waypoints[idx - 1] : null
    if (prevWp) onTransportModeChanged(prevWp, waypoints[idx], mode)
    setWaypoints(prev => prev.map(wp => wp.id === id ? { ...wp, transportMode: mode } : wp))
  }, [waypoints, onTransportModeChanged])

  // ── Animation ───────────────────────────────────────────────────────────────

  // Restore all route lines to their fully-visible state
  const restoreAllRoutes = useCallback(() => {
    const arcLayer = arcLayerRef.current
    const map = mapRef.current
    if (!arcLayer || !map) return

    const arcSegments: ArcSegment[] = []

    for (let i = 1; i < waypoints.length; i++) {
      const wp = waypoints[i]
      const prevWp = waypoints[i - 1]
      const pair = routeData[prevWp.id]?.[wp.id]
      if (!pair || pair.rootCoords.length < 2) continue

      const color = TRANSPORT_COLORS[wp.transportMode]

      if (wp.transportMode === 'fly') {
        arcSegments.push({
          id: wp.id,
          coords: pair.rootCoords,
          color,
          visibleCount: pair.rootCoords.length,
        })
      } else {
        if (map.getLayer(`ml-route-${wp.id}`)) {
          // Opt 2: paint-only restore — no geometry re-upload
          map.setPaintProperty(`ml-route-${wp.id}`, 'line-gradient', buildRevealGradient(color, 1))
          setMaplibreRouteOpacity(map, wp.id, 0.9)
        } else {
          addMaplibreRoute(map, wp.id, pair.rootCoords, color)
          mapRouteLinesRef.current.add(wp.id)
        }
      }
    }

    arcLayer.setSegments(arcSegments)
  }, [waypoints, routeData])

  const playAnimation = useCallback(async () => {
    const map = mapRef.current
    const arcLayer = arcLayerRef.current
    if (!map || !arcLayer || waypoints.length < 2 || isAnimating) return

    setIsAnimating(true)
    isPlayingRef.current = true
    arcLayer.setAnimating(true)  // Opt 4: enable continuous repaint loop

    // Opt 7: pre-compute all segment data before the animation loop
    const segments: AnimSegment[] = []
    for (let i = 1; i < waypoints.length; i++) {
      const wp = waypoints[i]
      const coords = routeData[waypoints[i - 1].id]?.[wp.id]?.rootCoords ?? []
      const color = TRANSPORT_COLORS[wp.transportMode]
      if (coords.length >= 2) {
        const startCoord = coords[0] as [number, number]
        const endCoord = coords[coords.length - 1] as [number, number]
        segments.push({ wp, coords, color, startCoord, endCoord, totalDist: haversine(startCoord, endCoord) })
      } else {
        segments.push({ wp, coords, color, startCoord: [0, 0], endCoord: [0, 0], totalDist: 0 })
      }
    }

    // Opt 1: only recompute bearing when tipIdx advances to a new arc point
    let lastTipIdx = -1

    const removeTip = () => {
      tipMarkerRef.current?.remove()
      tipMarkerRef.current = null
      if (flyTipElRef.current) {
        flyTipElRef.current.remove()
        flyTipElRef.current = null
      }
    }

    const updateSegmentProgress = (seg: AnimSegment, progress: number) => {
      const { wp, coords: allCoords, color } = seg
      const clampedProgress = Math.max(0, Math.min(progress, 1))
      const sliceEnd = Math.max(2, Math.ceil(clampedProgress * allCoords.length))

      if (wp.transportMode === 'fly') {
        arcLayer.updateAnimation(wp.id, sliceEnd)
      } else {
        // Opt 2: paint-only gradient update — no geometry re-upload
        const { layerId } = mlIds(wp.id)
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, 'line-gradient', buildRevealGradient(color, clampedProgress))
        }
      }

      const tipIdx = Math.min(Math.floor(clampedProgress * (allCoords.length - 1)), allCoords.length - 1)
      const tipCoord = allCoords[tipIdx]

      if (wp.transportMode === 'fly') {
        const el = flyTipElRef.current
        if (el) {
          const screen = arcLayer.projectToScreen(tipCoord[0], tipCoord[1], tipCoord[2] ?? 0)
          if (screen) {
            el.style.transform = `translate(${screen.x - 20}px, ${screen.y - 20}px)`
            el.style.display = 'flex'
            // Opt 1: only recompute bearing when tipIdx advances — skips redundant frames
            if (tipIdx !== lastTipIdx && tipIdx > 0) {
              const prevCoord = allCoords[tipIdx - 1]
              const prevScreen = arcLayer.projectToScreen(prevCoord[0], prevCoord[1], prevCoord[2] ?? 0)
              if (prevScreen) {
                const svg = el.firstElementChild as HTMLElement | null
                if (svg) {
                  const dx = screen.x - prevScreen.x
                  const dy = screen.y - prevScreen.y
                  const screenBearing = Math.atan2(dy, dx) * (180 / Math.PI) + 90
                  svg.style.transform = `rotate(${screenBearing}deg)`
                }
              }
              lastTipIdx = tipIdx
            }
          } else {
            el.style.display = 'none'
          }
        }
      } else {
        tipMarkerRef.current?.setLngLat(tipCoord as [number, number])
      }
    }

    const flyAndWait = (coords: [number, number], duration: number) =>
      new Promise<void>(resolve => {
        map.flyTo({ center: coords, zoom: 7, duration, curve: 1.42 })
        map.once('moveend', () => resolve())
      })

    try {
      arcLayer.setSegments([])

      for (const id of mapRouteLinesRef.current) {
        setMaplibreRouteOpacity(map, id, 0)
      }

      await flyAndWait(waypoints[0].coordinates, 2000)
      if (!isPlayingRef.current) return

      const completedSegments: ArcSegment[] = []

      for (const seg of segments) {  // Opt 7: iterate pre-built plan
        if (!isPlayingRef.current) break

        const { wp, coords: allCoords, color, totalDist } = seg
        // Opt 8: scale duration by geodesic distance — short hops feel snappier
        const duration = Math.min(2500 + totalDist * 0.5, 6000)

        // Reset bearing cache for this segment (Opt 1)
        lastTipIdx = -1

        removeTip()
        if (allCoords.length >= 2) {
          if (wp.transportMode === 'fly') {
            const el = makeTipMarkerEl(wp.transportMode)
            el.style.position = 'absolute'
            el.style.left = '0'
            el.style.top = '0'
            el.style.zIndex = '10'
            el.style.display = 'none'
            mapContainerRef.current!.appendChild(el)
            flyTipElRef.current = el
          } else {
            tipMarkerRef.current = new maplibregl.Marker({
              element: makeTipMarkerEl(wp.transportMode),
              anchor: 'center',
            })
              .setLngLat(seg.startCoord)
              .addTo(map)
          }
        }

        if (allCoords.length >= 2) {
          if (wp.transportMode === 'fly') {
            arcLayer.setSegments([
              ...completedSegments,
              { id: wp.id, coords: allCoords, color, visibleCount: 2 },
            ])
          } else {
            // Opt 2: upload full geometry once; reveal via gradient paint property
            const { layerId, sourceId } = mlIds(wp.id)
            if (!map.getSource(sourceId)) {
              addMaplibreRoute(map, wp.id, allCoords, color, 0.9)
              mapRouteLinesRef.current.add(wp.id)
            } else if (map.getLayer(layerId)) {
              map.setPaintProperty(layerId, 'line-opacity', 0.9)
            }
            map.setPaintProperty(layerId, 'line-gradient', buildRevealGradient(color, 0))
          }

          const onMove = () => {
            if (!isPlayingRef.current) return
            const center = map.getCenter()
            const distFromStart = haversine(seg.startCoord, [center.lng, center.lat])
            const progress = totalDist > 0 ? Math.min(distFromStart / totalDist, 1) : 1
            updateSegmentProgress(seg, progress)
          }

          map.on('move', onMove)

          await new Promise<void>(resolve => {
            map.flyTo({ center: wp.coordinates, zoom: 7, duration, curve: 1.42 })
            map.once('moveend', () => {
              map.off('move', onMove)
              updateSegmentProgress(seg, 1)
              resolve()
            })
          })
        } else {
          await flyAndWait(wp.coordinates, duration)
        }

        removeTip()

        if (allCoords.length >= 2 && wp.transportMode === 'fly') {
          completedSegments.push({ id: wp.id, coords: allCoords, color, visibleCount: allCoords.length })
          arcLayer.setSegments(completedSegments)
        }

        if (seg !== segments[segments.length - 1] && isPlayingRef.current) {
          await sleep(600)
        }
      }
    } finally {
      removeTip()
      arcLayer.setAnimating(false)  // Opt 4: stop continuous repaint
      restoreAllRoutes()
      isPlayingRef.current = false
      setIsAnimating(false)
    }
  }, [waypoints, routeData, isAnimating, restoreAllRoutes])

  const stopAnimation = useCallback(() => {
    isPlayingRef.current = false
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    tipMarkerRef.current?.remove()
    tipMarkerRef.current = null
    if (flyTipElRef.current) {
      flyTipElRef.current.remove()
      flyTipElRef.current = null
    }
    restoreAllRoutes()
    setIsAnimating(false)
  }, [restoreAllRoutes])

  // ── Derived state ───────────────────────────────────────────────────────────

  const routeLoadingIds = useMemo(() => {
    const ids = new Set<string>()
    for (const fromMap of Object.values(routeData)) {
      for (const [toId, pair] of Object.entries(fromMap)) {
        if (pair.loading) ids.add(toId)
      }
    }
    return ids
  }, [routeData])

  // ── Onboarding handlers ─────────────────────────────────────────────────────

  const handleSave = useCallback((mapTilerKey: string) => {
    setApiKey(mapTilerKey)
    setShowOnboarding(false)
  }, [])

  const handleCancel = useCallback(() => {
    setShowOnboarding(false)
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#070714] flex">

      {/* Left panel — waypoint timeline */}
      {apiKey && !showOnboarding && (
        <WaypointPanel
          waypoints={waypoints}
          apiKey={apiKey}
          isAnimating={isAnimating}
          routeLoadingIds={routeLoadingIds}
          onAdd={handleAddWaypoint}
          onDelete={handleDeleteWaypoint}
          onTransportModeChange={handleTransportModeChange}
          onPlay={playAnimation}
          onStop={stopAnimation}
        />
      )}

      {/* Map container */}
      <div ref={mapContainerRef} className="flex-1 h-full" />

      {/* BYOK button — top-right */}
      {!showOnboarding && (
        <button
          onClick={() => setShowOnboarding(true)}
          className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 bg-black/50 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition-colors duration-150 cursor-pointer backdrop-blur-sm"
          aria-label="Bring your own key — update MapTiler API key"
        >
          <KeyIcon className="w-3.5 h-3.5" />
          BYOK
        </button>
      )}

      {/* Onboarding overlay */}
      {showOnboarding && (
        <div className="absolute inset-0 z-50">
          <MapOnboarding
            onSave={handleSave}
            onCancel={apiKey ? handleCancel : undefined}
            isUpdate={!!apiKey}
          />
        </div>
      )}
    </div>
  )
}
