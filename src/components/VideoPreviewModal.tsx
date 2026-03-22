import type { PreviewState } from '../hooks/useVideoPreview'

// ── VideoPreviewModal ─────────────────────────────────────────────────────────

interface Props {
  state: PreviewState
  progress: number           // 0–1
  frameIndex: number
  totalFrames: number
  blobURL: string | null
  onCancel: () => void
  onClose: () => void
  onExportFullQuality: () => void
}

export default function VideoPreviewModal({
  state,
  progress,
  frameIndex,
  totalFrames,
  blobURL,
  onCancel,
  onClose,
  onExportFullQuality,
}: Props) {
  if (state === 'idle') return null

  const isRendering = state === 'rendering'
  const pct = Math.round(progress * 100)

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl mx-4 bg-gray-950 border border-white/15 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wider">
            {isRendering ? 'Generating Preview…' : 'Preview'}
          </h2>
          <button
            onClick={isRendering ? onCancel : onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-6">
          {isRendering ? (
            /* Progress view */
            <div className="space-y-4">
              {/* Progress bar */}
              <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-100"
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Stats */}
              <div className="flex items-center justify-between text-sm text-white/50">
                <span>
                  Rendering frame{' '}
                  <span className="text-white/80 font-mono">
                    {frameIndex.toLocaleString()}
                  </span>
                  {' / '}
                  <span className="text-white/80 font-mono">
                    {totalFrames.toLocaleString()}
                  </span>
                </span>
                <span className="text-white/80 font-semibold">{pct}%</span>
              </div>
            </div>
          ) : (
            /* Video player */
            blobURL && (
              <video
                src={blobURL}
                controls
                autoPlay
                loop
                className="w-full rounded-xl bg-black aspect-video"
              />
            )
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 pb-5">
          {isRendering ? (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-white/70 bg-white/8 border border-white/10 rounded-lg hover:bg-white/15 hover:text-white transition-colors"
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-white/70 bg-white/8 border border-white/10 rounded-lg hover:bg-white/15 hover:text-white transition-colors"
              >
                Close
              </button>
              <button
                onClick={onExportFullQuality}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600/80 border border-blue-500/40 rounded-lg hover:bg-blue-600 transition-colors"
              >
                Export Full Quality
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
