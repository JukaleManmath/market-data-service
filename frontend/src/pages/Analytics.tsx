import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, BarChart, Bar,
} from 'recharts'
import { Search, TrendingUp, TrendingDown, Minus, Loader2, BarChart2 } from 'lucide-react'
import { fetchIndicators, fetchPriceHistory } from '../api/client'
import type { IndicatorResponse, PriceHistoryItem } from '../types'

const fmtUsd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)

const SIGNAL_CONFIG = {
  BUY: { color: '#10b981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)', icon: TrendingUp },
  SELL: { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.3)', icon: TrendingDown },
  HOLD: { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.3)', icon: Minus },
}

interface RSIGaugeProps { rsi: number }
function RSIGauge({ rsi }: RSIGaugeProps) {
  const angle = (rsi / 100) * 180 - 90
  const color = rsi < 30 ? '#10b981' : rsi > 70 ? '#ef4444' : 'var(--c-accent)'
  return (
    <div className="flex flex-col items-center">
      <svg width={140} height={80} viewBox="0 0 140 80">
        {/* Track */}
        <path d="M 15 75 A 55 55 0 0 1 125 75" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={8} strokeLinecap="round" />
        {/* Oversold zone */}
        <path d="M 15 75 A 55 55 0 0 1 55 25" fill="none" stroke="rgba(16,185,129,0.3)" strokeWidth={8} strokeLinecap="round" />
        {/* Overbought zone */}
        <path d="M 85 25 A 55 55 0 0 1 125 75" fill="none" stroke="rgba(239,68,68,0.3)" strokeWidth={8} strokeLinecap="round" />
        {/* Needle */}
        <line
          x1={70} y1={75}
          x2={70 + 42 * Math.cos(((angle - 90) * Math.PI) / 180)}
          y2={75 + 42 * Math.sin(((angle - 90) * Math.PI) / 180)}
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle cx={70} cy={75} r={4} fill={color} />
      </svg>
      <div className="text-center -mt-2">
        <p className="text-2xl font-bold tabular" style={{ color }}>{rsi.toFixed(1)}</p>
        <p className="text-xs text-slate-500">
          {rsi < 30 ? 'Oversold' : rsi > 70 ? 'Overbought' : 'Neutral'}
        </p>
      </div>
    </div>
  )
}

export default function Analytics() {
  const location = useLocation()
  const navState = location.state as { symbol?: string; provider?: string } | null
  const [symbol, setSymbol] = useState('')
  const [provider, setProvider] = useState<'finnhub' | 'binance'>(
    navState?.provider === 'binance' ? 'binance' : 'finnhub'
  )
  const [indicators, setIndicators] = useState<IndicatorResponse | null>(null)
  const [history, setHistory] = useState<PriceHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-load symbol when navigated from Markets / Crypto page
  useEffect(() => {
    const navSymbol = navState?.symbol
    const navProvider = navState?.provider === 'binance' ? 'binance' : 'finnhub'
    if (navSymbol) {
      setSymbol(navSymbol)
      analyze(navSymbol, navProvider)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const analyze = async (sym: string, prov: 'finnhub' | 'binance' = provider) => {
    if (!sym.trim()) return
    setLoading(true)
    setError(null)
    try {
      const [ind, hist] = await Promise.all([
        fetchIndicators(sym.trim().toUpperCase(), prov),
        fetchPriceHistory(sym.trim().toUpperCase(), prov, 100),
      ])
      setIndicators(ind)
      setHistory(hist)
    } catch {
      setError(`No data found for ${sym.toUpperCase()} (${prov}). Make sure a polling job is running for this symbol.`)
      setIndicators(null)
      setHistory([])
    } finally {
      setLoading(false)
    }
  }

  const chartData = history.map((h, i) => ({
    i,
    price: h.price,
    time: new Date(h.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  }))

  const macdData = indicators?.macd
    ? [{ name: 'MACD', line: indicators.macd.line, signal: indicators.macd.signal, histogram: indicators.macd.histogram }]
    : []

  const signalConfig = indicators ? SIGNAL_CONFIG[indicators.signal] : null
  const SignalIcon = signalConfig?.icon

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold text-white">Technical Analytics</h1>
        <p className="text-sm text-slate-400 mt-0.5">RSI, MACD, Bollinger Bands & AI trading signals</p>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        {/* Provider toggle */}
        <div className="flex p-1 rounded-xl gap-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {(['finnhub', 'binance'] as const).map(p => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={
                provider === p
                  ? p === 'binance'
                    ? { background: 'rgba(247,147,26,0.18)', color: '#f7931a', border: '1px solid rgba(247,147,26,0.3)' }
                    : { background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.15)' }
                  : { background: 'transparent', color: 'rgba(255,255,255,0.3)', border: '1px solid transparent' }
              }
            >
              {p === 'binance' ? 'Crypto' : 'Stocks'}
            </button>
          ))}
        </div>
        <div
          className="flex items-center gap-3 flex-1 px-4 py-3 rounded-xl"
          style={{ background: 'var(--c-card)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <Search size={16} className="text-slate-500" />
          <input
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && analyze(symbol)}
            placeholder={provider === 'binance' ? 'Enter coin (e.g. BTC, SOL)...' : 'Enter symbol (e.g. AAPL)...'}
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none"
          />
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => analyze(symbol)}
          disabled={loading || !symbol}
          className="px-6 py-3 rounded-xl text-sm font-medium text-white disabled:opacity-50 flex items-center gap-2"
          style={{ background: 'var(--c-btn)' }}
        >
          {loading ? <Loader2 size={16} className="animate-spin" style={{ color: '#000' }} /> : <BarChart2 size={16} style={{ color: '#000' }} />}
          <span style={{ color: '#000' }}>Analyze</span>
        </motion.button>
      </div>

      {/* Quick symbols */}
      <div className="flex gap-2 flex-wrap">
        {provider === 'binance'
          ? ['BTC', 'ETH', 'SOL', 'BNB', 'DOGE'].map(s => (
            <motion.button
              key={s}
              whileTap={{ scale: 0.95 }}
              onClick={() => { setSymbol(s); analyze(s, 'binance') }}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
              style={{ background: 'rgba(247,147,26,0.08)', border: '1px solid rgba(247,147,26,0.2)', color: '#f7931a' }}
            >
              {s}
            </motion.button>
          ))
          : ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL'].map(s => (
            <motion.button
              key={s}
              whileTap={{ scale: 0.95 }}
              onClick={() => { setSymbol(s); analyze(s) }}
              className="px-3 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              {s}
            </motion.button>
          ))
        }
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl text-sm text-amber-300"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center gap-3 py-16">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--c-accent-faint)', border: '1px solid var(--c-accent-soft)' }}
          >
            <Loader2 size={22} className="animate-spin text-blue-400" />
          </div>
          <p className="text-sm text-slate-400">Computing indicators...</p>
        </div>
      )}

      {indicators && !loading && (
        <>
          {/* Signal banner */}
          {signalConfig && SignalIcon && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-between px-6 py-4 rounded-2xl"
              style={{
                background: signalConfig.bg,
                border: `1px solid ${signalConfig.border}`,
                boxShadow: `0 0 30px ${signalConfig.bg}`,
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: signalConfig.bg, border: `1px solid ${signalConfig.border}` }}
                >
                  <SignalIcon size={22} style={{ color: signalConfig.color }} />
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Trading Signal — {indicators.symbol}</p>
                  <p className="text-2xl font-bold" style={{ color: signalConfig.color }}>
                    {indicators.signal}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 mb-1">Confidence</p>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${indicators.confidence * 100}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ background: signalConfig.color }}
                    />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: signalConfig.color }}>
                    {(indicators.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-2 space-y-0.5">
                  {indicators.reasons.map((r, i) => (
                    <p key={i} className="text-xs text-slate-400">· {r}</p>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Price chart */}
          {chartData.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl p-5"
              style={{
                background: 'var(--c-card)',
                border: '1px solid rgba(255,255,255,0.06)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Price History — {indicators.symbol}</h3>
                <span className="text-xs text-slate-500">{chartData.length} data points</span>
              </div>

              {/* Bollinger context */}
              {indicators.bollinger && (
                <div className="flex gap-4 mb-3 text-xs">
                  {[
                    { label: 'Upper Band', value: fmtUsd(indicators.bollinger.upper), color: '#f87171' },
                    { label: 'Middle', value: fmtUsd(indicators.bollinger.middle), color: '#60a5fa' },
                    { label: 'Lower Band', value: fmtUsd(indicators.bollinger.lower), color: '#34d399' },
                    { label: 'Bandwidth', value: `${(indicators.bollinger.bandwidth * 100).toFixed(2)}%`, color: '#a78bfa' },
                  ].map(b => (
                    <div key={b.label}>
                      <p className="text-slate-500">{b.label}</p>
                      <p className="font-semibold tabular" style={{ color: b.color }}>{b.value}</p>
                    </div>
                  ))}
                </div>
              )}

              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--c-accent)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--c-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="i"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={i => chartData[i]?.time ?? ''}
                    interval={Math.floor(chartData.length / 6)}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `$${v.toFixed(0)}`}
                    width={55}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--c-card-dark)',
                      border: '1px solid var(--c-accent-soft)',
                      borderRadius: '10px',
                      color: '#f1f5f9',
                      fontSize: '12px',
                    }}
                    formatter={(v: number) => [fmtUsd(v), 'Price']}
                    labelFormatter={i => chartData[Number(i)]?.time ?? ''}
                  />
                  {indicators.bollinger && (
                    <>
                      <ReferenceLine y={indicators.bollinger.upper} stroke="#f87171" strokeDasharray="4 4" strokeOpacity={0.5} />
                      <ReferenceLine y={indicators.bollinger.middle} stroke="#60a5fa" strokeDasharray="4 4" strokeOpacity={0.5} />
                      <ReferenceLine y={indicators.bollinger.lower} stroke="#34d399" strokeDasharray="4 4" strokeOpacity={0.5} />
                    </>
                  )}
                  <Area type="monotone" dataKey="price" stroke="var(--c-accent)" strokeWidth={2} fill="url(#priceGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {/* RSI + MACD row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* RSI */}
            {indicators.rsi != null && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="rounded-2xl p-5"
                style={{
                  background: 'var(--c-card)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <h3 className="text-sm font-semibold text-white mb-4">RSI (14)</h3>
                <RSIGauge rsi={indicators.rsi} />
                <div className="flex justify-between text-xs text-slate-500 mt-3 px-2">
                  <span>Oversold &lt;30</span>
                  <span>Neutral</span>
                  <span>Overbought &gt;70</span>
                </div>
              </motion.div>
            )}

            {/* MACD */}
            {indicators.macd && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="rounded-2xl p-5"
                style={{
                  background: 'var(--c-card)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <h3 className="text-sm font-semibold text-white mb-4">MACD (12/26/9)</h3>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'MACD Line', value: indicators.macd.line.toFixed(4), color: '#60a5fa' },
                    { label: 'Signal', value: indicators.macd.signal.toFixed(4), color: '#a78bfa' },
                    {
                      label: 'Histogram',
                      value: indicators.macd.histogram.toFixed(4),
                      color: indicators.macd.histogram >= 0 ? '#34d399' : '#f87171',
                    },
                  ].map(m => (
                    <div key={m.label} className="px-3 py-2 rounded-lg text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <p className="text-xs text-slate-500">{m.label}</p>
                      <p className="text-sm font-semibold tabular mt-1" style={{ color: m.color }}>{m.value}</p>
                    </div>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={80}>
                  <BarChart data={macdData}>
                    <Bar dataKey="histogram" fill={indicators.macd.histogram >= 0 ? '#10b981' : '#ef4444'} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>
            )}
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && !indicators && !error && (
        <div className="flex flex-col items-center gap-4 py-20">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--c-accent-faint)', border: '1px solid var(--c-accent-soft)' }}
          >
            <BarChart2 size={28} className="text-blue-500 opacity-50" />
          </div>
          <p className="text-slate-400 text-sm">Enter a symbol above to see technical analysis</p>
        </div>
      )}
    </motion.div>
  )
}
