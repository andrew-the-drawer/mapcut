import { useCallback, useRef, useState } from 'react'
import { fetchRoute, type TransportMode } from '../lib/map/pathUtils'
import type { WaypointEntry } from '../components/WaypointPanel'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RoutePair = {
  rootCoords: [number, number][]
  loading: boolean
}

/**
 * Nested map of route data keyed by [fromWaypointId][toWaypointId].
 * Stored separately from WaypointEntry so waypoint state mutations don't
 * trigger route-unrelated effects.
 */
export type RouteCoordsMap = {
  [fromId: string]: {
    [toId: string]: RoutePair
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRouteCoords() {
  const [routeData, setRouteData] = useState<RouteCoordsMap>({})
  // AbortControllers keyed by `${fromId}-${toId}` to cancel in-flight fetches
  const controllersRef = useRef<Map<string, AbortController>>(new Map())

  const fetchAndStore = useCallback(
    (
      fromId: string,
      fromCoords: [number, number],
      toId: string,
      toCoords: [number, number],
      mode: TransportMode,
    ) => {
      const key = `${fromId}-${toId}`
      // Abort any previous fetch for this exact pair
      controllersRef.current.get(key)?.abort()
      const controller = new AbortController()
      controllersRef.current.set(key, controller)

      setRouteData(prev => ({
        ...prev,
        [fromId]: { ...prev[fromId], [toId]: { rootCoords: [], loading: true } },
      }))

      fetchRoute(fromCoords, toCoords, mode, controller.signal)
        .then(coords => {
          if (controller.signal.aborted) return
          controllersRef.current.delete(key)
          setRouteData(prev => ({
            ...prev,
            [fromId]: { ...prev[fromId], [toId]: { rootCoords: coords, loading: false } },
          }))
        })
        .catch(() => {
          if (controller.signal.aborted) return
          controllersRef.current.delete(key)
          setRouteData(prev => ({
            ...prev,
            [fromId]: { ...prev[fromId], [toId]: { rootCoords: [], loading: false } },
          }))
        })
    },
    [],
  )

  /** Abort and remove all route entries that involve the given waypoint id. */
  const removeWaypointRoutes = useCallback((id: string) => {
    for (const [key, controller] of controllersRef.current) {
      if (key.startsWith(`${id}-`) || key.endsWith(`-${id}`)) {
        controller.abort()
        controllersRef.current.delete(key)
      }
    }
    setRouteData(prev => {
      const next = { ...prev }
      delete next[id]
      for (const fromId of Object.keys(next)) {
        if (next[fromId][id]) {
          next[fromId] = { ...next[fromId] }
          delete next[fromId][id]
          if (Object.keys(next[fromId]).length === 0) delete next[fromId]
        }
      }
      return next
    })
  }, [])

  // ── Event callbacks ──────────────────────────────────────────────────────────

  /** Call after a new waypoint is appended. Fetches the incoming route if needed. */
  const onWaypointAdded = useCallback(
    (prevWp: WaypointEntry | null, newWp: WaypointEntry) => {
      if (!prevWp) return
      fetchAndStore(prevWp.id, prevWp.coordinates, newWp.id, newWp.coordinates, newWp.transportMode)
    },
    [fetchAndStore],
  )

  /**
   * Call before/after deleting a waypoint.
   * Cleans up all routes involving the deleted waypoint and re-fetches the
   * newly adjacent pair when applicable.
   */
  const onWaypointDeleted = useCallback(
    (deletedId: string, prevWp: WaypointEntry | null, nextWp: WaypointEntry | null) => {
      removeWaypointRoutes(deletedId)
      if (prevWp && nextWp) {
        fetchAndStore(prevWp.id, prevWp.coordinates, nextWp.id, nextWp.coordinates, nextWp.transportMode)
      }
    },
    [removeWaypointRoutes, fetchAndStore],
  )

  /** Call when a waypoint's transport mode changes. Aborts the stale fetch and re-fetches. */
  const onTransportModeChanged = useCallback(
    (prevWp: WaypointEntry, wp: WaypointEntry, newMode: TransportMode) => {
      const key = `${prevWp.id}-${wp.id}`
      controllersRef.current.get(key)?.abort()
      controllersRef.current.delete(key)
      setRouteData(prev => {
        if (!prev[prevWp.id]?.[wp.id]) return prev
        const next = { ...prev, [prevWp.id]: { ...prev[prevWp.id] } }
        delete next[prevWp.id][wp.id]
        return next
      })
      fetchAndStore(prevWp.id, prevWp.coordinates, wp.id, wp.coordinates, newMode)
    },
    [fetchAndStore],
  )

  return { routeData, onWaypointAdded, onWaypointDeleted, onTransportModeChanged }
}
