export type TransportMode = 'fly' | 'drive' | 'train' | 'walk'

export const TRANSPORT_COLORS: Record<TransportMode, string> = {
  fly: '#60a5fa',
  drive: '#fbbf24',
  train: '#f87171',
  walk: '#34d399',
}

export const TRANSPORT_LABELS: Record<TransportMode, string> = {
  fly: 'Fly',
  drive: 'Drive',
  train: 'Train',
  walk: 'Walk',
}

// Great-circle (geodesic) interpolation between two [lng, lat] points.
// Produces ~numPoints intermediate coordinates that correctly arc over the globe.
export function geodesicPath(
  from: [number, number],
  to: [number, number],
  numPoints = 100,
): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI

  const lat1 = toRad(from[1])
  const lng1 = toRad(from[0])
  const lat2 = toRad(to[1])
  const lng2 = toRad(to[0])

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2,
      ),
    )

  if (d === 0) return [from, to]

  const points: [number, number][] = []
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints
    const A = Math.sin((1 - f) * d) / Math.sin(d)
    const B = Math.sin(f * d) / Math.sin(d)
    const x =
      A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2)
    const y =
      A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2)
    const z = A * Math.sin(lat1) + B * Math.sin(lat2)
    const lat = toDeg(Math.atan2(z, Math.sqrt(x ** 2 + y ** 2)))
    const lng = toDeg(Math.atan2(y, x))
    points.push([lng, lat])
  }
  return points
}

async function fetchOSRMRoute(
  from: [number, number],
  to: [number, number],
  profile: 'driving' | 'foot',
  signal?: AbortSignal,
): Promise<[number, number][] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/${profile}/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.[0]) return null
    return data.routes[0].geometry.coordinates as [number, number][]
  } catch {
    return null
  }
}

// Fetch route coordinates for a given transport mode.
// Falls back to geodesic great-circle path if routing API returns no result.
export async function fetchRoute(
  from: [number, number],
  to: [number, number],
  mode: TransportMode,
  signal?: AbortSignal,
): Promise<[number, number][]> {
  if (mode === 'fly') return geodesicPath(from, to)

  const profile = mode === 'walk' ? 'foot' : 'driving'
  const coords = await fetchOSRMRoute(from, to, profile, signal)
  if (coords) return coords

  console.warn(`No ${mode} route found, falling back to geodesic interpolation`)
  return geodesicPath(from, to)
}
