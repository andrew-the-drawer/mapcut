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
  private segments = new Map<string, { line: Line2; coords: number[][]; totalSegments: number }>()
  private map?: maplibregl.Map
  private _resizeHandler?: () => void
  private _mvpMatrix = new THREE.Matrix4()
  private _projVec = new THREE.Vector4()   // Opt 3: reuse to avoid per-call allocation
  private _animating = false               // Opt 4: idle-repaint guard

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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    this._mvpMatrix.fromArray(args.modelViewProjectionMatrix)
    this.camera.projectionMatrix.copy(this._mvpMatrix)

    this.renderer.resetState()
    this.renderer.render(this.scene, this.camera)

    if (this._animating) this.map?.triggerRepaint()  // Opt 4: skip idle repaints
  }

  /** Opt 4: call setAnimating(true) at animation start, false at end */
  setAnimating(value: boolean): void {
    this._animating = value
    if (value) this.map?.triggerRepaint()
  }

  /**
   * Project a lng/lat/alt coordinate to screen pixel coordinates using the
   * latest MVP matrix from the render loop.
   */
  projectToScreen(lng: number, lat: number, altMeters: number): { x: number; y: number } | null {
    const [gx, gy, gz] = lngLatAltToGlobe(lng, lat, altMeters)
    const vec = this._projVec.set(gx, gy, gz, 1).applyMatrix4(this._mvpMatrix)  // Opt 3: reuse
    if (vec.w <= 0) return null // behind camera
    const ndcX = vec.x / vec.w
    const ndcY = vec.y / vec.w
    const canvas = this.map!.getCanvas()
    return {
      x: ((ndcX + 1) / 2) * canvas.clientWidth,
      y: ((1 - ndcY) / 2) * canvas.clientHeight,
    }
  }

  setSegments(desired: ArcSegment[]): void {
    const desiredIds = new Set(desired.map(s => s.id))

    for (const [id, { line }] of this.segments) {
      if (!desiredIds.has(id)) {
        this.scene.remove(line)
        line.geometry.dispose()
        line.material.dispose()
        this.segments.delete(id)
      }
    }

    for (const seg of desired) {
      const existing = this.segments.get(seg.id)
      if (existing) {
        ;(existing.line.material as LineMaterial).color.set(seg.color)
        this.updateAnimation(seg.id, seg.visibleCount)
      } else {
        // Always build the line with ALL coordinates so the GPU buffer is fully
        // allocated once. We control how much of the line is visible via
        // geometry.instanceCount — no per-frame buffer reallocation needed.
        const line = this._buildLine(seg.coords, seg.color)
        const totalSegments = Math.max(seg.coords.length - 1, 1)
        const visibleSegments = Math.max(Math.min(seg.visibleCount, seg.coords.length) - 1, 1)
        line.geometry.instanceCount = visibleSegments
        this.scene.add(line)
        this.segments.set(seg.id, { line, coords: seg.coords, totalSegments })
      }
    }
  }

  updateAnimation(id: string, visibleCount: number): void {
    const entry = this.segments.get(id)
    if (!entry) return

    const clamped = Math.max(2, Math.min(visibleCount, entry.coords.length))
    entry.line.geometry.instanceCount = clamped - 1
  }

  private _buildLine(coords: number[][], color: string, width = 8): Line2 {
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
