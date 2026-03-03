import { Link } from 'react-router'
import GlobeIcon from '../components/icons/GlobeIcon'
import CameraIcon from '../components/icons/CameraIcon'
import FilmIcon from '../components/icons/FilmIcon'
import ShareIcon from '../components/icons/ShareIcon'
import ArrowRightIcon from '../components/icons/ArrowRightIcon'
import CheckIcon from '../components/icons/CheckIcon'
import HeartIcon from '../components/icons/HeartIcon'
import GlobeIllustration from '../components/GlobeIllustration'

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
    title: 'Plot your journey',
    description: 'Click anywhere on the 3D globe to drop waypoints. Drag to reorder, name each stop, and define your route.',
  },
  {
    title: 'Attach your memories',
    description: 'For each waypoint, upload photos and videos, write rich notes, and set the camera angle and display timing.',
  },
  {
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
            <HeartIcon className="w-4 h-4 text-red-500 mx-1" />
            for every traveler
          </div>
        </div>
      </footer>

    </div>
  )
}
