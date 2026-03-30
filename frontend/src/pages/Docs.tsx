import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, Rocket, BarChart2, Zap, Bell, Shield, Activity, Briefcase,
  ChevronRight, Loader2, AlertCircle, Lightbulb, TrendingUp, Code2,
} from 'lucide-react'
import { fetchDocs } from '../api/client'
import type { DocsResponse, DocSection, DocSubsection } from '../types'

const ICON_MAP: Record<string, React.ElementType> = {
  Rocket,
  BarChart2,
  Zap,
  Bell,
  Shield,
  Activity,
  Briefcase,
  BookOpen,
}

function SectionIcon({ name, color }: { name: string; color: string }) {
  const Icon = ICON_MAP[name] ?? BookOpen
  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ background: `${color}14`, border: `1px solid ${color}30` }}
    >
      <Icon size={15} style={{ color }} />
    </div>
  )
}

function ThresholdRow({ t, color }: { t: { label: string; value: string; meaning: string; action: string }; color: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <code
          className="text-xs font-mono px-2 py-0.5 rounded-md flex-shrink-0"
          style={{ background: `${color}14`, color }}
        >
          {t.label}
        </code>
        <span className="text-sm font-medium text-white flex-1">{t.value}</span>
        <ChevronRight
          size={14}
          className="text-slate-500 transition-transform flex-shrink-0"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-white/[0.05]">
              <div className="pt-3">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">What it means</p>
                <p className="text-sm text-slate-300 leading-relaxed">{t.meaning}</p>
              </div>
              <div
                className="flex items-start gap-2 p-3 rounded-lg"
                style={{ background: `${color}08`, border: `1px solid ${color}20` }}
              >
                <TrendingUp size={13} style={{ color }} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color }}>How to act</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{t.action}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SubsectionCard({ sub, color, index }: { sub: DocSubsection; color: string; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-2xl p-6 space-y-5"
      style={{
        background: 'var(--c-card)',
        border: '1px solid var(--c-border)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      {/* Title + summary */}
      <div>
        <h3 className="text-base font-semibold text-white mb-1.5">{sub.title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed">{sub.summary}</p>
      </div>

      {/* How it works */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">How it works</p>
        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{sub.how_it_works}</p>
      </div>

      {/* Formula */}
      {sub.formula && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <Code2 size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
          <code className="text-sm font-mono text-slate-300 leading-relaxed">{sub.formula}</code>
        </div>
      )}

      {/* Thresholds */}
      {sub.thresholds.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Thresholds & Actions</p>
          {sub.thresholds.map(t => (
            <ThresholdRow key={t.label} t={t} color={color} />
          ))}
        </div>
      )}

      {/* Real world */}
      <div
        className="flex items-start gap-3 p-4 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <Activity size={14} style={{ color }} className="mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color }}>Real-world usage</p>
          <p className="text-xs text-slate-400 leading-relaxed">{sub.real_world}</p>
        </div>
      </div>

      {/* Tip */}
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-xl"
        style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}
      >
        <Lightbulb size={13} className="text-amber-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-200 leading-relaxed">{sub.tip}</p>
      </div>
    </motion.div>
  )
}

function SectionView({ section }: { section: DocSection }) {
  return (
    <div className="space-y-5">
      {/* Section header */}
      <div
        className="rounded-2xl px-6 py-5"
        style={{
          background: `${section.color}08`,
          border: `1px solid ${section.color}25`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <SectionIcon name={section.icon} color={section.color} />
          <h2 className="text-xl font-bold text-white">{section.title}</h2>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">{section.intro}</p>
      </div>

      {/* Subsections */}
      {section.subsections.map((sub, i) => (
        <SubsectionCard key={sub.id} sub={sub} color={section.color} index={i} />
      ))}
    </div>
  )
}

export default function Docs() {
  const [data, setData] = useState<DocsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string>('')

  useEffect(() => {
    fetchDocs()
      .then(d => {
        setData(d)
        if (d.sections.length > 0) setActiveSection(d.sections[0].id)
      })
      .catch(() => setError('Failed to load documentation.'))
      .finally(() => setLoading(false))
  }, [])

  const currentSection = data?.sections.find(s => s.id === activeSection) ?? null

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--c-accent-faint)', border: '1px solid var(--c-accent-soft)' }}
        >
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--c-accent)' }} />
        </div>
        <p className="text-sm text-slate-400">Loading documentation…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <AlertCircle size={28} className="text-red-400" />
        <p className="text-sm text-slate-400">{error ?? 'Unknown error'}</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--c-accent-faint)', border: '1px solid var(--c-accent-soft)' }}
        >
          <BookOpen size={18} style={{ color: 'var(--c-accent)' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{data.title}</h1>
          <p className="text-sm text-slate-400 mt-0.5">{data.subtitle}</p>
        </div>
      </div>

      <div className="flex gap-6 items-start">
        {/* Sticky TOC */}
        <aside className="hidden xl:block w-52 flex-shrink-0 sticky top-8 space-y-1">
          {data.sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm transition-all"
              style={
                activeSection === s.id
                  ? {
                      background: `${s.color}10`,
                      border: `1px solid ${s.color}28`,
                      color: '#ffffff',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
                    }
                  : {
                      background: 'transparent',
                      border: '1px solid transparent',
                      color: '#64748b',
                    }
              }
            >
              <SectionIcon name={s.icon} color={activeSection === s.id ? s.color : '#64748b'} />
              <span className="font-medium text-xs">{s.title}</span>
            </button>
          ))}
        </aside>

        {/* Mobile section tabs */}
        <div className="xl:hidden flex gap-2 overflow-x-auto pb-1 w-full">
          {data.sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0"
              style={
                activeSection === s.id
                  ? { background: `${s.color}15`, border: `1px solid ${s.color}30`, color: s.color }
                  : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#64748b' }
              }
            >
              {s.title}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {currentSection && (
              <motion.div
                key={currentSection.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <SectionView section={currentSection} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
