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

const TRANSPORT_ICONS: Record<TransportMode, string> = {
  fly: '✈',
  drive: '🚗',
  train: '🚄',
  walk: '🚶',
}

// Base angle of the emoji when unrotated (degrees clockwise from north).
// ✈ points upper-right (~NE = 45°), others face right (~E = 90°).
const TRANSPORT_BASE_ANGLE: Record<TransportMode, number> = {
  fly: 45,
  drive: 90,
  train: 90,
  walk: 90,
}

function makeTipMarkerEl(mode: TransportMode): HTMLDivElement {
  const el = document.createElement('div')
  const color = TRANSPORT_COLORS[mode]
  el.style.cssText = `
    width: 28px;
    height: 28px;
    background: ${color}22;
    border: 2px solid ${color};
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    box-shadow: 0 0 10px ${color}88;
    pointer-events: none;
    user-select: none;
  `
  const icon = document.createElement('span')
  icon.style.cssText = 'display:inline-block;transition:transform 0.1s linear;'
  icon.textContent = TRANSPORT_ICONS[mode]
  el.appendChild(icon)
  return el
}

// Bearing in degrees clockwise from north between two [lng, lat] points.
function calcBearing(from: [number, number], to: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const lat1 = toRad(from[1]), lat2 = toRad(to[1])
  const dLng = toRad(to[0] - from[0])
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
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
    data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
  })
  map.addLayer({
    id: layerId,
    type: 'line',
    source: sourceId,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': 6, 'line-opacity': opacity },
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
          updateMaplibreRoute(map, wp.id, pair.rootCoords)
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

    const flyAndWait = (coords: [number, number], duration: number) =>
      new Promise<void>(resolve => {
        map.flyTo({ center: coords, zoom: 7, duration, curve: 1.42 })
        setTimeout(resolve, duration + 100)
      })

    try {
      // Hide all fly-mode arcs
      arcLayer.setSegments([])

      // Fade out non-fly MapLibre routes
      for (const id of mapRouteLinesRef.current) {
        setMaplibreRouteOpacity(map, id, 0)
      }

      // Fly to the first waypoint
      await flyAndWait(waypoints[0].coordinates, 2000)
      if (!isPlayingRef.current) return

      // Accumulates fully-revealed arc segments for completed fly legs
      const completedSegments: ArcSegment[] = []

      // Animate each segment
      for (let i = 1; i < waypoints.length; i++) {
        if (!isPlayingRef.current) break

        const wp = waypoints[i]
        const allCoords = routeData[waypoints[i - 1].id]?.[wp.id]?.rootCoords ?? []
        const color = TRANSPORT_COLORS[wp.transportMode]

        // Create tip marker for this segment
        tipMarkerRef.current?.remove()
        tipMarkerRef.current = null
        if (allCoords.length >= 2) {
          tipMarkerRef.current = new maplibregl.Marker({
            element: makeTipMarkerEl(wp.transportMode),
            anchor: 'center',
          })
            .setLngLat(allCoords[0] as [number, number])
            .addTo(map)
        }

        const DURATION = 3500
        const start = performance.now()

        if (allCoords.length >= 2) {
          if (wp.transportMode === 'fly') {
            // Register the segment with minimal visible points so Three.js knows about it
            arcLayer.setSegments([
              ...completedSegments,
              { id: wp.id, coords: allCoords, color, visibleCount: 2 },
            ])

            const animate = () => {
              if (!isPlayingRef.current) return
              const progress = Math.min((performance.now() - start) / DURATION, 1)
              const sliceEnd = Math.max(2, Math.ceil(progress * allCoords.length))

              arcLayer.updateAnimation(wp.id, sliceEnd)

              const tipIdx = Math.min(Math.floor(progress * (allCoords.length - 1)), allCoords.length - 1)
              const tip = allCoords[tipIdx] as [number, number]
              tipMarkerRef.current?.setLngLat(tip)
              if (tipIdx > 0) {
                const b = calcBearing(allCoords[tipIdx - 1] as [number, number], tip)
                const icon = tipMarkerRef.current?.getElement().firstElementChild as HTMLElement | null
                if (icon) icon.style.transform = `rotate(${b - TRANSPORT_BASE_ANGLE[wp.transportMode]}deg)`
              }

              if (progress < 1) {
                animFrameRef.current = requestAnimationFrame(animate)
              }
            }
            animFrameRef.current = requestAnimationFrame(animate)
          } else {
            // Non-fly: progressively reveal via MapLibre GeoJSON update
            const animate = () => {
              if (!isPlayingRef.current) return
              const progress = Math.min((performance.now() - start) / DURATION, 1)
              const sliceEnd = Math.max(2, Math.ceil(progress * allCoords.length))
              const revealedCoords = allCoords.slice(0, sliceEnd)

              if (map.getSource(`ml-route-${wp.id}`)) {
                updateMaplibreRoute(map, wp.id, revealedCoords)
                setMaplibreRouteOpacity(map, wp.id, 0.9)
              } else {
                addMaplibreRoute(map, wp.id, revealedCoords, color, 0.9)
                mapRouteLinesRef.current.add(wp.id)
              }

              const tipIdx = Math.min(Math.floor(progress * (allCoords.length - 1)), allCoords.length - 1)
              const tip = allCoords[tipIdx] as [number, number]
              tipMarkerRef.current?.setLngLat(tip)
              if (tipIdx > 0) {
                const b = calcBearing(allCoords[tipIdx - 1] as [number, number], tip)
                const icon = tipMarkerRef.current?.getElement().firstElementChild as HTMLElement | null
                if (icon) icon.style.transform = `rotate(${b - TRANSPORT_BASE_ANGLE[wp.transportMode]}deg)`
              }

              if (progress < 1) {
                animFrameRef.current = requestAnimationFrame(animate)
              }
            }
            animFrameRef.current = requestAnimationFrame(animate)
          }
        }

        await flyAndWait(wp.coordinates, DURATION)

        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current)
          animFrameRef.current = null
        }

        tipMarkerRef.current?.remove()
        tipMarkerRef.current = null

        // Push fully-revealed fly segment into completed set
        if (allCoords.length >= 2 && wp.transportMode === 'fly') {
          completedSegments.push({
            id: wp.id,
            coords: allCoords,
            color,
            visibleCount: allCoords.length,
          })
          arcLayer.setSegments(completedSegments)
        }

        if (i < waypoints.length - 1 && isPlayingRef.current) {
          await sleep(600)
        }
      }
    } finally {
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
