import { useCallback, useEffect, useRef, useState } from 'react'
import { TRANSPORT_COLORS, TRANSPORT_LABELS, type TransportMode } from '../lib/map/pathUtils'

// ── Types ────────────────────────────────────────────────────────────────────

export interface WaypointEntry {
  id: string
  name: string
  coordinates: [number, number] // [lng, lat]
  transportMode: TransportMode  // transport mode FROM the previous waypoint to this one
}

interface GeocoderFeature {
  id: string
  place_name: string
  center: [number, number]
}

interface Props {
  waypoints: WaypointEntry[]
  apiKey: string
  isAnimating: boolean
  /** Set of waypoint ids (destination) whose incoming route is currently loading */
  routeLoadingIds: Set<string>
  onAdd: (name: string, coordinates: [number, number]) => void
  onDelete: (id: string) => void
  onTransportModeChange: (id: string, mode: TransportMode) => void
  onPlay: () => void
  onStop: () => void
  onPreview: () => void
}

// ── Transport mode icons (text-based, no external lib) ───────────────────────

const TRANSPORT_ICONS: Record<TransportMode, string> = {
  fly: '✈',
  drive: '🚗',
  train: '🚄',
  walk: '🚶',
}

// ── WaypointPanel ────────────────────────────────────────────────────────────

export default function WaypointPanel({
  waypoints,
  apiKey,
  isAnimating,
  routeLoadingIds,
  onAdd,
  onDelete,
  onTransportModeChange,
  onPlay,
  onStop,
  onPreview,
}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocoderFeature[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  // Debounced geocoding search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults([])
      setShowResults(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await fetch(
          `https://api.maptiler.com/geocoding/${encodeURIComponent(query.trim())}.json?key=${apiKey}&limit=5`,
        )
        if (!res.ok) return
        const data = await res.json()
        setResults(data.features ?? [])
        setShowResults(true)
      } catch {
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, apiKey])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = useCallback(
    (feature: GeocoderFeature) => {
      onAdd(feature.place_name, feature.center)
      setQuery('')
      setResults([])
      setShowResults(false)
    },
    [onAdd],
  )

  return (
    <div className="flex flex-col h-full w-72 bg-black/60 backdrop-blur-md border-r border-white/10 text-white select-none">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Waypoints</h2>
      </div>

      {/* Search */}
      <div ref={searchContainerRef} className="relative px-3 pt-3 pb-2">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            placeholder="Search places..."
            className="w-full bg-white/8 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-blue-400/60 focus:bg-white/12 transition-colors"
          />
          {isSearching && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Search results dropdown */}
        {showResults && results.length > 0 && (
          <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-gray-900/95 backdrop-blur-sm border border-white/15 rounded-lg overflow-hidden shadow-xl">
            {results.map(feature => (
              <button
                key={feature.id}
                onMouseDown={() => handleSelect(feature)}
                className="w-full text-left px-3 py-2.5 text-sm text-white/85 hover:bg-white/10 hover:text-white transition-colors border-b border-white/5 last:border-none truncate"
              >
                {feature.place_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Waypoint list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {waypoints.length === 0 && (
          <p className="text-center text-white/30 text-xs mt-6 leading-relaxed">
            Search for a place above
            <br />
            to add your first waypoint
          </p>
        )}

        {waypoints.map((wp, i) => (
          <div key={wp.id}>
            {/* Transport mode selector — shown between waypoints */}
            {i > 0 && (
              <div className="flex items-center gap-1 py-1.5 pl-3.5">
                <div
                  className="w-px self-stretch mx-0.5"
                  style={{ background: TRANSPORT_COLORS[wp.transportMode] + '60' }}
                />
                <div className="flex gap-0.5 ml-2">
                  {(Object.keys(TRANSPORT_LABELS) as TransportMode[]).map(mode => (
                    <button
                      key={mode}
                      onClick={() => onTransportModeChange(wp.id, mode)}
                      title={TRANSPORT_LABELS[mode]}
                      className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs transition-all ${
                        wp.transportMode === mode
                          ? 'bg-white/15 text-white font-medium'
                          : 'text-white/45 hover:text-white/75 hover:bg-white/8'
                      }`}
                      style={
                        wp.transportMode === mode
                          ? { color: TRANSPORT_COLORS[mode] }
                          : undefined
                      }
                    >
                      <span>{TRANSPORT_ICONS[mode]}</span>
                      <span className="hidden sm:inline">{TRANSPORT_LABELS[mode]}</span>
                    </button>
                  ))}
                </div>
                {routeLoadingIds.has(wp.id) && (
                  <div className="ml-auto mr-1 w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                )}
              </div>
            )}

            {/* Waypoint card */}
            <div className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/6 group">
              {/* Pin dot */}
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-offset-1 ring-offset-transparent"
                style={{
                  background: TRANSPORT_COLORS[i === 0 ? 'fly' : wp.transportMode],
                  '--tw-ring-color': TRANSPORT_COLORS[i === 0 ? 'fly' : wp.transportMode] + '50',
                } as React.CSSProperties}
              />

              {/* Name */}
              <span className="flex-1 text-sm text-white/90 truncate leading-tight">
                {wp.name.split(',')[0]}
                {wp.name.includes(',') && (
                  <span className="text-white/45 text-xs"> ,{wp.name.split(',').slice(1).join(',')}</span>
                )}
              </span>

              {/* Delete button */}
              <button
                onClick={() => onDelete(wp.id)}
                className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-white/50 hover:text-red-400 hover:bg-red-400/15 transition-all text-lg leading-none"
                aria-label={`Remove ${wp.name}`}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Play / Stop + Preview buttons */}
      <div className="px-3 pb-4 pt-2 border-t border-white/10 space-y-2">
        <button
          onClick={isAnimating ? onStop : onPlay}
          disabled={waypoints.length < 2}
          className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            waypoints.length < 2
              ? 'bg-white/5 text-white/25 cursor-not-allowed'
              : isAnimating
                ? 'bg-red-500/20 border border-red-400/40 text-red-300 hover:bg-red-500/30'
                : 'bg-blue-500/20 border border-blue-400/40 text-blue-300 hover:bg-blue-500/30'
          }`}
        >
          {isAnimating ? (
            <>
              <span className="text-base leading-none">■</span>
              Stop
            </>
          ) : (
            <>
              <span className="text-base leading-none">▶</span>
              Play Animation
            </>
          )}
        </button>

        <button
          onClick={onPreview}
          disabled={waypoints.length < 2 || isAnimating}
          className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            waypoints.length < 2 || isAnimating
              ? 'bg-white/5 text-white/25 cursor-not-allowed'
              : 'bg-purple-500/20 border border-purple-400/40 text-purple-300 hover:bg-purple-500/30'
          }`}
        >
          <span className="text-base leading-none">◉</span>
          Preview Video
        </button>
      </div>
    </div>
  )
}
