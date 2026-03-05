import { useCallback, useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import KeyIcon from '../components/icons/KeyIcon'
import MapOnboarding from '../components/MapOnboarding'
import WaypointPanel, { type WaypointEntry } from '../components/WaypointPanel'
import { ELocalStorageKey } from '../utils/constants'
import { fetchRoute, TRANSPORT_COLORS, type TransportMode } from '../lib/map/pathUtils'

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
  const [mapLoaded, setMapLoaded] = useState(false)

  // Waypoint markers keyed by waypoint id
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  // Set of active route layer IDs currently added to the map
  const activeLayerIdsRef = useRef<Set<string>>(new Set())
  // Guard against double-fetching routes
  const fetchingIdsRef = useRef<Set<string>>(new Set())
  // Animation state
  const animFrameRef = useRef<number | null>(null)
  const isPlayingRef = useRef(false)
  const tipMarkerRef = useRef<maplibregl.Marker | null>(null)

  const [apiKey, setApiKey] = useState<string | null>(
    () => localStorage.getItem(ELocalStorageKey.MapTilerKey),
  )
  const [showOnboarding, setShowOnboarding] = useState<boolean>(
    () => !localStorage.getItem(ELocalStorageKey.MapTilerKey),
  )
  const [waypoints, setWaypoints] = useState<WaypointEntry[]>([])
  const [isAnimating, setIsAnimating] = useState(false)

  // ── Map init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!apiKey || !mapContainerRef.current) return

    // Capture ref values at effect-run time for use in cleanup
    const markers = markersRef.current
    const layers = activeLayerIdsRef.current

    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    setMapLoaded(false)
    markers.clear()
    layers.clear()

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: `https://api.maptiler.com/maps/satellite/style.json?key=${apiKey}`,
      center: [15, 25],
      zoom: 2,
      pitch: 45,
      bearing: 0,
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
      setMapLoaded(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
      markers.clear()
      layers.clear()
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
    const map = mapRef.current
    if (!map || !mapLoaded) return

    // Remove all existing route layers and sources
    for (const layerId of activeLayerIdsRef.current) {
      if (map.getLayer(layerId)) map.removeLayer(layerId)
      const sourceId = layerId.replace('-layer', '')
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
    activeLayerIdsRef.current.clear()

    // Add route layer for each segment that has computed coords
    for (let i = 1; i < waypoints.length; i++) {
      const wp = waypoints[i]
      if (!wp.routeCoords) continue

      const sourceId = `route-${wp.id}`
      const layerId = `route-${wp.id}-layer`
      const color = TRANSPORT_COLORS[wp.transportMode]

      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: wp.routeCoords },
          properties: {},
        },
      })

      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': color,
          'line-width': 3,
          'line-opacity': 0.85,
          
        },
        layout: { 'line-join': 'round', 'line-cap': 'round' },
      })
      activeLayerIdsRef.current.add(layerId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, waypoints.map(w => `${w.id}:${w.transportMode}:${w.routeCoords ? 'y' : 'n'}`).join('|')])

  // ── Fetch routes for waypoints that need them ───────────────────────────────

  useEffect(() => {
    for (let i = 1; i < waypoints.length; i++) {
      const wp = waypoints[i]
      const prev = waypoints[i - 1]
      if (!wp.routeLoading || fetchingIdsRef.current.has(wp.id)) continue

      fetchingIdsRef.current.add(wp.id)

      fetchRoute(prev.coordinates, wp.coordinates, wp.transportMode)
        .then(coords => {
          fetchingIdsRef.current.delete(wp.id)
          setWaypoints(wps =>
            wps.map(w =>
              w.id === wp.id ? { ...w, routeCoords: coords, routeLoading: false } : w,
            ),
          )
        })
        .catch(() => {
          fetchingIdsRef.current.delete(wp.id)
          setWaypoints(wps =>
            wps.map(w => (w.id === wp.id ? { ...w, routeLoading: false } : w)),
          )
        })
    }
  }, [waypoints])

  // ── Waypoint actions ────────────────────────────────────────────────────────

  const handleAddWaypoint = useCallback(
    (name: string, coordinates: [number, number]) => {
      const id = `wp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

      setWaypoints(prev => {
        const isFirst = prev.length === 0
        return [
          ...prev,
          {
            id,
            name,
            coordinates,
            transportMode: 'fly' as TransportMode,
            routeCoords: null,
            routeLoading: !isFirst,
          },
        ]
      })

      // Fly to the new waypoint
      mapRef.current?.flyTo({ center: coordinates, zoom: 6, duration: 2000, curve: 1.42 })
    },
    [],
  )

  const handleDeleteWaypoint = useCallback((id: string) => {
    fetchingIdsRef.current.delete(id)
    setWaypoints(prev => {
      const idx = prev.findIndex(w => w.id === id)
      if (idx === -1) return prev
      const next = [...prev]
      next.splice(idx, 1)

      // Waypoint that was AFTER the deleted one now needs a new route
      if (idx > 0 && idx < next.length) {
        fetchingIdsRef.current.delete(next[idx].id)
        next[idx] = { ...next[idx], routeCoords: null, routeLoading: true }
      } else if (idx === 0 && next.length > 0) {
        // Deleted the first waypoint — the new first has no incoming route
        next[0] = { ...next[0], routeCoords: null, routeLoading: false }
      }

      return next
    })
  }, [])

  const handleTransportModeChange = useCallback((id: string, mode: TransportMode) => {
    fetchingIdsRef.current.delete(id)
    setWaypoints(prev =>
      prev.map(wp =>
        wp.id === id ? { ...wp, transportMode: mode, routeCoords: null, routeLoading: true } : wp,
      ),
    )
  }, [])

  // ── Animation ───────────────────────────────────────────────────────────────

  // Restore all route sources to their full coordinate data
  const restoreAllRoutes = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    for (let i = 1; i < waypoints.length; i++) {
      const wp = waypoints[i]
      if (!wp.routeCoords) continue
      const source = map.getSource(`route-${wp.id}`) as maplibregl.GeoJSONSource | undefined
      source?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: wp.routeCoords },
        properties: {},
      })
      if (map.getLayer(`route-${wp.id}-layer`)) {
        map.setPaintProperty(`route-${wp.id}-layer`, 'line-opacity', 0.85)
      }
    }
  }, [waypoints])

  const playAnimation = useCallback(async () => {
    const map = mapRef.current
    if (!map || waypoints.length < 2 || isAnimating) return

    setIsAnimating(true)
    isPlayingRef.current = true

    const flyAndWait = (coords: [number, number], duration: number) =>
      new Promise<void>(resolve => {
        map.flyTo({ center: coords, zoom: 7, duration, curve: 1.42 })
        setTimeout(resolve, duration + 100)
      })

    const setSourceCoords = (sourceId: string, coords: [number, number][]) => {
      const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
      source?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      })
    }

    try {
      // Hide all route lines (set opacity to 0)
      for (const layerId of activeLayerIdsRef.current) {
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, 'line-opacity', 0)
        }
      }

      // Fly to the first waypoint
      await flyAndWait(waypoints[0].coordinates, 2000)
      if (!isPlayingRef.current) return

      // Animate each segment
      for (let i = 1; i < waypoints.length; i++) {
        if (!isPlayingRef.current) break

        const wp = waypoints[i]
        const sourceId = `route-${wp.id}`
        const layerId = `route-${wp.id}-layer`
        const allCoords = wp.routeCoords ?? []

        if (allCoords.length >= 2 && map.getLayer(layerId)) {
          // Reset source to just the first point stub, then make layer visible
          setSourceCoords(sourceId, [allCoords[0], allCoords[0]])
          map.setPaintProperty(layerId, 'line-opacity', 0.85)
        }

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
          // Grow the line by slicing coords on each frame
          const animate = () => {
            if (!isPlayingRef.current) return
            const progress = Math.min((performance.now() - start) / DURATION, 1)
            const count = Math.max(2, Math.floor(progress * allCoords.length))
            setSourceCoords(sourceId, allCoords.slice(0, count))
            const tip = allCoords[count - 1] as [number, number]
            tipMarkerRef.current?.setLngLat(tip)
            if (count >= 2) {
              const b = calcBearing(allCoords[count - 2] as [number, number], tip)
              const icon = tipMarkerRef.current?.getElement().firstElementChild as HTMLElement | null
              if (icon) icon.style.transform = `rotate(${b - TRANSPORT_BASE_ANGLE[wp.transportMode]}deg)`
            }
            if (progress < 1) {
              animFrameRef.current = requestAnimationFrame(animate)
            }
          }
          animFrameRef.current = requestAnimationFrame(animate)
        }

        await flyAndWait(wp.coordinates, DURATION)

        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current)
          animFrameRef.current = null
        }

        // Remove tip marker once segment is done
        tipMarkerRef.current?.remove()
        tipMarkerRef.current = null

        // Ensure fully revealed
        if (allCoords.length >= 2) setSourceCoords(sourceId, allCoords)

        if (i < waypoints.length - 1 && isPlayingRef.current) {
          await sleep(600)
        }
      }
    } finally {
      restoreAllRoutes()
      isPlayingRef.current = false
      setIsAnimating(false)
    }
  }, [waypoints, isAnimating, restoreAllRoutes])

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
