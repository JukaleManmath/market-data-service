import { Suspense, lazy, useEffect, useState } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import axios from 'axios'
import { AlertTriangle, X, Zap, RefreshCw } from 'lucide-react'
import Sidebar from './components/layout/Sidebar'
import ParticleField from './components/3d/ParticleField'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Markets = lazy(() => import('./pages/Markets'))
const Crypto = lazy(() => import('./pages/Crypto'))
const Portfolio = lazy(() => import('./pages/Portfolio'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Alerts = lazy(() => import('./pages/Alerts'))
const AIInsights = lazy(() => import('./pages/AIInsights'))
const Docs = lazy(() => import('./pages/Docs'))

const PORTFOLIO_KEY = 'mip_portfolio_id'
const PORTFOLIO_NAME_KEY = 'mip_portfolio_name'
const BANNER_DISMISSED_KEY = 'mip_seed_banner_dismissed'

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 rounded-xl skeleton" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl skeleton" />
        ))}
      </div>
      <div className="h-64 rounded-2xl skeleton" />
    </div>
  )
}

interface DemoConfig {
  seeded: boolean
  portfolio_id: string | null
  portfolio_name: string | null
}

function SeedBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -60, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed top-0 left-64 right-0 z-50 flex items-center justify-between px-5 py-2.5 gap-4"
      style={{
        background: 'linear-gradient(90deg, rgba(245,158,11,0.15), rgba(245,158,11,0.08))',
        borderBottom: '1px solid rgba(245,158,11,0.25)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
        <p className="text-xs text-amber-200 font-medium truncate">
          <span className="font-semibold">Demo data active</span> — Seeded price history is displayed.
          Live Finnhub data loads in the background and will replace it automatically.
        </p>
        <span className="flex items-center gap-1 text-xs text-amber-400 flex-shrink-0">
          <RefreshCw size={11} className="animate-spin" style={{ animationDuration: '3s' }} />
          Syncing live data…
        </span>
      </div>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={onDismiss}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-amber-300 hover:text-white transition-colors flex-shrink-0"
        style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.2)' }}
      >
        <X size={12} />
        Dismiss
      </motion.button>
    </motion.div>
  )
}

export default function App() {
  const location = useLocation()
  const [showBanner, setShowBanner] = useState(false)

  // On mount: check /demo endpoint and auto-activate demo portfolio
  useEffect(() => {
    const alreadyDismissed = localStorage.getItem(BANNER_DISMISSED_KEY) === '1'
    if (alreadyDismissed) return

    axios.get<DemoConfig>('/demo').then(({ data }) => {
      if (!data.seeded || !data.portfolio_id) return

      // Auto-activate demo portfolio if none is saved yet
      if (!localStorage.getItem(PORTFOLIO_KEY)) {
        localStorage.setItem(PORTFOLIO_KEY, data.portfolio_id)
        localStorage.setItem(PORTFOLIO_NAME_KEY, data.portfolio_name ?? 'Demo Portfolio')
      }

      setShowBanner(true)
    }).catch(() => {
      // /demo not available — no seed data, silent fail
    })
  }, [])

  const dismissBanner = () => {
    setShowBanner(false)
    localStorage.setItem(BANNER_DISMISSED_KEY, '1')
    // Tell the backend to clear the seed flag
    axios.delete('/demo').catch(() => {})
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--c-bg)' }}>
      {/* 3D background */}
      <ParticleField />

      {/* Ambient glow accents */}
      <div
        className="fixed pointer-events-none"
        style={{
          top: '-15%', right: '-5%',
          width: '55vw', height: '55vw',
          background: 'radial-gradient(ellipse, var(--c-glow-tr) 0%, transparent 65%)',
          zIndex: 0,
        }}
      />
      <div
        className="fixed pointer-events-none"
        style={{
          bottom: '-10%', left: '-5%',
          width: '45vw', height: '45vw',
          background: 'radial-gradient(ellipse, var(--c-glow-bl) 0%, transparent 65%)',
          zIndex: 0,
        }}
      />
      <div
        className="fixed pointer-events-none"
        style={{
          top: '40%', left: '30%',
          width: '30vw', height: '30vw',
          background: 'radial-gradient(ellipse, var(--c-glow-mid) 0%, transparent 70%)',
          zIndex: 0,
        }}
      />

      {/* Seed data warning banner */}
      <AnimatePresence>
        {showBanner && <SeedBanner onDismiss={dismissBanner} />}
      </AnimatePresence>

      {/* Sidebar */}
      <Sidebar />

      {/* Main content — pushed down when banner is visible */}
      <main
        className="relative transition-all duration-300"
        style={{
          marginLeft: '256px',
          paddingTop: showBanner ? '40px' : '0',
          zIndex: 10,
        }}
      >
        <div className="min-h-screen p-8">
          <AnimatePresence mode="wait">
            <Suspense fallback={<PageSkeleton />}>
              <Routes location={location} key={location.pathname}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/markets" element={<Markets />} />
                <Route path="/crypto" element={<Crypto />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/insights" element={<AIInsights />} />
                <Route path="/docs" element={<Docs />} />
              </Routes>
            </Suspense>
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
