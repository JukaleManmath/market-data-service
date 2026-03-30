import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, Send, Bot, User, Loader2, RefreshCw,
  ChevronDown, AlertCircle, BookOpen, TrendingUp, Shield,
} from 'lucide-react'
import {
  fetchInsights, fetchPortfolioAnalysis, askQuestion,
} from '../api/client'
import type { PortfolioAnalysisResponse } from '../types'

const PORTFOLIO_KEY = 'mip_portfolio_id'
const PORTFOLIO_NAME_KEY = 'mip_portfolio_name'

interface Message {
  role: 'user' | 'assistant'
  content: string
  cached?: boolean
}

const SUGGESTED = [
  'What is my most volatile position?',
  'Which stock has the highest RSI?',
  'How correlated are my positions?',
  'What are the main risks in my portfolio?',
]

export default function AIInsights() {
  const [portfolioId] = useState<string | null>(() => localStorage.getItem(PORTFOLIO_KEY))
  const [portfolioName] = useState(() => localStorage.getItem(PORTFOLIO_NAME_KEY) ?? 'Portfolio')

  // Symbol insights
  const [insightSymbol, setInsightSymbol] = useState('')
  const [insight, setInsight] = useState<string | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)

  // Portfolio analysis
  const [analysis, setAnalysis] = useState<PortfolioAnalysisResponse | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  // Q&A chat
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [qaLoading, setQaLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadAnalysis = async () => {
    if (!portfolioId) return
    setAnalysisLoading(true)
    setAnalysisError(null)
    try {
      const data = await fetchPortfolioAnalysis(portfolioId)
      setAnalysis(data)
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.data?.detail) {
        setAnalysisError(e.response.data.detail)
      } else {
        setAnalysisError('Failed to load analysis. Ensure the portfolio has positions with price data.')
      }
    } finally {
      setAnalysisLoading(false)
    }
  }

  const loadInsight = async (sym: string) => {
    if (!sym.trim()) return
    setInsightLoading(true)
    try {
      const data = await fetchInsights(sym.trim().toUpperCase())
      setInsight(data.summary)
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.data?.detail) {
        setInsight(`Error: ${e.response.data.detail}`)
      } else {
        setInsight(`Could not fetch insights for ${sym.toUpperCase()}. Ensure price data exists.`)
      }
    } finally {
      setInsightLoading(false)
    }
  }

  const sendQuestion = async (q?: string) => {
    const text = q ?? question
    if (!text.trim() || !portfolioId || qaLoading) return
    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setQuestion('')
    setQaLoading(true)
    try {
      const res = await askQuestion(portfolioId, text)
      setMessages(prev => [...prev, { role: 'assistant', content: res.answer, cached: res.cached }])
    } catch (e: unknown) {
      const detail = axios.isAxiosError(e) && e.response?.data?.detail
        ? e.response.data.detail
        : 'I encountered an error processing your question. Please try again.'
      setMessages(prev => [...prev, { role: 'assistant', content: detail }])
    } finally {
      setQaLoading(false)
    }
  }

  const REGIME_COLORS: Record<string, { color: string; bg: string }> = {
    'risk-on': { color: '#34d399', bg: 'rgba(16,185,129,0.1)' },
    'risk-off': { color: '#f87171', bg: 'rgba(239,68,68,0.1)' },
    neutral: { color: '#93c5fd', bg: 'rgba(59,130,246,0.1)' },
    unknown: { color: '#94a3b8', bg: 'rgba(255,255,255,0.05)' },
  }

  const regimeConfig = analysis ? (REGIME_COLORS[analysis.regime] ?? REGIME_COLORS.unknown) : null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(6,182,212,0.2))' }}
        >
          <Sparkles size={18} className="text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">AI Insights</h1>
          <p className="text-sm text-slate-400">Powered by Claude — portfolio intelligence & natural language Q&A</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Portfolio analysis */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Portfolio Analysis</h2>
            {portfolioId && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={loadAnalysis}
                disabled={analysisLoading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
              >
                <RefreshCw size={12} className={analysisLoading ? 'animate-spin' : ''} />
                {analysis ? 'Refresh' : 'Run Analysis'}
              </motion.button>
            )}
          </div>

          {!portfolioId ? (
            <div
              className="rounded-2xl p-6 text-center"
              style={{ background: 'var(--c-card)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <AlertCircle size={24} className="mx-auto text-slate-500 mb-2" />
              <p className="text-sm text-slate-400">No portfolio found</p>
              <p className="text-xs text-slate-600 mt-1">Create a portfolio in the Portfolio tab first</p>
            </div>
          ) : analysisLoading ? (
            <div
              className="rounded-2xl p-8 flex flex-col items-center gap-3"
              style={{ background: 'var(--c-card)', border: '1px solid rgba(139,92,246,0.2)' }}
            >
              <div className="relative">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(139,92,246,0.15)' }}
                >
                  <Bot size={22} className="text-violet-400" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center">
                  <Loader2 size={10} className="animate-spin text-white" />
                </div>
              </div>
              <p className="text-sm text-slate-300">Claude is analysing your portfolio…</p>
              <p className="text-xs text-slate-500">Gathering risk metrics, price data & alerts</p>
            </div>
          ) : analysisError ? (
            <div
              className="rounded-2xl p-4 text-sm text-amber-300"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
            >
              {analysisError}
            </div>
          ) : analysis ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Regime */}
              <div
                className="rounded-2xl p-5"
                style={{
                  background: regimeConfig!.bg,
                  border: `1px solid ${regimeConfig!.color}33`,
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-400 uppercase tracking-wider">Market Regime</span>
                  {analysis.cached && (
                    <span className="text-xs text-slate-600 px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.04)' }}>Cached</span>
                  )}
                </div>
                <p className="text-2xl font-bold capitalize mb-3" style={{ color: regimeConfig!.color }}>
                  {analysis.regime.replace(/-/g, ' ')}
                </p>
                <p className="text-sm text-slate-300 leading-relaxed">{analysis.narrative}</p>
              </div>

              {/* Risks */}
              {analysis.risks.length > 0 && (
                <div
                  className="rounded-2xl p-5"
                  style={{ background: 'var(--c-card)', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Shield size={15} className="text-red-400" />
                    <h3 className="text-sm font-semibold text-white">Top Risks</h3>
                  </div>
                  <ul className="space-y-2">
                    {analysis.risks.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="text-red-400 mt-0.5 flex-shrink-0">·</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              {analysis.recommendations.length > 0 && (
                <div
                  className="rounded-2xl p-5"
                  style={{ background: 'var(--c-card)', border: '1px solid rgba(16,185,129,0.2)' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={15} className="text-emerald-400" />
                    <h3 className="text-sm font-semibold text-white">Recommendations</h3>
                  </div>
                  <ul className="space-y-2">
                    {analysis.recommendations.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="text-emerald-400 mt-0.5 flex-shrink-0">·</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Alert explanations */}
              {analysis.alert_explanations.length > 0 && (
                <div
                  className="rounded-2xl p-5"
                  style={{ background: 'var(--c-card)', border: '1px solid rgba(245,158,11,0.2)' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle size={15} className="text-amber-400" />
                    <h3 className="text-sm font-semibold text-white">Alert Explanations</h3>
                  </div>
                  <ul className="space-y-2">
                    {analysis.alert_explanations.map((e, i) => (
                      <li key={i} className="text-sm text-slate-300">{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          ) : (
            <div
              className="rounded-2xl p-6 flex flex-col items-center gap-3 text-center cursor-pointer hover:border-violet-500/30 transition-colors"
              style={{ background: 'var(--c-card)', border: '1px solid rgba(255,255,255,0.06)' }}
              onClick={loadAnalysis}
            >
              <Bot size={28} className="text-violet-400 opacity-50" />
              <p className="text-sm text-slate-400">Click "Run Analysis" to get Claude's assessment of your portfolio</p>
            </div>
          )}
        </div>

        {/* Q&A + Symbol insights */}
        <div className="space-y-4">
          {/* Symbol insight */}
          <div
            className="rounded-2xl p-5"
            style={{ background: 'var(--c-card)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={15} className="text-cyan-400" />
              <h3 className="text-sm font-semibold text-white">Symbol Intelligence</h3>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                value={insightSymbol}
                onChange={e => setInsightSymbol(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && loadInsight(insightSymbol)}
                placeholder="Symbol (e.g. AAPL)..."
                className="flex-1 px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500 outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              />
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => loadInsight(insightSymbol)}
                disabled={insightLoading || !insightSymbol}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'rgba(6,182,212,0.2)', border: '1px solid rgba(6,182,212,0.3)' }}
              >
                {insightLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              </motion.button>
            </div>
            {insight && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-slate-300 leading-relaxed p-3 rounded-lg"
                style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)' }}
              >
                {insight}
              </motion.div>
            )}
          </div>

          {/* Chat */}
          <div
            className="rounded-2xl flex flex-col"
            style={{
              background: 'var(--c-card)',
              border: '1px solid rgba(139,92,246,0.2)',
              backdropFilter: 'blur(12px)',
              height: '420px',
            }}
          >
            <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.05]">
              <Bot size={16} className="text-violet-400" />
              <h3 className="text-sm font-semibold text-white">Ask Claude</h3>
              {!portfolioId && <span className="text-xs text-amber-400 ml-auto">Requires portfolio</span>}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 mb-3">Suggested questions:</p>
                  {SUGGESTED.map(q => (
                    <motion.button
                      key={q}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => sendQuestion(q)}
                      disabled={!portfolioId}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <ChevronDown size={10} className="inline mr-1.5 -rotate-90 text-violet-400" />
                      {q}
                    </motion.button>
                  ))}
                </div>
              )}

              <AnimatePresence>
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: 'rgba(139,92,246,0.2)' }}
                      >
                        <Bot size={12} className="text-violet-400" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                        msg.role === 'user'
                          ? 'text-white rounded-tr-sm'
                          : 'text-slate-300 rounded-tl-sm'
                      }`}
                      style={
                        msg.role === 'user'
                          ? { background: 'var(--c-btn)' }
                          : {
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.07)',
                            }
                      }
                    >
                      {msg.content}
                      {msg.cached && (
                        <span className="text-xs text-slate-600 ml-2">(cached)</span>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: 'rgba(37,99,235,0.2)' }}
                      >
                        <User size={12} className="text-blue-400" />
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {qaLoading && (
                <div className="flex gap-2 items-center">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(139,92,246,0.2)' }}>
                    <Bot size={12} className="text-violet-400" />
                  </div>
                  <div className="flex gap-1 px-3 py-2 rounded-2xl rounded-tl-sm"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-violet-400"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 pb-4">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <input
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendQuestion()}
                  placeholder={portfolioId ? 'Ask about your portfolio…' : 'Create a portfolio to use Q&A'}
                  disabled={!portfolioId || qaLoading}
                  className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 outline-none disabled:cursor-not-allowed"
                />
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => sendQuestion()}
                  disabled={!portfolioId || qaLoading || !question.trim()}
                  className="p-1.5 rounded-lg disabled:opacity-40 transition-opacity"
                  style={{ background: 'rgba(139,92,246,0.3)', color: '#a78bfa' }}
                >
                  <Send size={13} />
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
