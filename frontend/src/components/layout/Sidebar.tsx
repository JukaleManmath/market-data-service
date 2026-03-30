import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  Briefcase,
  BarChart2,
  Bell,
  Sparkles,
  Activity,
  Zap,
  Moon,
  Sun,
  BookOpen,
  Globe,
  Bitcoin,
} from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/markets', icon: Globe, label: 'Markets' },
  { to: '/crypto', icon: Bitcoin, label: 'Crypto' },
  { to: '/portfolio', icon: Briefcase, label: 'Portfolio' },
  { to: '/analytics', icon: BarChart2, label: 'Analytics' },
  { to: '/alerts', icon: Bell, label: 'Alerts' },
  { to: '/insights', icon: Sparkles, label: 'AI Insights' },
  { to: '/docs', icon: BookOpen, label: 'Guide' },
]

export default function Sidebar() {
  const { theme, toggle } = useTheme()

  return (
    <motion.aside
      initial={{ x: -80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="fixed left-0 top-0 h-screen w-64 z-40 flex flex-col"
      style={{
        background: 'var(--c-sidebar-bg)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        backdropFilter: 'blur(24px)',
      }}
    >
      {/* Top edge shine */}
      <div className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)' }} />

      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6 border-b border-white/[0.05]">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <Activity size={17} className="text-white" />
        </div>
        <div>
          <p className="text-sm text-white leading-tight" style={{ fontWeight: 700, fontFamily: 'Space Grotesk, Inter, sans-serif' }}>
            Market Intel
          </p>
          <p className="text-xs leading-tight" style={{ color: 'rgba(255,255,255,0.25)' }}>Platform v2</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'}>
            {({ isActive }) => (
              <motion.div
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.97 }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 relative ${
                  isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                style={
                  isActive
                    ? {
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                      }
                    : {
                        background: 'transparent',
                        border: '1px solid transparent',
                      }
                }
              >
                {/* Active left bar */}
                {isActive && (
                  <motion.div
                    layoutId="nav-active-bar"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.7)' }}
                  />
                )}
                <Icon
                  size={17}
                  style={{ color: isActive ? 'rgba(255,255,255,0.9)' : undefined }}
                  className={isActive ? '' : 'text-slate-500'}
                />
                <span className="text-sm font-medium">{label}</span>
                {isActive && (
                  <motion.div
                    layoutId="active-indicator"
                    className="ml-auto w-1.5 h-1.5 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.6)' }}
                  />
                )}
              </motion.div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom status */}
      <div className="px-4 py-4 border-t border-white/[0.05] space-y-2">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{
            background: 'rgba(16, 185, 129, 0.07)',
            border: '1px solid rgba(16,185,129,0.15)',
          }}
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400 pulse-green flex-shrink-0" />
          <span className="text-xs text-emerald-400 font-medium">Live data streaming</span>
          <Zap size={11} className="ml-auto text-emerald-500" />
        </div>

        {/* Theme toggle */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={toggle}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            color: 'rgba(255,255,255,0.45)',
          }}
        >
          {theme === 'black'
            ? <><Sun size={12} /><span>Switch to Navy</span></>
            : <><Moon size={12} /><span>Switch to Black</span></>
          }
        </motion.button>
      </div>
    </motion.aside>
  )
}
