import { HashRouter, Routes, Route } from 'react-router'
import LandingPage from './pages/LandingPage'
import EditorPage from './pages/EditorPage'
import './App.css'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/editor" element={<EditorPage />} />
      </Routes>
    </HashRouter>
  )
}
