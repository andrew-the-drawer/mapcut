import * as THREE from 'three'
import maplibregl from 'maplibre-gl'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'

const EARTH_RADIUS = 6_371_008.8 // meters, matches MapLibre's earthRadius

// Convert lng/lat/alt to unit-sphere coordinates matching MapLibre's globe convention.
// See angularCoordinatesRadiansToVector in maplibre-gl source.
function lngLatAltToGlobe(lng: number, lat: number, altMeters: number): [number, number, number] {
  const lngRad = (lng * Math.PI) / 180
  const latRad = (lat * Math.PI) / 180
  const r = 1.0 + altMeters / EARTH_RADIUS
  return [
    Math.sin(lngRad) * Math.cos(latRad) * r,
    Math.sin(latRad) * r,
    Math.cos(lngRad) * Math.cos(latRad) * r,
  ]
}

export interface ArcSegment {
  id: string
  coords: number[][]   // [lng, lat, altMeters][]
  color: string        // hex color
  visibleCount: number // how many coords are visible
}

export class ArcCustomLayer implements maplibregl.CustomLayerInterface {
  readonly id = 'arc-layer'
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.Camera
  private segments = new Map<string, { line: Line2; coords: number[][] }>()
  private map?: maplibregl.Map
  private _resizeHandler?: () => void

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    })
    this.renderer.autoClear = false

    this.scene = new THREE.Scene()
    this.camera = new THREE.Camera()
    this.camera.matrixAutoUpdate = false

    this._resizeHandler = () => {
      const canvas = map.getCanvas();
      const { clientWidth: w, clientHeight: h } = canvas
      this.segments.forEach(({ line }) => {
        ;(line.material as LineMaterial).resolution.set(w, h)
      })
    }
    map.on('resize', this._resizeHandler)
  }

  onRemove(_map: maplibregl.Map, _gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    if (this.map && this._resizeHandler) {
      this.map.off('resize', this._resizeHandler)
    }

    this.segments.forEach(({ line }) => {
      line.geometry.dispose()
      ;(line.material as LineMaterial).dispose()
      this.scene.remove(line)
    })
    this.segments.clear()
    this.renderer.dispose()
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, args: maplibregl.CustomRenderMethodInput): void {
    this.camera.projectionMatrix.fromArray(args.modelViewProjectionMatrix)

    this.renderer.resetState()
    this.renderer.render(this.scene, this.camera)

    this.map?.triggerRepaint();
  }

  setSegments(desired: ArcSegment[]): void {
    const desiredIds = new Set(desired.map(s => s.id))

    for (const [id, { line }] of this.segments) {
      if (!desiredIds.has(id)) {
        this.scene.remove(line)
        line.geometry.dispose()
        ;(line.material as LineMaterial).dispose()
        this.segments.delete(id)
      }
    }

    for (const seg of desired) {
      const existing = this.segments.get(seg.id)
      if (existing) {
        ;(existing.line.material as LineMaterial).color.set(seg.color)
        this.updateAnimation(seg.id, seg.visibleCount)
      } else {
        const line = this._buildLine(
          seg.coords.slice(0, seg.visibleCount),
          seg.color,
        )
        this.scene.add(line)
        this.segments.set(seg.id, { line, coords: seg.coords })
      }
    }
    this.map?.triggerRepaint()
  }

  updateAnimation(id: string, visibleCount: number): void {
    const entry = this.segments.get(id)
    if (!entry) return

    const sliced = entry.coords.slice(0, Math.max(2, visibleCount))
    const positions: number[] = []
    for (const pt of sliced) {
      const [gx, gy, gz] = lngLatAltToGlobe(pt[0], pt[1], pt[2] ?? 0)
      positions.push(gx, gy, gz)
    }

    ;(entry.line.geometry as LineGeometry).setPositions(positions)
    entry.line.computeLineDistances()
    this.map?.triggerRepaint()
  }

  private _buildLine(coords: number[][], color: string, width = 3): Line2 {
    const positions: number[] = []
    for (const pt of coords) {
      const [gx, gy, gz] = lngLatAltToGlobe(pt[0], pt[1], pt[2] ?? 0)
      positions.push(gx, gy, gz)
    }

    const geometry = new LineGeometry()
    geometry.setPositions(positions)

    const canvas = (this.renderer.getContext() as WebGL2RenderingContext).canvas as HTMLCanvasElement
    const material = new LineMaterial({
      color: new THREE.Color(color),
      linewidth: width,
      resolution: new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
      depthTest: true,
      transparent: false,
      opacity: 1,
    })

    const line = new Line2(geometry, material)
    line.computeLineDistances()
    return line
  }
}
