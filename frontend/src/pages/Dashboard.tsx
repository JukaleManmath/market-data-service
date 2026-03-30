import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Activity, DollarSign, AlertTriangle, TrendingUp, RefreshCw,
} from 'lucide-react'
import StatCard from '../components/ui/StatCard'
import {
  fetchHealth, fetchLatestPrice, fetchAlerts, fetchSnapshot, fetchPriceHistory,
} from '../api/client'
import type { AlertResponse, HealthResponse, PriceResponse, PortfolioSnapshot } from '../types'

const SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL']
const PORTFOLIOS_LIST_KEY = 'mip_portfolios'

interface PortfolioEntry { id: string; name: string; type: string }

interface PriceCard {
  symbol: string
  price: number
  change: number
}

const fmtUsd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)

const fmtTime = (ts: string) =>
  new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

export default function Dashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [prices, setPrices] = useState<PriceCard[]>([])
  const [alerts, setAlerts] = useState<AlertResponse[]>([])
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([])
  const [chartData, setChartData] = useState<{ time: string; value: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const [h, al] = await Promise.all([
        fetchHealth().catch(() => null),
        fetchAlerts().catch(() => [] as AlertResponse[]),
      ])
      setHealth(h)
      setAlerts(al)

      // Fetch prices + history for real % change
      const priceResults = await Promise.allSettled(
        SYMBOLS.map(async s => {
          const [p, hist] = await Promise.all([
            fetchLatestPrice(s),
            fetchPriceHistory(s, 'finnhub', 2).catch(() => []),
          ])
          const change = hist.length >= 2
            ? ((p.price - hist[0].price) / hist[0].price) * 100
            : 0
          return { symbol: s, price: p.price, change }
        })
      )
      const live: PriceCard[] = priceResults
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<PriceCard>).value)
      setPrices(live)

      // Fetch all portfolio snapshots and aggregate
      let portfolios: PortfolioEntry[] = []
      try { portfolios = JSON.parse(localStorage.getItem(PORTFOLIOS_LIST_KEY) ?? '[]') } catch { /* */ }

      if (portfolios.length > 0) {
        const snaps = (await Promise.allSettled(portfolios.map(p => fetchSnapshot(p.id))))
          .filter(r => r.status === 'fulfilled')
          .map(r => (r as PromiseFulfilledResult<PortfolioSnapshot>).value)
        setSnapshots(snaps)

        // Build chart from highest-value position across all portfolios
        const allPositions = snaps.flatMap(s => s.positions).sort((a, b) => b.market_value - a.market_value)
        let chartBuilt = false
        for (const pos of allPositions) {
          const hist = await fetchPriceHistory(pos.symbol, pos.provider, 60).catch(() => [])
          if (hist.length >= 2) {
            const latestHistPrice = hist[hist.length - 1].price
            const scale = pos.market_value / latestHistPrice
            setChartData(hist.map(h => ({
              time: new Date(h.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              value: h.price * scale,
            })))
            chartBuilt = true
            break
          }
        }
        if (!chartBuilt) {
          const hist = await fetchPriceHistory('AAPL', 'finnhub', 60).catch(() => [])
          if (hist.length >= 2) {
            setChartData(hist.map(h => ({
              time: new Date(h.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              value: h.price,
            })))
          }
        }
      } else {
        setSnapshots([])
        // No portfolios — show AAPL price history as a market reference
        const hist = await fetchPriceHistory('AAPL', 'finnhub', 60).catch(() => [])
        if (hist.length >= 2) {
          setChartData(hist.map(h => ({
            time: new Date(h.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            value: h.price,
          })))
        }
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  const totalAlerts = alerts.length
  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length
  const totalValue = snapshots.reduce((s, p) => s + p.total_value, 0)
  const totalPnl = snapshots.reduce((s, p) => s + p.total_pnl, 0)
  const hasPortfolio = snapshots.length > 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Market Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Live intelligence — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {health && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                background: health.status === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${health.status === 'ok' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                color: health.status === 'ok' ? '#34d399' : '#f87171',
              }}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${health.status === 'ok' ? 'bg-emerald-400 pulse-green' : 'bg-red-400 pulse-red'}`}
              />
              {health.status === 'ok' ? 'All Systems Operational' : 'Degraded'}
            </div>
          )}
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </motion.button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title={snapshots.length > 1 ? `Total Value (${snapshots.length} portfolios)` : 'Portfolio Value'}
          value={hasPortfolio ? fmtUsd(totalValue) : '—'}
          trend={hasPortfolio && (totalValue - totalPnl) > 0 ? (totalPnl / (totalValue - totalPnl)) * 100 : undefined}
          icon={<DollarSign size={14} />}
          accentColor="blue"
          loading={loading}
          delay={0}
        />
        <StatCard
          title="Unrealized P&L"
          value={hasPortfolio ? fmtUsd(totalPnl) : '—'}
          subtitle={snapshots.length > 1 ? 'Across all portfolios' : 'All positions'}
          icon={<TrendingUp size={14} />}
          accentColor={hasPortfolio && totalPnl >= 0 ? 'green' : 'red'}
          loading={loading}
          delay={0.05}
        />
        <StatCard
          title="Active Alerts"
          value={totalAlerts}
          subtitle={criticalAlerts > 0 ? `${criticalAlerts} critical` : 'All clear'}
          icon={<AlertTriangle size={14} />}
          accentColor={criticalAlerts > 0 ? 'red' : totalAlerts > 0 ? 'amber' : 'green'}
          loading={loading}
          delay={0.1}
        />
        <StatCard
          title="Tracked Symbols"
          value={prices.length}
          subtitle="Live market data"
          icon={<Activity size={14} />}
          accentColor="cyan"
          loading={loading}
          delay={0.15}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Portfolio chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="xl:col-span-2 rounded-2xl p-5"
          style={{
            background: 'var(--c-card)',
            border: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">
                {hasPortfolio ? 'Portfolio Performance' : 'Market Reference — AAPL'}
              </h3>
              <p className="text-xs text-slate-500">Price history · last data points</p>
            </div>
            {hasPortfolio && (
              <span
                className="text-xs font-medium px-2 py-1 rounded-md"
                style={{
                  background: totalPnl >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                  color: totalPnl >= 0 ? '#34d399' : '#f87171',
                }}
              >
                {totalPnl >= 0 ? '+' : ''}{fmtUsd(totalPnl)}
              </span>
            )}
          </div>

          {loading ? (
            <div className="h-48 rounded-xl skeleton" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--c-accent)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--c-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `$${(v / 1000).toFixed(1)}k`}
                  width={55}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--c-card-dark)',
                    border: '1px solid var(--c-accent-soft)',
                    borderRadius: '10px',
                    color: '#f1f5f9',
                    fontSize: '12px',
                  }}
                  formatter={(v: number) => [fmtUsd(v), 'Value']}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--c-accent)"
                  strokeWidth={2}
                  fill="url(#areaGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex flex-col items-center justify-center gap-2 text-slate-500">
              <Activity size={28} className="opacity-30" />
              <p className="text-sm">No portfolio selected</p>
              <p className="text-xs opacity-60">Create a portfolio in the Portfolio tab</p>
            </div>
          )}
        </motion.div>

        {/* Live prices */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl p-5"
          style={{
            background: 'var(--c-card)',
            border: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <h3 className="text-sm font-semibold text-white mb-4">Live Prices</h3>
          <div className="space-y-2">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 rounded-lg skeleton" />
                ))
              : prices.map((p, i) => (
                  <motion.div
                    key={p.symbol}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.04 }}
                    className="flex items-center justify-between px-3 py-2 rounded-xl transition-colors hover:bg-white/[0.03]"
                    style={{ border: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                        style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.8)' }}
                      >
                        {p.symbol[0]}
                      </div>
                      <span className="text-sm font-medium text-slate-200">{p.symbol}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular text-white">
                        {fmtUsd(p.price)}
                      </p>
                      <p
                        className="text-xs tabular"
                        style={{ color: p.change >= 0 ? '#34d399' : '#f87171' }}
                      >
                        {p.change >= 0 ? '+' : ''}{p.change.toFixed(2)}%
                      </p>
                    </div>
                  </motion.div>
                ))}
          </div>
        </motion.div>
      </div>

      {/* Recent alerts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl p-5"
        style={{
          background: 'var(--c-card)',
          border: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <h3 className="text-sm font-semibold text-white mb-4">Recent Alerts</h3>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-lg skeleton" />)}
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-slate-500">
            <AlertTriangle size={24} className="opacity-30" />
            <p className="text-sm">No active alerts</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.slice(0, 5).map((alert, i) => (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + i * 0.04 }}
                className="flex items-center justify-between px-4 py-3 rounded-xl"
                style={{
                  background: alert.severity === 'critical'
                    ? 'rgba(239,68,68,0.07)'
                    : 'rgba(245,158,11,0.07)',
                  border: `1px solid ${alert.severity === 'critical' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      background: alert.severity === 'critical' ? '#ef4444' : '#f59e0b',
                      boxShadow: `0 0 6px ${alert.severity === 'critical' ? '#ef4444' : '#f59e0b'}`,
                    }}
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-200">
                      {alert.symbol} — {alert.anomaly_type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-slate-500">{fmtTime(alert.timestamp)}</p>
                  </div>
                </div>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
                  style={{
                    background: alert.severity === 'critical' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                    color: alert.severity === 'critical' ? '#fca5a5' : '#fcd34d',
                  }}
                >
                  {alert.severity}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
