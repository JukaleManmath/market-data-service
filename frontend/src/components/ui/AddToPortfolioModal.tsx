import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Loader2, CheckCircle } from 'lucide-react'
import { addPosition } from '../../api/client'

const PORTFOLIO_KEY = 'mip_portfolio_id'
const PORTFOLIO_NAME_KEY = 'mip_portfolio_name'

interface Props {
  symbol: string
  price: number
  provider?: string
  onClose: () => void
}

export default function AddToPortfolioModal({ symbol, price, provider = 'finnhub', onClose }: Props) {
  const portfolioId = localStorage.getItem(PORTFOLIO_KEY)
  const portfolioName = localStorage.getItem(PORTFOLIO_NAME_KEY) ?? 'Portfolio'

  const [qty, setQty] = useState('1')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalCost = parseFloat(qty || '0') * price

  const handleAdd = async () => {
    if (!portfolioId) return
    const quantity = parseFloat(qty)
    if (!quantity || quantity <= 0) {
      setError('Enter a valid quantity.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await addPosition(portfolioId, symbol, quantity, price, provider)
      setDone(true)
      setTimeout(onClose, 1200)
    } catch {
      setError('Failed to add position. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="relative w-full max-w-sm mx-4 rounded-2xl p-6"
          style={{
            background: '#0a0a0a',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 32px 64px rgba(0,0,0,0.8)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Top edge shine */}
          <div
            className="absolute inset-x-0 top-0 h-px rounded-t-2xl"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)' }}
          />

          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Add to Portfolio</p>
              <h2 className="text-xl font-semibold text-white">{symbol}</h2>
              <p className="text-sm text-white/40 mt-0.5">{portfolioName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors hover:bg-white/05 text-white/30 hover:text-white/60"
            >
              <X size={16} />
            </button>
          </div>

          {!portfolioId ? (
            <div className="text-center py-6">
              <p className="text-sm text-white/40">No portfolio selected.</p>
              <p className="text-xs text-white/25 mt-1">Create or load a portfolio in the Portfolio tab first.</p>
            </div>
          ) : done ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3 py-6"
            >
              <CheckCircle size={32} className="text-emerald-400" />
              <p className="text-sm text-white/70">Position added successfully</p>
            </motion.div>
          ) : (
            <>
              {/* Price display */}
              <div
                className="flex items-center justify-between px-4 py-3 rounded-xl mb-4"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <span className="text-xs text-white/40">Current Price</span>
                <span className="text-sm font-semibold tabular text-white">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)}
                </span>
              </div>

              {/* Quantity input */}
              <div className="mb-4">
                <label className="text-xs text-white/40 mb-2 block">Quantity (shares)</label>
                <input
                  type="number"
                  min="0.0001"
                  step="any"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm text-white bg-transparent outline-none"
                  style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)' }}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  autoFocus
                />
              </div>

              {/* Total cost */}
              <div
                className="flex items-center justify-between px-4 py-2.5 rounded-xl mb-4"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span className="text-xs text-white/40">Total Cost</span>
                <span className="text-sm font-semibold tabular text-white/80">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalCost || 0)}
                </span>
              </div>

              {error && (
                <p className="text-xs text-red-400 mb-3">{error}</p>
              )}

              {/* Confirm button */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleAdd}
                disabled={loading || !qty || parseFloat(qty) <= 0}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all btn-primary disabled:opacity-30"
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin" style={{ color: '#000' }} />
                ) : (
                  <Plus size={15} style={{ color: '#000' }} />
                )}
                <span style={{ color: '#000' }}>Add {qty || '0'} share{parseFloat(qty) !== 1 ? 's' : ''}</span>
              </motion.button>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
