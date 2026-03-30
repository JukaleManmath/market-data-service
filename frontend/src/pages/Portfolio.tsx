import axios from 'axios'
import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Plus, Trash2, X, TrendingUp, TrendingDown, AlertCircle,
  Briefcase, ChevronRight, Loader2, DollarSign, BarChart2, Layers,
  ShieldAlert, Activity, Target, Bitcoin, ChevronDown,
} from 'lucide-react'
import {
  fetchSnapshot, fetchPortfolioRisk, createPortfolio, addPosition,
  closePosition, deletePortfolio,
} from '../api/client'
import type { PortfolioSnapshot, RiskResponse, PositionSnapshot } from '../types'

const PORTFOLIO_KEY = 'mip_portfolio_id'
const PORTFOLIO_NAME_KEY = 'mip_portfolio_name'
const PORTFOLIO_TYPE_KEY = 'mip_portfolio_type'
const PORTFOLIOS_LIST_KEY = 'mip_portfolios'

interface PortfolioEntry { id: string; name: string; type: string }

const fmtUsd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)

const fmtPct = (n: number) =>
  `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`

const CHART_COLORS = ['#5E6AD2', '#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444']

interface AddPositionForm {
  symbol: string
  quantity: string
  price: string
}

// ── 3D Tilt card ──────────────────────────────────────────────────────────────
function TiltCard({
  children,
  className = '',
  style,
  onClick,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
}) {
  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const rotateX = useSpring(rawY, { stiffness: 280, damping: 28 })
  const rotateY = useSpring(rawX, { stiffness: 280, damping: 28 })

  return (
    <motion.div
      className={`relative overflow-hidden ${className}`}
      style={{ rotateX, rotateY, transformPerspective: 700, ...style }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        rawX.set(((e.clientX - rect.left) / rect.width - 0.5) * 18)
        rawY.set(-((e.clientY - rect.top) / rect.height - 0.5) * 18)
      }}
      onMouseLeave={() => { rawX.set(0); rawY.set(0) }}
      onClick={onClick}
    >
      {/* Top-edge shimmer line */}
      <div className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)' }} />
      {children}
    </motion.div>
  )
}

// ── Animated counter ──────────────────────────────────────────────────────────
function AnimatedCounter({ target, format }: { target: number; format: (n: number) => string }) {
  const prev = useRef(0)
  const [display, setDisplay] = useState(format(0))

  useEffect(() => {
    const from = prev.current
    const to = target
    const duration = 900
    const start = performance.now()

    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(format(from + (to - from) * eased))
      if (p < 1) requestAnimationFrame(tick)
      else prev.current = to
    }
    requestAnimationFrame(tick)
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  return <span className="tabular">{display}</span>
}

// ── Risk progress bar ─────────────────────────────────────────────────────────
function RiskBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(Math.abs(value) / max, 1) * 100
  return (
    <div className="w-full h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
      <motion.div
        className="h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
        style={{ background: `linear-gradient(90deg, ${color}88, ${color})` }}
      />
    </div>
  )
}

export default function Portfolio() {
  const [portfolioId, setPortfolioId] = useState<string | null>(
    () => localStorage.getItem(PORTFOLIO_KEY)
  )
  const [portfolioName, setPortfolioName] = useState<string>(
    () => localStorage.getItem(PORTFOLIO_NAME_KEY) ?? 'My Portfolio'
  )
  const [portfolioType, setPortfolioType] = useState<string>(
    () => localStorage.getItem(PORTFOLIO_TYPE_KEY) ?? 'stock'
  )
  const [portfoliosList, setPortfoliosList] = useState<PortfolioEntry[]>(() => {
    try {
      const stored: PortfolioEntry[] = JSON.parse(localStorage.getItem(PORTFOLIOS_LIST_KEY) ?? '[]')
      if (stored.length > 0) return stored
      // Bootstrap from single-portfolio keys if they exist
      const existingId = localStorage.getItem(PORTFOLIO_KEY)
      const existingName = localStorage.getItem(PORTFOLIO_NAME_KEY)
      const existingType = localStorage.getItem(PORTFOLIO_TYPE_KEY) ?? 'stock'
      if (existingId && existingName) {
        const bootstrapped: PortfolioEntry[] = [{ id: existingId, name: existingName, type: existingType }]
        localStorage.setItem(PORTFOLIOS_LIST_KEY, JSON.stringify(bootstrapped))
        return bootstrapped
      }
      return []
    } catch { return [] }
  })
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null)
  const [risk, setRisk] = useState<RiskResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(!localStorage.getItem(PORTFOLIO_KEY))
  const [showAddPos, setShowAddPos] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPortfolioType, setNewPortfolioType] = useState<'stock' | 'crypto'>('stock')
  const [form, setForm] = useState<AddPositionForm>({ symbol: '', quantity: '', price: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = async (id: string) => {
    setLoading(true)
    try {
      const [snap, rsk] = await Promise.all([
        fetchSnapshot(id),
        fetchPortfolioRisk(id).catch(() => null),
      ])
      setSnapshot(snap)
      setRisk(rsk)
    } catch {
      setError('Failed to load portfolio data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (portfolioId) loadData(portfolioId)
  }, [portfolioId])

  const activatePortfolio = (entry: PortfolioEntry) => {
    localStorage.setItem(PORTFOLIO_KEY, entry.id)
    localStorage.setItem(PORTFOLIO_NAME_KEY, entry.name)
    localStorage.setItem(PORTFOLIO_TYPE_KEY, entry.type)
    setPortfolioId(entry.id)
    setPortfolioName(entry.name)
    setPortfolioType(entry.type)
    setShowCreate(false)
    setShowSwitcher(false)
    setSnapshot(null)
    setRisk(null)
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSubmitting(true)
    try {
      const p = await createPortfolio(newName.trim(), newPortfolioType)
      const entry: PortfolioEntry = { id: p.id, name: p.name, type: newPortfolioType }
      const updated = [...portfoliosList, entry]
      localStorage.setItem(PORTFOLIOS_LIST_KEY, JSON.stringify(updated))
      setPortfoliosList(updated)
      activatePortfolio(entry)
      setNewName('')
      setNewPortfolioType('stock')
    } catch {
      setError('Failed to create portfolio')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddPosition = async () => {
    const qty = parseFloat(form.quantity)
    const price = parseFloat(form.price)

    if (!portfolioId) { setError('No portfolio selected'); return }
    if (!form.symbol.trim()) { setError('Symbol is required'); return }
    if (isNaN(qty) || qty <= 0) { setError('Quantity must be a positive number'); return }
    if (isNaN(price) || price <= 0) { setError('Price must be a positive number'); return }

    setSubmitting(true)
    setError(null)
    try {
      const provider = portfolioType === 'crypto' ? 'binance' : 'finnhub'
      await addPosition(portfolioId, form.symbol.trim().toUpperCase(), qty, price, provider)
      setForm({ symbol: '', quantity: '', price: '' })
      setShowAddPos(false)
      await loadData(portfolioId)
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.data?.detail) {
        setError(`Failed to add position: ${e.response.data.detail}`)
      } else {
        setError('Failed to add position — check that the symbol is valid')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleClosePosition = async (posId: string) => {
    if (!portfolioId) return
    await closePosition(portfolioId, posId).catch(() => null)
    await loadData(portfolioId)
  }

  const handleDeletePortfolio = async () => {
    if (!portfolioId || !confirm('Delete this portfolio? This cannot be undone.')) return
    await deletePortfolio(portfolioId).catch(() => null)
    const updated = portfoliosList.filter(p => p.id !== portfolioId)
    localStorage.setItem(PORTFOLIOS_LIST_KEY, JSON.stringify(updated))
    setPortfoliosList(updated)
    localStorage.removeItem(PORTFOLIO_KEY)
    localStorage.removeItem(PORTFOLIO_NAME_KEY)
    localStorage.removeItem(PORTFOLIO_TYPE_KEY)
    setPortfolioId(null)
    setPortfolioType('stock')
    setSnapshot(null)
    setRisk(null)
    if (updated.length > 0) {
      activatePortfolio(updated[updated.length - 1])
    } else {
      setShowCreate(true)
    }
  }

  const pieData = snapshot?.positions.map(p => ({
    name: p.symbol,
    value: p.market_value,
  })) ?? []

  const totalPnl = snapshot?.total_pnl ?? 0
  const totalValue = snapshot?.total_value ?? 0
  const costBasis = totalValue - totalPnl
  const returnPct = costBasis > 0 ? totalPnl / costBasis : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6 relative"
    >
      {/* Page-level ambient glow */}
      <div className="fixed pointer-events-none" style={{
        top: 0, right: 0,
        width: '45vw', height: '45vh',
        background: 'radial-gradient(ellipse at top right, rgba(94,106,210,0.09) 0%, transparent 65%)',
        zIndex: 1,
      }} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <motion.div
            animate={{
              boxShadow: [
                '0 0 16px rgba(94,106,210,0.35)',
                '0 0 36px rgba(94,106,210,0.65)',
                '0 0 16px rgba(94,106,210,0.35)',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #5E6AD2, #06b6d4)' }}
          >
            <Briefcase size={20} className="text-white" />
          </motion.div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Portfolio switcher */}
              {portfolioId && portfoliosList.length > 1 ? (
                <div className="relative">
                  <button
                    onClick={() => setShowSwitcher(v => !v)}
                    className="flex items-center gap-1.5 text-2xl font-bold text-white hover:text-white/80 transition-colors"
                    style={{ fontFamily: 'Space Grotesk, Inter, sans-serif', letterSpacing: '-0.02em' }}
                  >
                    {portfolioName}
                    <ChevronDown size={16} className="text-white/40 mt-1" />
                  </button>
                  <AnimatePresence>
                    {showSwitcher && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 mt-2 z-50 min-w-48 rounded-xl overflow-hidden"
                        style={{
                          background: '#0a0a0a',
                          border: '1px solid rgba(255,255,255,0.1)',
                          boxShadow: '0 16px 40px rgba(0,0,0,0.8)',
                        }}
                      >
                        {portfoliosList.map(p => (
                          <button
                            key={p.id}
                            onClick={() => activatePortfolio(p)}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors hover:bg-white/05"
                            style={{ color: p.id === portfolioId ? 'white' : 'rgba(255,255,255,0.5)' }}
                          >
                            {p.type === 'crypto'
                              ? <Bitcoin size={13} style={{ color: '#f7931a' }} />
                              : <Briefcase size={13} className="text-indigo-400" />}
                            <span className="flex-1">{p.name}</span>
                            {p.id === portfolioId && (
                              <span className="w-1.5 h-1.5 rounded-full bg-white/60 flex-shrink-0" />
                            )}
                          </button>
                        ))}
                        <div
                          className="border-t px-4 py-2"
                          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
                        >
                          <button
                            onClick={() => { setShowSwitcher(false); setShowCreate(true) }}
                            className="flex items-center gap-2 text-xs text-white/35 hover:text-white/60 transition-colors"
                          >
                            <Plus size={11} /> New portfolio
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <h1
                  className="text-2xl font-bold text-white"
                  style={{ fontFamily: 'Space Grotesk, Inter, sans-serif', letterSpacing: '-0.02em' }}
                >
                  {portfolioId ? portfolioName : 'Portfolio'}
                </h1>
              )}
              {/* Type badge */}
              {portfolioId && (
                <span
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                  style={
                    portfolioType === 'crypto'
                      ? { background: 'rgba(247,147,26,0.12)', border: '1px solid rgba(247,147,26,0.25)', color: '#f7931a' }
                      : { background: 'rgba(94,106,210,0.12)', border: '1px solid rgba(94,106,210,0.25)', color: '#8b96e9' }
                  }
                >
                  {portfolioType === 'crypto' ? <Bitcoin size={9} /> : <Briefcase size={9} />}
                  {portfolioType === 'crypto' ? 'Crypto' : 'Stocks'}
                </span>
              )}
              {snapshot && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold ${
                    totalPnl >= 0
                      ? 'text-emerald-400'
                      : 'text-red-400'
                  }`}
                  style={{
                    background: totalPnl >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                    border: `1px solid ${totalPnl >= 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                  }}
                >
                  {totalPnl >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {fmtPct(returnPct)}
                </motion.span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">Position management & risk metrics</p>
          </div>
        </div>

        {portfolioId && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => { setShowCreate(v => !v) }}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              <Plus size={13} />
              New
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03, boxShadow: '0 0 30px rgba(94,106,210,0.45)' }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowAddPos(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{
                background: 'linear-gradient(135deg, #5E6AD2, #4f59b8)',
                boxShadow: '0 0 20px rgba(94,106,210,0.3)',
                border: '1px solid rgba(94,106,210,0.4)',
              }}
            >
              <Plus size={15} />
              Add Position
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleDeletePortfolio}
              className="p-2.5 rounded-xl text-slate-500 hover:text-red-400 transition-colors"
              style={{
                border: '1px solid rgba(255,255,255,0.07)',
                background: 'var(--c-card)',
              }}
            >
              <Trash2 size={15} />
            </motion.button>
          </div>
        )}
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-red-300"
            style={{
              background: 'rgba(239,68,68,0.07)',
              border: '1px solid rgba(239,68,68,0.2)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <AlertCircle size={15} className="flex-shrink-0 text-red-400" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400/50 hover:text-red-400 transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Create portfolio ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="rounded-2xl p-12 flex flex-col items-center gap-7 text-center relative overflow-hidden"
            style={{
              background: 'var(--c-card)',
              border: '1px solid rgba(94, 106, 210, 0.2)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Ambient radial */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: 'radial-gradient(ellipse at 50% 0%, rgba(94,106,210,0.14) 0%, transparent 60%)',
            }} />
            {/* Bottom glow */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-24 pointer-events-none" style={{
              background: 'radial-gradient(ellipse, rgba(6,182,212,0.1) 0%, transparent 70%)',
            }} />

            <motion.div
              animate={{ y: [0, -7, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(94,106,210,0.25), rgba(6,182,212,0.15))',
                border: '1px solid rgba(94,106,210,0.3)',
                boxShadow: '0 0 40px rgba(94,106,210,0.2)',
              }}
            >
              <Briefcase size={32} className="text-indigo-400" />
            </motion.div>

            <div>
              <h3 className="text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, Inter, sans-serif' }}>
                Create your portfolio
              </h3>
              <p className="text-sm text-slate-400 mt-2 max-w-sm leading-relaxed">
                Track positions, live P&L, risk metrics, and get AI-powered portfolio analysis.
              </p>
            </div>

            {/* Type toggle */}
            <div className="flex gap-1.5 p-1 rounded-xl w-full max-w-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {(['stock', 'crypto'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setNewPortfolioType(t)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all"
                  style={
                    newPortfolioType === t
                      ? t === 'crypto'
                        ? { background: 'rgba(247,147,26,0.18)', color: '#f7931a', border: '1px solid rgba(247,147,26,0.3)' }
                        : { background: 'rgba(94,106,210,0.18)', color: '#8b96e9', border: '1px solid rgba(94,106,210,0.3)' }
                      : { background: 'transparent', color: 'rgba(255,255,255,0.3)', border: '1px solid transparent' }
                  }
                >
                  {t === 'crypto' ? <Bitcoin size={11} /> : <Briefcase size={11} />}
                  {t === 'stock' ? 'Stocks' : 'Crypto'}
                </button>
              ))}
            </div>

            <div className="flex gap-3 w-full max-w-sm">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Portfolio name..."
                className="flex-1 px-4 py-3 rounded-xl text-sm text-white placeholder-slate-600 outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(94,106,210,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
              />
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleCreate}
                disabled={submitting || !newName.trim()}
                className="px-5 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, #5E6AD2, #4f59b8)',
                  boxShadow: '0 0 20px rgba(94,106,210,0.3)',
                }}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loaded portfolio ─────────────────────────────────────────────────── */}
      {portfolioId && (
        <>
          {/* Stat cards */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl skeleton" />
              ))}
            </div>
          ) : snapshot && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  label: 'Total Value',
                  numVal: snapshot.total_value,
                  display: snapshot.total_value,
                  format: fmtUsd,
                  color: '#5E6AD2',
                  icon: DollarSign,
                  delay: 0,
                },
                {
                  label: 'Unrealized P&L',
                  numVal: snapshot.total_pnl,
                  display: snapshot.total_pnl,
                  format: (v: number) => `${v >= 0 ? '+' : ''}${fmtUsd(v)}`,
                  color: snapshot.total_pnl >= 0 ? '#10b981' : '#ef4444',
                  icon: snapshot.total_pnl >= 0 ? TrendingUp : TrendingDown,
                  delay: 0.07,
                },
                {
                  label: 'Open Positions',
                  numVal: snapshot.positions.length,
                  display: snapshot.positions.length,
                  format: (v: number) => Math.round(v).toString(),
                  color: '#8b5cf6',
                  icon: Layers,
                  delay: 0.14,
                },
              ].map((card) => (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: card.delay, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                >
                  <TiltCard
                    className="rounded-2xl p-5 cursor-default"
                    style={{
                      background: 'var(--c-card)',
                      border: `1px solid ${card.color}20`,
                      backdropFilter: 'blur(16px)',
                    }}
                  >
                    {/* Hover glow overlay */}
                    <motion.div
                      className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100"
                      whileHover={{ opacity: 1 }}
                      style={{ background: `radial-gradient(ellipse at 50% 0%, ${card.color}10 0%, transparent 60%)` }}
                    />

                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs text-slate-500 uppercase tracking-widest font-medium">{card.label}</p>
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: `${card.color}15` }}
                      >
                        <card.icon size={14} style={{ color: card.color }} />
                      </div>
                    </div>
                    <p className="text-2xl font-bold" style={{ color: card.color, fontFamily: 'Space Grotesk, Inter, sans-serif' }}>
                      <AnimatedCounter target={card.numVal} format={card.format} />
                    </p>
                    {card.label === 'Unrealized P&L' && costBasis > 0 && (
                      <p className="text-xs mt-1" style={{ color: `${card.color}99` }}>
                        {fmtPct(returnPct)} return
                      </p>
                    )}
                  </TiltCard>
                </motion.div>
              ))}
            </div>
          )}

          {/* Positions + allocation */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {/* Positions table */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="xl:col-span-2 rounded-2xl p-5 relative overflow-hidden"
              style={{
                background: 'var(--c-card)',
                border: '1px solid rgba(255,255,255,0.06)',
                backdropFilter: 'blur(16px)',
              }}
            >
              {/* Top shine */}
              <div className="absolute inset-x-0 top-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(94,106,210,0.2), transparent)' }} />

              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Activity size={14} className="text-indigo-400" />
                  Positions
                </h3>
                {snapshot && snapshot.positions.length > 0 && (
                  <span className="text-xs text-slate-500 tabular">
                    {snapshot.positions.length} active
                  </span>
                )}
              </div>

              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-12 rounded-xl skeleton" />
                  ))}
                </div>
              ) : !snapshot || snapshot.positions.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(94,106,210,0.08)', border: '1px solid rgba(94,106,210,0.15)' }}>
                    <Briefcase size={22} className="text-indigo-400 opacity-50" />
                  </div>
                  <p className="text-sm text-slate-500">No open positions</p>
                  <button
                    onClick={() => setShowAddPos(true)}
                    className="text-xs font-medium transition-colors"
                    style={{ color: '#5E6AD2' }}
                  >
                    Add your first position →
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-600 uppercase tracking-widest">
                        <th className="text-left pb-3 pr-4">Symbol</th>
                        <th className="text-right pb-3 pr-4">Qty</th>
                        <th className="text-right pb-3 pr-4">Cost</th>
                        <th className="text-right pb-3 pr-4">Current</th>
                        <th className="text-right pb-3 pr-4">P&L</th>
                        <th className="text-right pb-3 pr-4">Weight</th>
                        <th className="pb-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.positions.map((pos: PositionSnapshot, i) => (
                        <motion.tr
                          key={pos.position_id}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.22 + i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                          className="group border-t"
                          style={{ borderColor: 'rgba(255,255,255,0.04)' }}
                        >
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                                style={{
                                  background: `${CHART_COLORS[i % CHART_COLORS.length]}18`,
                                  color: CHART_COLORS[i % CHART_COLORS.length],
                                  border: `1px solid ${CHART_COLORS[i % CHART_COLORS.length]}25`,
                                  boxShadow: `0 0 8px ${CHART_COLORS[i % CHART_COLORS.length]}15`,
                                }}
                              >
                                {pos.symbol[0]}
                              </div>
                              <span className="font-semibold text-slate-200">{pos.symbol}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-right tabular text-slate-300">{pos.quantity}</td>
                          <td className="py-3 pr-4 text-right tabular text-slate-500 text-xs">{fmtUsd(pos.avg_cost_basis)}</td>
                          <td className="py-3 pr-4 text-right tabular text-white font-medium">{fmtUsd(pos.current_price)}</td>
                          <td className="py-3 pr-4 text-right tabular">
                            <div>
                              <p className="font-medium" style={{ color: pos.unrealized_pnl >= 0 ? '#10b981' : '#ef4444' }}>
                                {pos.unrealized_pnl >= 0 ? '+' : ''}{fmtUsd(pos.unrealized_pnl)}
                              </p>
                              <p className="text-xs opacity-70" style={{ color: pos.pnl_pct >= 0 ? '#10b981' : '#ef4444' }}>
                                {fmtPct(pos.pnl_pct)}
                              </p>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-right tabular">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-slate-400 text-xs">{(pos.weight * 100).toFixed(1)}%</span>
                              <div className="w-12 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.min(pos.weight * 100 * 3, 100)}%`,
                                    background: CHART_COLORS[i % CHART_COLORS.length],
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 text-right">
                            <motion.button
                              whileTap={{ scale: 0.88 }}
                              onClick={() => handleClosePosition(pos.position_id)}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                              style={{ background: 'rgba(239,68,68,0)', border: '1px solid transparent' }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(239,68,68,0.1)'
                                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = 'rgba(239,68,68,0)'
                                e.currentTarget.style.borderColor = 'transparent'
                              }}
                            >
                              <X size={13} />
                            </motion.button>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>

            {/* Allocation chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl p-5 relative overflow-hidden"
              style={{
                background: 'var(--c-card)',
                border: '1px solid rgba(255,255,255,0.06)',
                backdropFilter: 'blur(16px)',
              }}
            >
              <div className="absolute inset-x-0 top-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.2), transparent)' }} />

              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Target size={14} className="text-cyan-400" />
                Allocation
              </h3>

              {loading ? (
                <div className="h-52 rounded-xl skeleton" />
              ) : pieData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={76}
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {pieData.map((_, index) => (
                          <Cell
                            key={index}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                            style={{ filter: `drop-shadow(0 0 6px ${CHART_COLORS[index % CHART_COLORS.length]}55)` }}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: 'var(--c-card-dark)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                          color: '#ededef',
                          fontSize: '12px',
                          backdropFilter: 'blur(16px)',
                        }}
                        formatter={(v: number) => [fmtUsd(v), 'Value']}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={7}
                        wrapperStyle={{ fontSize: '11px', color: '#6b7280' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Center total value */}
                  {snapshot && (
                    <div className="text-center -mt-2">
                      <p className="text-xs text-slate-600 uppercase tracking-wider">Total</p>
                      <p className="text-base font-bold text-white tabular mt-0.5">{fmtUsd(snapshot.total_value)}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="h-52 flex items-center justify-center text-slate-600 text-sm">
                  No positions yet
                </div>
              )}
            </motion.div>
          </div>

          {/* Risk metrics */}
          {risk && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl p-5 relative overflow-hidden"
              style={{
                background: 'var(--c-card)',
                border: '1px solid rgba(255,255,255,0.06)',
                backdropFilter: 'blur(16px)',
              }}
            >
              <div className="absolute inset-x-0 top-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(245,158,11,0.2), transparent)' }} />

              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <ShieldAlert size={14} className="text-amber-400" />
                  Risk Metrics
                </h3>
                {risk.warning && (
                  <p className="text-xs text-amber-400 flex items-center gap-1.5">
                    <AlertCircle size={11} /> {risk.warning}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  {
                    label: 'VaR (1-day 95%)',
                    value: risk.var_1day_95 != null ? fmtUsd(-risk.var_1day_95) : 'N/A',
                    raw: risk.var_1day_95 != null ? Math.abs(risk.var_1day_95) : 0,
                    max: snapshot ? snapshot.total_value * 0.05 : 1,
                    color: '#ef4444',
                    icon: BarChart2,
                    sub: 'Max expected daily loss',
                  },
                  {
                    label: 'Sharpe Ratio',
                    value: risk.sharpe_ratio != null ? risk.sharpe_ratio.toFixed(3) : 'N/A',
                    raw: risk.sharpe_ratio != null ? Math.max(0, risk.sharpe_ratio) : 0,
                    max: 3,
                    color: '#5E6AD2',
                    icon: Activity,
                    sub: '>1 is good',
                  },
                  {
                    label: 'Max Drawdown',
                    value: risk.max_drawdown != null ? `${(risk.max_drawdown * 100).toFixed(2)}%` : 'N/A',
                    raw: risk.max_drawdown != null ? Math.abs(risk.max_drawdown) : 0,
                    max: 0.5,
                    color: '#f59e0b',
                    icon: TrendingDown,
                    sub: 'Peak-to-trough',
                  },
                  {
                    label: 'Symbols Analyzed',
                    value: risk.symbols_analysed.length.toString(),
                    raw: risk.symbols_analysed.length,
                    max: 10,
                    color: '#8b5cf6',
                    icon: Layers,
                    sub: risk.symbols_analysed.join(', '),
                  },
                ].map(m => (
                  <TiltCard
                    key={m.label}
                    className="px-4 py-4 rounded-xl cursor-default"
                    style={{
                      background: 'rgba(255,255,255,0.025)',
                      border: `1px solid ${m.color}15`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-slate-500 leading-tight">{m.label}</p>
                      <m.icon size={12} style={{ color: m.color, opacity: 0.6 }} />
                    </div>
                    <p className="text-xl font-bold tabular" style={{ color: m.color, fontFamily: 'Space Grotesk, Inter, sans-serif' }}>
                      {m.value}
                    </p>
                    <RiskBar value={m.raw} max={m.max} color={m.color} />
                    <p className="text-xs mt-1.5 truncate" style={{ color: `${m.color}60` }}>{m.sub}</p>
                  </TiltCard>
                ))}
              </div>
            </motion.div>
          )}
        </>
      )}

      {/* ── Add position modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAddPos && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
            onClick={e => e.target === e.currentTarget && setShowAddPos(false)}
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.88, opacity: 0, y: 24 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="w-full max-w-sm rounded-2xl p-6 relative overflow-hidden"
              style={{
                background: '#05050a',
                border: '1px solid rgba(94,106,210,0.3)',
                boxShadow: '0 0 80px rgba(94,106,210,0.18), 0 40px 80px rgba(0,0,0,0.6)',
              }}
            >
              {/* Top glow bar */}
              <div className="absolute inset-x-0 top-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(94,106,210,0.6), transparent)' }} />
              {/* Ambient */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse, rgba(94,106,210,0.12) 0%, transparent 70%)' }} />

              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #5E6AD2, #06b6d4)', boxShadow: '0 0 16px rgba(94,106,210,0.4)' }}>
                    <Plus size={15} className="text-white" />
                  </div>
                  <h3 className="text-base font-bold text-white" style={{ fontFamily: 'Space Grotesk, Inter, sans-serif' }}>
                    Add Position
                  </h3>
                </div>
                <button
                  onClick={() => setShowAddPos(false)}
                  className="text-slate-500 hover:text-white transition-colors p-1"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="space-y-4">
                {[
                  { key: 'symbol', label: 'Ticker Symbol', placeholder: 'AAPL', type: 'text' },
                  { key: 'quantity', label: 'Quantity', placeholder: '10', type: 'number' },
                  { key: 'price', label: 'Buy Price (USD)', placeholder: '175.00', type: 'number' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {f.label}
                    </label>
                    <input
                      type={f.type}
                      value={form[f.key as keyof AddPositionForm]}
                      onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-slate-600 outline-none transition-all"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = 'rgba(94,106,210,0.5)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
                    />
                  </div>
                ))}

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAddPosition}
                  disabled={submitting || !form.symbol || !form.quantity || !form.price}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2 mt-2"
                  style={{
                    background: 'linear-gradient(135deg, #5E6AD2, #4f59b8)',
                    boxShadow: '0 0 24px rgba(94,106,210,0.35)',
                  }}
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  {submitting ? 'Adding…' : 'Add Position'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
