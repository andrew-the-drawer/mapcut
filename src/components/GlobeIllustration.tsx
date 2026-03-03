export default function GlobeIllustration() {
  return (
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
}
