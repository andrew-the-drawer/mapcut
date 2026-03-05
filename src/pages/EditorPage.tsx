import { useCallback, useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import KeyIcon from '../components/icons/KeyIcon'
import MapOnboarding from '../components/MapOnboarding'
import { ELocalStorageKey } from '../utils/constants'

// ── EditorPage ─────────────────────────────────────────────────────────────

export default function EditorPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [apiKey, setApiKey] = useState<string | null>(() => localStorage.getItem(ELocalStorageKey.MapTilerKey))
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => !localStorage.getItem(ELocalStorageKey.MapTilerKey))

  // Initialize (or re-initialize) map when apiKey changes
  useEffect(() => {
    if (!apiKey || !mapContainerRef.current) return

    // Tear down previous instance when key changes
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

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
      // Enable globe projection (MapLibre GL JS v5+)
      map.setProjection({ type: 'globe' })

      // Add terrain DEM for 3D elevation
      map.addSource('maptiler-dem', {
        type: 'raster-dem',
        url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${apiKey}`,
        tileSize: 256,
      })
      map.setTerrain({ source: 'maptiler-dem', exaggeration: 1.5 })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [apiKey])

  const handleSave = useCallback((mapTilerKey: string) => {
    setApiKey(mapTilerKey)
    setShowOnboarding(false)
  }, [])

  const handleCancel = useCallback(() => {
    setShowOnboarding(false)
  }, [])

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#070714]">

      {/* BYOK button — top-right, always visible when not in onboarding */}
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

      {/* Map container — always mounted so the ref stays valid */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Onboarding overlay — covers the map */}
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
