// Shared map rendering utilities used by both on-screen animation and preview renderer.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildRevealGradient(color: string, progress: number): any {
  if (progress >= 1) {
    return ['interpolate', ['linear'], ['line-progress'], 0, color, 1, color]
  }
  if (progress <= 0) {
    return ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,0)']
  }
  const p = Math.min(progress, 0.998)
  return [
    'interpolate', ['linear'], ['line-progress'],
    0,         color,
    p,         color,
    p + 0.001, 'rgba(0,0,0,0)',
    1,         'rgba(0,0,0,0)',
  ]
}
