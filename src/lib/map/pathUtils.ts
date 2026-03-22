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
// When cruiseAltMeters > 0, each point includes a Z altitude (meters above sea
// level) following a sine arc — peak at the midpoint, 0 at both endpoints.
export function geodesicPath(
  from: [number, number],
  to: [number, number],
  numPoints = 100,
  cruiseAltMeters = 0,
): number[][] {
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

  if (d === 0) return cruiseAltMeters > 0 ? [[...from, 0], [...to, 0]] : [from, to]

  const points: number[][] = []
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
    if (cruiseAltMeters > 0) {
      points.push([lng, lat, cruiseAltMeters * Math.sin(Math.PI * f)])
    } else {
      points.push([lng, lat])
    }
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

// Returns true if the route looks degenerate: fewer than 3 unique points,
// or all coords are suspiciously close to the origin (OSRM snapping failure).
function isDegenerate(
  coords: [number, number][],
  from: [number, number],
): boolean {
  if (coords.length < 3) return true
  const unique = new Set(coords.map(([lng, lat]) => `${lng.toFixed(4)},${lat.toFixed(4)}`))
  if (unique.size < 3) return true
  // If >90% of points are within 0.01° of the start, the route didn't go anywhere
  const nearStart = coords.filter(
    ([lng, lat]) => Math.abs(lng - from[0]) < 0.01 && Math.abs(lat - from[1]) < 0.01,
  )
  return nearStart.length / coords.length > 0.9
}

// Fetch route coordinates for a given transport mode.
// Falls back to geodesic great-circle path if routing API returns no result or a degenerate route.
export async function fetchRoute(
  from: [number, number],
  to: [number, number],
  mode: TransportMode,
  signal?: AbortSignal,
): Promise<number[][]> {
  if (mode === 'fly') {
    // Scale cruise altitude with great-circle distance so short hops arc gently
    // and intercontinental flights arc high — capped at 1,800 km.
    const toRad = (d: number) => (d * Math.PI) / 180
    const lat1 = toRad(from[1]), lat2 = toRad(to[1])
    const dLng = toRad(to[0] - from[0])
    const sinHalfD = Math.sqrt(
      Math.sin((lat2 - lat1) / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2,
    )
    const distM = 6_371_000 * 2 * Math.asin(sinHalfD)
    const cruiseAlt = Math.min(Math.max(distM * 0.12, 50_000), 1_800_000)
    return geodesicPath(from, to, 100, cruiseAlt)
  }

  const profile = mode === 'walk' ? 'foot' : 'driving'
  const coords = await fetchOSRMRoute(from, to, profile, signal)

  if (coords && !isDegenerate(coords, from)) return coords

  console.warn(
    `${mode} route from OSRM was ${coords ? 'degenerate' : 'unavailable'}, falling back to geodesic interpolation`,
  )
  return geodesicPath(from, to)
}
