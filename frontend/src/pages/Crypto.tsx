import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { Search, Plus, TrendingUp, TrendingDown, Minus, Loader2, X, RefreshCw, Bitcoin } from 'lucide-react'
import { fetchLatestPrice, fetchPriceHistory, createPollingJob, fetchIndicators } from '../api/client'
import AddToPortfolioModal from '../components/ui/AddToPortfolioModal'
import type { PriceHistoryItem } from '../types'

const DEFAULT_CRYPTO = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP',
  'ADA', 'AVAX', 'DOGE', 'LINK', 'DOT',
  'MATIC', 'UNI', 'LTC', 'ATOM', 'APT',
  'ARB', 'OP', 'INJ', 'SUI', 'SHIB',
]

const CRYPTO_NAMES: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', BNB: 'BNB', XRP: 'XRP',
  ADA: 'Cardano', AVAX: 'Avalanche', DOGE: 'Dogecoin', LINK: 'Chainlink', DOT: 'Polkadot',
  MATIC: 'Polygon', UNI: 'Uniswap', LTC: 'Litecoin', ATOM: 'Cosmos', APT: 'Aptos',
  ARB: 'Arbitrum', OP: 'Optimism', INJ: 'Injective', SUI: 'Sui', SHIB: 'Shiba Inu',
}

interface CryptoData {
  symbol: string
  price: number | null
  changePct: number | null
  history: { v: number }[]
  signal: 'BUY' | 'SELL' | 'HOLD' | null
  loading: boolean
  error: boolean
}

const fmtUsd = (n: number) => {
  if (n >= 1000) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
  if (n >= 1) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(n)
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 }).format(n)
}

const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

function Sparkline({ data, positive }: { data: { v: number }[]; positive: boolean }) {
  if (data.length < 2) return <div style={{ width: 72, height: 36 }} />
  return (
    <ResponsiveContainer width={72} height={36}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="v" stroke={positive ? '#10b981' : '#ef4444'} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function SignalBadge({ signal }: { signal: 'BUY' | 'SELL' | 'HOLD' | null }) {
  if (!signal) return null
  const cfg = {
    BUY:  { color: '#10b981', bg: 'rgba(16,185,129,0.1)',   icon: TrendingUp },
    SELL: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    icon: TrendingDown },
    HOLD: { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', icon: Minus },
  }[signal]
  const Icon = cfg.icon
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold" style={{ background: cfg.bg, color: cfg.color }}>
      <Icon size={10} />{signal}
    </span>
  )
}

function CryptoRow({ data, index, onNavigate, onAdd }: {
  data: CryptoData; index: number
  onNavigate: (s: string) => void
  onAdd: (s: string, p: number) => void
}) {
  const isPositive = (data.changePct ?? 0) >= 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.022, duration: 0.25 }}
      className="group flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      onClick={() => onNavigate(data.symbol)}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Rank + icon */}
      <div className="flex items-center gap-3 w-48 flex-shrink-0">
        <span className="text-xs text-white/20 tabular w-5 text-right">{index + 1}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(247,147,26,0.12)', border: '1px solid rgba(247,147,26,0.2)' }}>
          <span className="text-xs font-bold" style={{ color: '#f7931a' }}>{data.symbol.slice(0, 2)}</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{data.symbol}</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{CRYPTO_NAMES[data.symbol] ?? data.symbol}</p>
        </div>
      </div>

      {/* Signal */}
      <div className="w-16 flex-shrink-0">
        {data.loading ? <div className="h-5 w-14 rounded skeleton" /> : <SignalBadge signal={data.signal} />}
      </div>

      {/* Sparkline */}
      <div className="flex-shrink-0 hidden sm:flex items-center">
        {data.loading
          ? <div className="h-9 rounded skeleton" style={{ width: 72 }} />
          : data.error
            ? <div style={{ width: 72, height: 36 }} className="flex items-center justify-center"><span className="text-xs text-white/15">—</span></div>
            : <Sparkline data={data.history} positive={isPositive} />
        }
      </div>

      <div className="flex-1" />

      {/* Price */}
      <div className="text-right flex-shrink-0 w-32">
        {data.loading ? (
          <><div className="h-4 w-24 rounded skeleton mb-1 ml-auto" /><div className="h-3 w-16 rounded skeleton ml-auto" /></>
        ) : data.price != null ? (
          <>
            <p className="text-sm font-semibold tabular text-white">{fmtUsd(data.price)}</p>
            <p className="text-xs tabular font-medium" style={{ color: isPositive ? '#10b981' : '#ef4444' }}>
              {data.changePct != null ? fmtPct(data.changePct) : '—'}
            </p>
          </>
        ) : <p className="text-xs text-white/20">No data</p>}
      </div>

      {/* Add button */}
      <div className="flex-shrink-0 w-16 flex justify-end">
        <motion.button
          whileTap={{ scale: 0.93 }}
          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{ background: 'rgba(247,147,26,0.1)', border: '1px solid rgba(247,147,26,0.2)', color: '#f7931a' }}
          onClick={e => { e.stopPropagation(); if (data.price != null) onAdd(data.symbol, data.price) }}
        >
          <Plus size={11} />Add
        </motion.button>
      </div>
    </motion.div>
  )
}

export default function Crypto() {
  const navigate = useNavigate()
  const [coins, setCoins] = useState<CryptoData[]>(() =>
    DEFAULT_CRYPTO.map(symbol => ({ symbol, price: null, changePct: null, history: [], signal: null, loading: true, error: false }))
  )
  const [search, setSearch] = useState('')
  const [tracking, setTracking] = useState(false)
  const [trackError, setTrackError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [modal, setModal] = useState<{ symbol: string; price: number } | null>(null)
  const loadedRef = useRef(false)

  const loadCoin = useCallback(async (symbol: string) => {
    try {
      const [priceRes, histRes] = await Promise.all([
        fetchLatestPrice(symbol, 'binance').catch(() => null),
        fetchPriceHistory(symbol, 'binance', 60).catch(() => [] as PriceHistoryItem[]),
      ])
      let signal: 'BUY' | 'SELL' | 'HOLD' | null = null
      try { signal = (await fetchIndicators(symbol, 'binance')).signal } catch { /* no data yet */ }

      setCoins(prev => prev.map(c => {
        if (c.symbol !== symbol) return c
        const newPrice = priceRes?.price ?? null
        const history = (histRes as PriceHistoryItem[]).slice(-50).map(h => ({ v: h.price }))
        const changePct = newPrice != null && history.length >= 2
          ? ((newPrice - history[0].v) / history[0].v) * 100 : null
        return { ...c, price: newPrice, changePct, history, signal, loading: false, error: priceRes == null }
      }))
    } catch {
      setCoins(prev => prev.map(c => c.symbol === symbol ? { ...c, loading: false, error: true } : c))
    }
  }, [])

  const loadAll = useCallback(async () => {
    const symbols = coins.map(c => c.symbol)
    const BATCH = 5
    for (let i = 0; i < symbols.length; i += BATCH) {
      await Promise.all(symbols.slice(i, i + BATCH).map(s => loadCoin(s)))
      if (i + BATCH < symbols.length) await new Promise(r => setTimeout(r, 300))
    }
    setLastUpdated(new Date())
  }, [coins, loadCoin])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    loadAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Crypto moves fast — refresh every 15s
  useEffect(() => {
    const id = setInterval(() => {
      coins.map(c => c.symbol).forEach(s => loadCoin(s))
      setLastUpdated(new Date())
    }, 15_000)
    return () => clearInterval(id)
  }, [coins, loadCoin])

  const handleTrack = async () => {
    const sym = search.trim().toUpperCase()
    if (!sym || coins.some(c => c.symbol === sym)) return
    setTracking(true)
    setTrackError(null)
    try {
      await createPollingJob([sym], 15, 'binance')
      setCoins(prev => [{ symbol: sym, price: null, changePct: null, history: [], signal: null, loading: true, error: false }, ...prev])
      setSearch('')
      loadCoin(sym)
    } catch {
      setTrackError(`Failed to track ${sym}`)
    } finally {
      setTracking(false)
    }
  }

  const filtered = coins.filter(c => !search || c.symbol.startsWith(search.toUpperCase()) || (CRYPTO_NAMES[c.symbol] ?? '').toLowerCase().includes(search.toLowerCase()))
  const loaded = coins.filter(c => !c.loading && !c.error).length

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="space-y-0">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold text-white tracking-tight" style={{ fontFamily: 'Space Grotesk, Inter, sans-serif', letterSpacing: '-0.02em' }}>
              Crypto
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(247,147,26,0.12)', border: '1px solid rgba(247,147,26,0.25)', color: '#f7931a' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-orange-400 pulse-green" />
              24/7 Live
            </span>
          </div>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {loaded}/{coins.length} coins loaded via Binance
            {lastUpdated && <> · {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</>}
          </p>
        </div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={loadAll}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors"
          style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.4)' }}>
          <RefreshCw size={12} />Refresh
        </motion.button>
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-6">
        <div className="flex items-center gap-3 flex-1 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <Search size={14} style={{ color: 'rgba(255,255,255,0.25)' }} />
          <input value={search} onChange={e => setSearch(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && !coins.some(c => c.symbol === search.toUpperCase()) && handleTrack()}
            placeholder="Search or add coin (e.g. PEPE)…"
            className="flex-1 bg-transparent text-sm text-white placeholder-white/20 outline-none" />
          {search && <button onClick={() => setSearch('')}><X size={13} style={{ color: 'rgba(255,255,255,0.25)' }} /></button>}
        </div>
        <AnimatePresence>
          {search && !coins.some(c => c.symbol === search.toUpperCase()) && (
            <motion.button initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              whileTap={{ scale: 0.96 }} onClick={handleTrack} disabled={tracking}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
              style={{ background: 'rgba(247,147,26,0.9)', color: '#000' }}>
              {tracking ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Track
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {trackError && <p className="text-xs text-red-400 mb-4 px-1">{trackError}</p>}

      {/* Table header */}
      <div className="flex items-center gap-4 px-5 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="w-48 flex-shrink-0">
          <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>Coin</span>
        </div>
        <div className="w-16 flex-shrink-0">
          <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>Signal</span>
        </div>
        <div className="flex-shrink-0 hidden sm:block" style={{ width: 72 }}>
          <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>Chart</span>
        </div>
        <div className="flex-1" />
        <div className="w-32 text-right flex-shrink-0">
          <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>Price (USDT)</span>
        </div>
        <div className="w-16 flex-shrink-0" />
      </div>

      {/* Coin rows */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(8,8,8,0.88)' }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20">
            <Bitcoin size={28} style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No coins match</p>
          </div>
        ) : filtered.map((coin, i) => (
          <CryptoRow key={coin.symbol} data={coin} index={i}
            onNavigate={s => navigate('/analytics', { state: { symbol: s, provider: 'binance' } })}
            onAdd={(s, p) => setModal({ symbol: s, price: p })}
          />
        ))}
      </div>

      <p className="text-xs pt-3 px-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
        Prices via Binance public API (USDT pairs) · Refreshes every 15s · Click row for technical analysis
      </p>

      <AnimatePresence>
        {modal && (
          <AddToPortfolioModal symbol={modal.symbol} price={modal.price} provider="binance" onClose={() => setModal(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
