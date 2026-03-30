import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { Search, Plus, TrendingUp, TrendingDown, Minus, Loader2, X, RefreshCw, BarChart2 } from 'lucide-react'
import { fetchLatestPrice, fetchPriceHistory, createPollingJob, fetchIndicators } from '../api/client'
import AddToPortfolioModal from '../components/ui/AddToPortfolioModal'
import type { PriceHistoryItem } from '../types'

const DEFAULT_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA',
  'AMZN', 'META', 'NFLX', 'AMD', 'INTC',
  'ORCL', 'CRM', 'ADBE', 'PYPL', 'UBER',
  'SPOT', 'SHOP', 'COIN', 'SQ', 'PLTR',
  'ARM', 'SMCI', 'TSM', 'AVGO', 'QCOM',
]

const SIGNALS_KEY = 'mip_signals_cache'

interface StockData {
  symbol: string
  price: number | null
  prevPrice: number | null
  changePct: number | null
  history: { v: number }[]
  signal: 'BUY' | 'SELL' | 'HOLD' | null
  loading: boolean
  error: boolean
}

const fmtUsd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)

const fmtPct = (n: number) =>
  `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

function Sparkline({ data, positive }: { data: { v: number }[]; positive: boolean }) {
  if (data.length < 2) return <div style={{ width: 72, height: 36 }} />
  return (
    <ResponsiveContainer width={72} height={36}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={positive ? '#10b981' : '#ef4444'}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function SignalBadge({ signal }: { signal: 'BUY' | 'SELL' | 'HOLD' | null }) {
  if (!signal) return null
  const cfg = {
    BUY:  { color: '#10b981', bg: 'rgba(16,185,129,0.1)',  icon: TrendingUp },
    SELL: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   icon: TrendingDown },
    HOLD: { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', icon: Minus },
  }[signal]
  const Icon = cfg.icon
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <Icon size={10} />
      {signal}
    </span>
  )
}

function StockRow({
  data,
  index,
  onNavigate,
  onAddToPortfolio,
}: {
  data: StockData
  index: number
  onNavigate: (symbol: string) => void
  onAddToPortfolio: (symbol: string, price: number) => void
}) {
  const isPositive = (data.changePct ?? 0) >= 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, duration: 0.25 }}
      className="group flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      onClick={() => onNavigate(data.symbol)}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Rank + icon */}
      <div className="flex items-center gap-3 w-40 flex-shrink-0">
        <span className="text-xs text-white/20 tabular w-5 text-right">{index + 1}</span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)' }}
        >
          {data.symbol.slice(0, 2)}
        </div>
        <span className="text-sm font-semibold text-white">{data.symbol}</span>
      </div>

      {/* Signal */}
      <div className="w-16 flex-shrink-0">
        {data.loading
          ? <div className="h-5 w-14 rounded skeleton" />
          : <SignalBadge signal={data.signal} />
        }
      </div>

      {/* Sparkline */}
      <div className="flex-shrink-0 hidden sm:flex items-center">
        {data.loading
          ? <div className="h-9 w-18 rounded skeleton" style={{ width: 72 }} />
          : data.error
            ? <div style={{ width: 72, height: 36 }} className="flex items-center justify-center">
                <span className="text-xs text-white/15">—</span>
              </div>
            : <Sparkline data={data.history} positive={isPositive} />
        }
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Price */}
      <div className="text-right flex-shrink-0 w-28">
        {data.loading ? (
          <>
            <div className="h-4 w-20 rounded skeleton mb-1 ml-auto" />
            <div className="h-3 w-14 rounded skeleton ml-auto" />
          </>
        ) : data.price != null ? (
          <>
            <p className="text-sm font-semibold tabular text-white">{fmtUsd(data.price)}</p>
            <p className="text-xs tabular font-medium" style={{ color: isPositive ? '#10b981' : '#ef4444' }}>
              {data.changePct != null ? fmtPct(data.changePct) : '—'}
            </p>
          </>
        ) : (
          <p className="text-xs text-white/20">No data</p>
        )}
      </div>

      {/* Add to portfolio button */}
      <div className="flex-shrink-0 w-16 flex justify-end">
        <motion.button
          whileTap={{ scale: 0.93 }}
          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.65)',
          }}
          onClick={e => {
            e.stopPropagation()
            if (data.price != null) onAddToPortfolio(data.symbol, data.price)
          }}
        >
          <Plus size={11} />
          Add
        </motion.button>
      </div>
    </motion.div>
  )
}

export default function Markets() {
  const navigate = useNavigate()
  const [stocks, setStocks] = useState<StockData[]>(() =>
    DEFAULT_SYMBOLS.map(symbol => ({
      symbol, price: null, prevPrice: null, changePct: null,
      history: [], signal: null, loading: true, error: false,
    }))
  )
  const [search, setSearch] = useState('')
  const [tracking, setTracking] = useState(false)
  const [trackError, setTrackError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [modalSymbol, setModalSymbol] = useState<{ symbol: string; price: number } | null>(null)
  const loadedRef = useRef(false)

  const loadSymbol = useCallback(async (symbol: string, isRefresh = false) => {
    try {
      const [priceRes, histRes] = await Promise.all([
        fetchLatestPrice(symbol).catch(() => null),
        fetchPriceHistory(symbol, 'finnhub', 60).catch(() => [] as PriceHistoryItem[]),
      ])

      // Load signal separately (non-blocking, best-effort)
      let signal: 'BUY' | 'SELL' | 'HOLD' | null = null
      try {
        const ind = await fetchIndicators(symbol)
        signal = ind.signal
      } catch {
        // signal stays null
      }

      setStocks(prev => prev.map(s => {
        if (s.symbol !== symbol) return s
        const newPrice = priceRes?.price ?? null
        const history = (histRes as PriceHistoryItem[]).slice(-50).map(h => ({ v: h.price }))

        // compute % change from oldest price in history
        let changePct: number | null = null
        if (newPrice != null && history.length >= 2) {
          const oldest = history[0].v
          changePct = ((newPrice - oldest) / oldest) * 100
        }

        return {
          ...s,
          price: newPrice,
          prevPrice: isRefresh ? s.price : null,
          changePct,
          history,
          signal,
          loading: false,
          error: priceRes == null,
        }
      }))
    } catch {
      setStocks(prev => prev.map(s =>
        s.symbol === symbol ? { ...s, loading: false, error: true } : s
      ))
    }
  }, [])

  // Load all symbols in parallel batches of 5
  const loadAll = useCallback(async (isRefresh = false) => {
    if (!isRefresh) {
      setStocks(prev => prev.map(s => ({ ...s, loading: true, error: false })))
    }
    const symbols = stocks.map(s => s.symbol)
    const BATCH = 5
    for (let i = 0; i < symbols.length; i += BATCH) {
      await Promise.all(symbols.slice(i, i + BATCH).map(sym => loadSymbol(sym, isRefresh)))
      // small pause between batches to avoid hammering the API
      if (i + BATCH < symbols.length) await new Promise(r => setTimeout(r, 400))
    }
    setLastUpdated(new Date())
  }, [stocks, loadSymbol])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    loadAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh prices every 60s
  useEffect(() => {
    const id = setInterval(() => loadAll(true), 60_000)
    return () => clearInterval(id)
  }, [loadAll])

  const handleTrack = async () => {
    const sym = search.trim().toUpperCase()
    if (!sym) return
    if (stocks.some(s => s.symbol === sym)) {
      setTrackError(`${sym} is already tracked.`)
      return
    }
    setTracking(true)
    setTrackError(null)
    try {
      await createPollingJob([sym], 60)
      const newEntry: StockData = {
        symbol: sym, price: null, prevPrice: null, changePct: null,
        history: [], signal: null, loading: true, error: false,
      }
      setStocks(prev => [newEntry, ...prev])
      setSearch('')
      loadSymbol(sym)
    } catch {
      setTrackError(`Failed to track ${sym}.`)
    } finally {
      setTracking(false)
    }
  }

  const handleNavigate = (symbol: string) => {
    navigate('/analytics', { state: { symbol } })
  }

  const filtered = stocks.filter(s =>
    !search || s.symbol.startsWith(search.toUpperCase())
  )

  const loaded = stocks.filter(s => !s.loading && !s.error).length

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="space-y-0"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1
            className="text-3xl font-bold text-white tracking-tight"
            style={{ fontFamily: 'Space Grotesk, Inter, sans-serif', letterSpacing: '-0.02em' }}
          >
            Markets
          </h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {loaded} / {stocks.length} symbols loaded
            {lastUpdated && (
              <> · Updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</>
            )}
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => loadAll(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors"
          style={{
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          <RefreshCw size={12} />
          Refresh
        </motion.button>
      </div>

      {/* Search / track new symbol */}
      <div className="flex gap-3 mb-6">
        <div
          className="flex items-center gap-3 flex-1 px-4 py-3 rounded-xl"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Search size={14} style={{ color: 'rgba(255,255,255,0.25)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && !stocks.some(s => s.symbol === search.toUpperCase()) && handleTrack()}
            placeholder="Search or add symbol (e.g. NVDA)…"
            className="flex-1 bg-transparent text-sm text-white placeholder-white/20 outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')}>
              <X size={13} style={{ color: 'rgba(255,255,255,0.25)' }} />
            </button>
          )}
        </div>

        {/* Only show Track button if symbol isn't already in the list */}
        <AnimatePresence>
          {search && !stocks.some(s => s.symbol === search.toUpperCase()) && (
            <motion.button
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleTrack}
              disabled={tracking}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold btn-primary disabled:opacity-40"
            >
              {tracking
                ? <Loader2 size={14} className="animate-spin" style={{ color: '#000' }} />
                : <Plus size={14} style={{ color: '#000' }} />
              }
              <span style={{ color: '#000' }}>Track</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {trackError && (
        <p className="text-xs text-red-400 mb-4 px-1">{trackError}</p>
      )}

      {/* Table header */}
      <div
        className="flex items-center gap-4 px-5 py-2.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="w-40 flex-shrink-0">
          <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Symbol
          </span>
        </div>
        <div className="w-16 flex-shrink-0">
          <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Signal
          </span>
        </div>
        <div className="flex-shrink-0 hidden sm:block" style={{ width: 72 }}>
          <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Chart
          </span>
        </div>
        <div className="flex-1" />
        <div className="w-28 text-right flex-shrink-0">
          <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Price
          </span>
        </div>
        <div className="w-16 flex-shrink-0" />
      </div>

      {/* Stock rows */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(8,8,8,0.88)',
        }}
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20">
            <BarChart2 size={28} style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No symbols match your search</p>
          </div>
        ) : (
          filtered.map((stock, i) => (
            <StockRow
              key={stock.symbol}
              data={stock}
              index={i}
              onNavigate={handleNavigate}
              onAddToPortfolio={(sym, price) => setModalSymbol({ symbol: sym, price })}
            />
          ))
        )}
      </div>

      {/* Bottom hint */}
      <p className="text-xs pt-3 px-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
        Click any row to open full technical analysis · Hover for quick add to portfolio
      </p>

      {/* Add to portfolio modal */}
      <AnimatePresence>
        {modalSymbol && (
          <AddToPortfolioModal
            symbol={modalSymbol.symbol}
            price={modalSymbol.price}
            onClose={() => setModalSymbol(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
