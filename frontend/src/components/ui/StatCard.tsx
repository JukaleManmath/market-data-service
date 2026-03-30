import { motion } from 'framer-motion'
import { type ReactNode } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: number        // positive = up, negative = down
  icon?: ReactNode
  accentColor?: string  // tailwind color like 'blue', 'green', 'red'
  loading?: boolean
  delay?: number
}

const colorMap: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  blue: {
    bg: 'var(--c-accent-faint)',
    border: 'var(--c-accent-soft)',
    text: 'var(--c-accent-text)',
    glow: 'var(--c-accent-glow)',
  },
  green: {
    bg: 'rgba(16, 185, 129, 0.08)',
    border: 'rgba(16, 185, 129, 0.2)',
    text: '#34d399',
    glow: 'rgba(16, 185, 129, 0.1)',
  },
  red: {
    bg: 'rgba(239, 68, 68, 0.08)',
    border: 'rgba(239, 68, 68, 0.2)',
    text: '#f87171',
    glow: 'rgba(239, 68, 68, 0.1)',
  },
  amber: {
    bg: 'rgba(245, 158, 11, 0.08)',
    border: 'rgba(245, 158, 11, 0.2)',
    text: '#fbbf24',
    glow: 'rgba(245, 158, 11, 0.1)',
  },
  cyan: {
    bg: 'rgba(6, 182, 212, 0.08)',
    border: 'rgba(6, 182, 212, 0.2)',
    text: '#22d3ee',
    glow: 'rgba(6, 182, 212, 0.1)',
  },
}

export default function StatCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  accentColor = 'blue',
  loading = false,
  delay = 0,
}: StatCardProps) {
  const colors = colorMap[accentColor] ?? colorMap.blue

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      whileHover={{ y: -2, scale: 1.01 }}
      className="relative rounded-2xl p-5 overflow-hidden"
      style={{
        background: 'var(--c-card)',
        border: `1px solid ${colors.border}`,
        boxShadow: `0 0 30px ${colors.glow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Background gradient */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background: `radial-gradient(ellipse at top right, ${colors.bg}, transparent 70%)`,
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</p>
          {icon && (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
            >
              <span style={{ color: colors.text }}>{icon}</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            <div className="h-8 w-32 rounded skeleton" />
            <div className="h-4 w-20 rounded skeleton" />
          </div>
        ) : (
          <>
            <p
              className="text-3xl font-bold tabular leading-none mb-2"
              style={{ color: colors.text, fontFeatureSettings: '"tnum"' }}
            >
              {value}
            </p>
            <div className="flex items-center gap-2">
              {trend !== undefined && (
                <span
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: trend >= 0 ? '#34d399' : '#f87171' }}
                >
                  {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {Math.abs(trend).toFixed(2)}%
                </span>
              )}
              {subtitle && (
                <span className="text-xs text-slate-500">{subtitle}</span>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}
