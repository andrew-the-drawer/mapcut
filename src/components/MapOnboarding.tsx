import { useState } from 'react'
import KeyIcon from './icons/KeyIcon'
import ExternalLinkIcon from './icons/ExternalLinkIcon'

export const LS_KEY = 'maptiler_key'

export interface MapOnboardingProps {
  onKey: (key: string) => void
  onCancel?: () => void
  isUpdate: boolean
}

export default function MapOnboarding({ onKey, onCancel, isUpdate }: MapOnboardingProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Please enter a valid API key.')
      return
    }
    localStorage.setItem(LS_KEY, trimmed)
    onKey(trimmed)
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-[#070714]">
      {/* Card */}
      <div className="w-full max-w-md mx-4 bg-[#0d1117] border border-white/10 rounded-2xl p-8 shadow-2xl">

        {/* Header */}
        <div className="mb-6">
          <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-5">
            <KeyIcon className="w-5 h-5 text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-white">
            {isUpdate ? 'Update MapTiler API Key' : 'Connect MapTiler Cloud'}
          </h2>
          <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">
            MapCut uses MapTiler for 3D satellite maps and terrain.
            Your key is stored locally in your browser and never sent to any server.
          </p>
        </div>

        {/* Steps — only shown on first-time setup */}
        {!isUpdate && (
          <ol className="mb-6 space-y-2.5 text-sm text-gray-300">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400 flex items-center justify-center font-medium">1</span>
              <span>
                Go to{' '}
                <a
                  href="https://cloud.maptiler.com/account/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors duration-150 cursor-pointer"
                >
                  cloud.maptiler.com
                  <ExternalLinkIcon className="w-3 h-3" />
                </a>
                {' '}and create a free account.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400 flex items-center justify-center font-medium">2</span>
              <span>Navigate to <strong className="text-white font-medium">Account → API keys</strong>.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400 flex items-center justify-center font-medium">3</span>
              <span>Copy your default key and paste it below.</span>
            </li>
          </ol>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={value}
            onChange={e => { setValue(e.target.value); setError('') }}
            placeholder="Paste your MapTiler API key"
            autoFocus
            spellCheck={false}
            className="w-full bg-[#1a1f2e] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-colors duration-150 font-mono"
          />
          {error && (
            <p className="text-red-400 text-xs">{error}</p>
          )}
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-medium py-3 rounded-lg transition-colors duration-150 cursor-pointer"
          >
            {isUpdate ? 'Update Key' : 'Connect & Open Editor'}
          </button>
          {isUpdate && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full text-sm text-gray-400 hover:text-gray-200 py-2 transition-colors duration-150 cursor-pointer"
            >
              Cancel
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
