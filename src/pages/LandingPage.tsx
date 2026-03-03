import { Link } from 'react-router'

// ── Inline SVG icons ──────────────────────────────────────────────────────────

const GlobeIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
  </svg>
)

const CameraIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
  </svg>
)

const FilmIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M17.625 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M17.625 13.125h1.5m-1.5 0c-.621 0-1.125-.504-1.125-1.125v-1.5c0-.621.504-1.125 1.125-1.125" />
  </svg>
)

const MapPinIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
  </svg>
)

const ShareIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
  </svg>
)

const ArrowRightIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
  </svg>
)

const CheckIcon = () => (
  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
)

// ── Globe illustration ─────────────────────────────────────────────────────────

const GlobeIllustration = () => (
  <svg viewBox="0 0 400 400" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="globeOuterGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
        <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="sphereGradient" cx="36%" cy="32%" r="68%">
        <stop offset="0%" stopColor="#1e1b4b" />
        <stop offset="55%" stopColor="#0d0b2e" />
        <stop offset="100%" stopColor="#070714" />
      </radialGradient>
      <clipPath id="sphereClip">
        <circle cx="200" cy="200" r="150" />
      </clipPath>
      <filter id="waypointGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    {/* Outer ambient glow */}
    <circle cx="200" cy="200" r="190" fill="url(#globeOuterGlow)" />

    {/* Sphere body */}
    <circle cx="200" cy="200" r="150" fill="url(#sphereGradient)" />

    {/* Grid lines — clipped to sphere */}
    <g clipPath="url(#sphereClip)" opacity="0.18" stroke="#818cf8" strokeWidth="0.7" fill="none">
      {/* Latitude lines */}
      <ellipse cx="200" cy="200" rx="150" ry="52" />
      <ellipse cx="200" cy="150" rx="141" ry="49" />
      <ellipse cx="200" cy="100" rx="112" ry="39" />
      <ellipse cx="200" cy="250" rx="141" ry="49" />
      <ellipse cx="200" cy="300" rx="112" ry="39" />
      {/* Longitude lines */}
      <ellipse cx="200" cy="200" rx="2"   ry="150" />
      <ellipse cx="200" cy="200" rx="75"  ry="150" />
      <ellipse cx="200" cy="200" rx="130" ry="150" />
      <ellipse cx="200" cy="200" rx="75"  ry="150" transform="rotate(90 200 200)" />
    </g>

    {/* Sphere border */}
    <circle cx="200" cy="200" r="150" fill="none" stroke="#3730a3" strokeWidth="1.5" />

    {/* Specular highlight */}
    <ellipse cx="153" cy="152" rx="52" ry="34" fill="white" fillOpacity="0.05" transform="rotate(-28 153 152)" />

    {/* ── Flight paths ── */}
    <path d="M 118 158 Q 157 108 196 138" stroke="#818cf8" strokeWidth="1.5" fill="none" strokeDasharray="5 3" opacity="0.75" />
    <path d="M 196 138 Q 246 118 292 152" stroke="#818cf8" strokeWidth="1.5" fill="none" strokeDasharray="5 3" opacity="0.75" />
    <path d="M 292 152 Q 295 210 268 268" stroke="#818cf8" strokeWidth="1.5" fill="none" strokeDasharray="5 3" opacity="0.75" />

    {/* ── Waypoints ── */}
    {/* New York */}
    <circle cx="118" cy="158" r="12" fill="#6366f1" fillOpacity="0.2" className="waypoint-pulse" />
    <circle cx="118" cy="158" r="5.5" fill="#6366f1" filter="url(#waypointGlow)" />

    {/* Paris */}
    <circle cx="196" cy="138" r="12" fill="#6366f1" fillOpacity="0.2" className="waypoint-pulse" style={{ animationDelay: '0.5s' }} />
    <circle cx="196" cy="138" r="5.5" fill="#818cf8" filter="url(#waypointGlow)" />

    {/* Tokyo */}
    <circle cx="292" cy="152" r="12" fill="#6366f1" fillOpacity="0.2" className="waypoint-pulse" style={{ animationDelay: '1s' }} />
    <circle cx="292" cy="152" r="5.5" fill="#6366f1" filter="url(#waypointGlow)" />

    {/* Sydney */}
    <circle cx="268" cy="268" r="12" fill="#6366f1" fillOpacity="0.2" className="waypoint-pulse" style={{ animationDelay: '1.5s' }} />
    <circle cx="268" cy="268" r="5.5" fill="#818cf8" filter="url(#waypointGlow)" />

    {/* Animated travel dot */}
    <circle r="3.5" fill="white" opacity="0.9" filter="url(#waypointGlow)">
      <animateMotion dur="6s" repeatCount="indefinite" keyTimes="0;0.33;0.66;1" calcMode="spline" keySplines="0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1">
        <mpath href="#travelPath" />
      </animateMotion>
    </circle>

    {/* Hidden path for the animated dot */}
    <path id="travelPath" d="M 118 158 Q 157 108 196 138 Q 246 118 292 152 Q 295 210 268 268" fill="none" />
  </svg>
)

// ── Data ───────────────────────────────────────────────────────────────────────

const features = [
  {
    icon: <GlobeIcon className="w-5 h-5" />,
    title: 'Interactive 3D Globe',
    description: 'Drop waypoints anywhere on a real satellite globe. Smooth cinematic fly-to animations connect each stop of your journey.',
  },
  {
    icon: <CameraIcon />,
    title: 'Rich Media Per Stop',
    description: 'Attach photos, videos, and formatted notes to every destination. Your memories, exactly the way you want them shown.',
  },
  {
    icon: <FilmIcon />,
    title: 'Export as MP4',
    description: 'Encode a cinematic travel video directly in your browser using WebCodecs and FFmpeg — no server, no waiting.',
  },
  {
    icon: <ShareIcon />,
    title: 'Share as a File',
    description: 'Export your project as a portable .mapcut bundle. Anyone can open it, remix it, or re-export it.',
  },
]

const steps = [
  {
    icon: <MapPinIcon className="w-5 h-5" />,
    title: 'Plot your journey',
    description: 'Click anywhere on the 3D globe to drop waypoints. Drag to reorder, name each stop, and define your route.',
  },
  {
    icon: <CameraIcon />,
    title: 'Attach your memories',
    description: 'For each waypoint, upload photos and videos, write rich notes, and set the camera angle and display timing.',
  },
  {
    icon: <FilmIcon />,
    title: 'Export your film',
    description: 'Hit export and MapCut flies through your route — compositing your media at each stop into a shareable MP4.',
  },
]

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#070714] text-white antialiased">

      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#070714]/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <GlobeIcon className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold tracking-tight">MapCut</span>
        </div>
        <Link
          to="/editor"
          className="text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Open Editor
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
        {/* Background glows */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-indigo-900/20 rounded-full blur-[140px]" />
          <div className="absolute top-1/2 right-1/3 w-[350px] h-[350px] bg-violet-900/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 w-full grid lg:grid-cols-2 gap-16 items-center py-20">

          {/* Left: copy */}
          <div className="flex flex-col gap-6">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-indigo-400 bg-indigo-400/10 border border-indigo-400/20 rounded-full px-3 py-1 w-fit">
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" aria-hidden />
              No account required
            </div>

            <h1 className="text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight">
              Cinematic travel{' '}
              <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                stories
              </span>
              {' '}in your browser.
            </h1>

            <p className="text-lg text-gray-400 leading-relaxed max-w-lg">
              Plot your journey on an interactive 3D globe. Attach photos, videos, and notes to each destination.
              Export a cinematic MP4 — entirely in your browser, no upload, no account.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/editor"
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-6 py-3 rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-900/40"
              >
                Start for free
                <ArrowRightIcon />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 border border-white/10 hover:border-white/20 text-gray-300 hover:text-white font-medium px-6 py-3 rounded-xl transition-all"
              >
                See how it works
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-sm text-gray-500">
              {['Free, always', 'Data stays on device', 'No upload required'].map((t) => (
                <div key={t} className="flex items-center gap-1.5">
                  <CheckIcon />
                  {t}
                </div>
              ))}
            </div>
          </div>

          {/* Right: globe */}
          <div className="flex items-center justify-center">
            <div className="w-72 h-72 sm:w-96 sm:h-96 lg:w-[460px] lg:h-[460px]">
              <GlobeIllustration />
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">
              Everything you need to tell your story
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              A complete toolkit for turning travel memories into a cinematic experience.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 hover:bg-white/[0.05] transition-colors group"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-600/30 flex items-center justify-center mb-4 text-indigo-400 group-hover:bg-indigo-600/30 transition-colors">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">
              Three steps to your travel film
            </h2>
            <p className="text-gray-400 text-lg">
              From blank globe to exported video in minutes.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 relative">
            {/* Connector lines */}
            <div className="hidden lg:block absolute top-6 left-[calc(33.33%-1px)] right-[calc(33.33%-1px)] h-px bg-gradient-to-r from-transparent via-indigo-800/60 to-transparent" aria-hidden />

            {steps.map((step, i) => (
              <div key={step.title} className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-600/20 border border-indigo-600/40 flex items-center justify-center text-indigo-400 font-bold text-lg shrink-0 relative z-10 bg-[#070714]">
                    {i + 1}
                  </div>
                  <h3 className="font-semibold text-white text-lg">{step.title}</h3>
                </div>
                <p className="text-gray-400 leading-relaxed pl-16">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 border-t border-white/5">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <div className="relative bg-gradient-to-br from-indigo-950/60 to-violet-950/30 border border-indigo-800/30 rounded-3xl p-12 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-600/5 to-transparent pointer-events-none" aria-hidden />
            <div className="relative">
              <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">
                Start building your travel story
              </h2>
              <p className="text-gray-400 text-lg mb-8">
                No signup. No subscription. Open the editor and craft your journey.
              </p>
              <Link
                to="/editor"
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-4 rounded-xl transition-all text-lg hover:shadow-xl hover:shadow-indigo-900/50"
              >
                Open Editor — Free
                <ArrowRightIcon className="w-5 h-5" />
              </Link>
              <p className="text-sm text-gray-600 mt-4">Works in Chrome, Edge, and other modern browsers.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-indigo-700/60 flex items-center justify-center shrink-0">
              <GlobeIcon className="w-3 h-3 text-white" />
            </div>
            <span className="font-medium text-gray-400">MapCut</span>
            <span>· No login · No cloud · Your data, your device</span>
          </div>
          <div className="flex items-center gap-1">
            Built with
            <svg className="w-4 h-4 text-red-500 mx-1" fill="currentColor" viewBox="0 0 20 20" aria-label="love">
              <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
            </svg>
            for every traveler
          </div>
        </div>
      </footer>

    </div>
  )
}
