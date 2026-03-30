import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, CheckCircle, RefreshCw, Filter, AlertTriangle, Info, Plus } from 'lucide-react'
import { fetchAlerts, resolveAlert, fetchLatestPrice } from '../api/client'
import type { AlertResponse } from '../types'
import AddToPortfolioModal from '../components/ui/AddToPortfolioModal'

const fmtUsd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)

const fmtDateTime = (ts: string) =>
  new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

const SEVERITY_CONFIG = {
  critical: {
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.25)',
    dot: '#ef4444',
    badge: 'rgba(239,68,68,0.15)',
    badgeText: '#fca5a5',
  },
  high: {
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.25)',
    dot: '#f59e0b',
    badge: 'rgba(245,158,11,0.15)',
    badgeText: '#fcd34d',
  },
  medium: {
    bg: 'var(--c-accent-faint)',
    border: 'var(--c-accent-soft)',
    dot: 'var(--c-accent)',
    badge: 'var(--c-accent-soft)',
    badgeText: 'var(--c-accent-text)',
  },
  low: {
    bg: 'rgba(255,255,255,0.03)',
    border: 'rgba(255,255,255,0.08)',
    dot: '#64748b',
    badge: 'rgba(255,255,255,0.06)',
    badgeText: '#94a3b8',
  },
}

type Severity = keyof typeof SEVERITY_CONFIG

function getSeverityConfig(sev: string) {
  return SEVERITY_CONFIG[(sev as Severity)] ?? SEVERITY_CONFIG.low
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<AlertResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [resolving, setResolving] = useState<Set<string>>(new Set())
  const [modalTarget, setModalTarget] = useState<{ symbol: string; price: number } | null>(null)
  const [fetchingPrice, setFetchingPrice] = useState<Set<string>>(new Set())

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchAlerts()
      setAlerts(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleResolve = async (id: string) => {
    setResolving(prev => new Set([...prev, id]))
    try {
      await resolveAlert(id)
      setAlerts(prev => prev.filter(a => a.id !== id))
    } finally {
      setResolving(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const handleAddToPortfolio = async (alert: AlertResponse) => {
    setFetchingPrice(prev => new Set([...prev, alert.id]))
    try {
      const priceRes = await fetchLatestPrice(alert.symbol, alert.provider).catch(() => null)
      const price = priceRes?.price ?? alert.price
      setModalTarget({ symbol: alert.symbol, price })
    } finally {
      setFetchingPrice(prev => { const s = new Set(prev); s.delete(alert.id); return s })
    }
  }

  const severities = ['all', 'critical', 'high', 'medium', 'low']
  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.severity === filter)

  const counts = {
    critical: alerts.filter(a => a.severity === 'critical').length,
    high: alerts.filter(a => a.severity === 'high').length,
    medium: alerts.filter(a => a.severity === 'medium').length,
    low: alerts.filter(a => a.severity === 'low').length,
  }

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
          <h1 className="text-2xl font-bold text-white">Anomaly Alerts</h1>
          <p className="text-sm text-slate-400 mt-0.5">Z-score & moving average divergence signals</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 transition-colors"
          style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </motion.button>
      </div>

      {/* Severity summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
          const cfg = SEVERITY_CONFIG[sev]
          return (
            <motion.div
              key={sev}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: ['critical', 'high', 'medium', 'low'].indexOf(sev) * 0.06 }}
              className="rounded-xl px-4 py-3 cursor-pointer transition-all"
              style={{
                background: filter === sev ? cfg.bg : 'rgba(255,255,255,0.02)',
                border: `1px solid ${filter === sev ? cfg.border : 'rgba(255,255,255,0.06)'}`,
              }}
              onClick={() => setFilter(filter === sev ? 'all' : sev)}
            >
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 capitalize">{sev}</p>
              <p className="text-2xl font-bold" style={{ color: cfg.dot }}>
                {counts[sev]}
              </p>
            </motion.div>
          )
        })}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        <Filter size={13} className="text-slate-500" />
        <div className="flex gap-1">
          {severities.map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all capitalize"
              style={{
                background: filter === s ? 'var(--c-accent-soft)' : 'rgba(255,255,255,0.03)',
                color: filter === s ? 'var(--c-accent-text)' : '#64748b',
                border: `1px solid ${filter === s ? 'var(--c-accent-soft)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              {s}
              {s !== 'all' && counts[s as Severity] > 0 && (
                <span className="ml-1.5 text-xs opacity-70">{counts[s as Severity]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Alert list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl skeleton" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-3 py-20"
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <Bell size={24} className="text-emerald-400 opacity-60" />
          </div>
          <p className="text-slate-400 text-sm">
            {filter === 'all' ? 'No active alerts' : `No ${filter} alerts`}
          </p>
          <p className="text-slate-600 text-xs">All systems are running within normal parameters</p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map((alert, i) => {
              const cfg = getSeverityConfig(alert.severity)
              return (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16, scale: 0.97 }}
                  transition={{ delay: i * 0.04 }}
                  className="rounded-2xl p-4"
                  style={{
                    background: cfg.bg,
                    border: `1px solid ${cfg.border}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      {/* Severity dot */}
                      <div className="mt-0.5 flex-shrink-0">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{
                            background: cfg.dot,
                            boxShadow: `0 0 8px ${cfg.dot}`,
                          }}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-semibold text-white">{alert.symbol}</span>
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full capitalize"
                            style={{ background: cfg.badge, color: cfg.badgeText }}
                          >
                            {alert.severity}
                          </span>
                          <span className="text-xs text-slate-500 px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(255,255,255,0.04)' }}>
                            {alert.anomaly_type.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                          <span>Price: <span className="text-slate-200 tabular">{fmtUsd(alert.price)}</span></span>
                          {alert.z_score != null && (
                            <span>Z-score: <span className="text-slate-200 tabular">{alert.z_score.toFixed(2)}</span></span>
                          )}
                          {alert.fast_ma != null && (
                            <span>Fast MA: <span className="text-slate-200 tabular">{fmtUsd(alert.fast_ma)}</span></span>
                          )}
                          {alert.slow_ma != null && (
                            <span>Slow MA: <span className="text-slate-200 tabular">{fmtUsd(alert.slow_ma)}</span></span>
                          )}
                          <span>{fmtDateTime(alert.timestamp)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleAddToPortfolio(alert)}
                        disabled={fetchingPrice.has(alert.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: 'rgba(255,255,255,0.6)',
                        }}
                      >
                        {fetchingPrice.has(alert.id) ? (
                          <RefreshCw size={12} className="animate-spin" />
                        ) : (
                          <Plus size={12} />
                        )}
                        Add
                      </motion.button>

                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleResolve(alert.id)}
                        disabled={resolving.has(alert.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: 'rgba(16,185,129,0.1)',
                          border: '1px solid rgba(16,185,129,0.25)',
                          color: '#34d399',
                        }}
                      >
                        {resolving.has(alert.id) ? (
                          <RefreshCw size={12} className="animate-spin" />
                        ) : (
                          <CheckCircle size={12} />
                        )}
                        Resolve
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Info box */}
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <Info size={14} className="text-white/30 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-slate-400">
          Alerts are generated by the anomaly detection pipeline using z-score analysis (±3σ/±4σ)
          and moving average divergence. Use <strong className="text-white/50">Add</strong> to open a position directly from an alert.
        </p>
      </div>

      {/* Add to portfolio modal */}
      <AnimatePresence>
        {modalTarget && (
          <AddToPortfolioModal
            symbol={modalTarget.symbol}
            price={modalTarget.price}
            onClose={() => setModalTarget(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
