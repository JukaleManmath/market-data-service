import axios from 'axios'
import type {
  AlertResponse,
  AskQuestionResponse,
  DocsResponse,
  HealthResponse,
  IndicatorResponse,
  PollingJobResponse,
  PortfolioAnalysisResponse,
  PortfolioResponse,
  PortfolioSnapshot,
  PositionResponse,
  PriceHistoryItem,
  PriceResponse,
  RiskResponse,
} from '../types'

const http = axios.create({ baseURL: '/' })

// ── Prices ──────────────────────────────────────────────────────────────────

export const fetchLatestPrice = (symbol: string, provider = 'finnhub') =>
  http.get<PriceResponse>('/prices/latest', { params: { symbol, provider } }).then(r => r.data)

export const fetchPriceHistory = (symbol: string, provider = 'finnhub', limit = 100) =>
  http.get<PriceHistoryItem[]>('/prices/history', { params: { symbol, provider, limit } }).then(r => r.data)

// ── Polling jobs ─────────────────────────────────────────────────────────────

export const createPollingJob = (symbols: string[], interval = 30, provider = 'finnhub') =>
  http.post<PollingJobResponse>('/prices/poll', { symbols, interval, provider }).then(r => r.data)

export const deletePollingJob = (jobId: string) =>
  http.delete(`/prices/poll/${jobId}`)

// ── Portfolios ───────────────────────────────────────────────────────────────

export const fetchPortfolios = () =>
  http.get<PortfolioResponse[]>('/portfolios').then(r => r.data)

export const createPortfolio = (name: string, portfolio_type = 'stock') =>
  http.post<PortfolioResponse>('/portfolios', { name, portfolio_type }).then(r => r.data)

export const deletePortfolio = (id: string) =>
  http.delete(`/portfolios/${id}`)

export const addPosition = (portfolioId: string, symbol: string, quantity: number, price: number, provider = 'finnhub') =>
  http.post<PositionResponse>(`/portfolios/${portfolioId}/positions`, { symbol, quantity, price, provider }).then(r => r.data)

export const closePosition = (portfolioId: string, positionId: string) =>
  http.delete<PositionResponse>(`/portfolios/${portfolioId}/positions/${positionId}`).then(r => r.data)

export const fetchSnapshot = (portfolioId: string) =>
  http.get<PortfolioSnapshot>(`/portfolios/${portfolioId}/snapshot`).then(r => r.data)

export const fetchPortfolioAnalysis = (portfolioId: string, llmProvider?: string) =>
  http.get<PortfolioAnalysisResponse>(`/portfolios/${portfolioId}/analysis`, {
    params: llmProvider ? { llm_provider: llmProvider } : undefined,
  }).then(r => r.data)

export const askQuestion = (portfolioId: string, question: string, llmProvider?: string) =>
  http.post<AskQuestionResponse>(
    `/portfolios/${portfolioId}/ask`,
    { question },
    { params: llmProvider ? { llm_provider: llmProvider } : undefined },
  ).then(r => r.data)

// ── Analytics ────────────────────────────────────────────────────────────────

export const fetchIndicators = (symbol: string, provider = 'finnhub') =>
  http.get<IndicatorResponse>(`/analytics/${symbol}/indicators`, { params: { provider } }).then(r => r.data)

export const fetchPortfolioRisk = (portfolioId: string) =>
  http.get<RiskResponse>(`/analytics/portfolios/${portfolioId}/risk`).then(r => r.data)

// ── Alerts ───────────────────────────────────────────────────────────────────

export const fetchAlerts = (symbol?: string, provider?: string) =>
  http.get<AlertResponse[]>('/alerts/active', { params: { symbol, provider } }).then(r => r.data)

export const resolveAlert = (alertId: string) =>
  http.post<AlertResponse>(`/alerts/${alertId}/resolve`).then(r => r.data)

// ── Insights ──────────────────────────────────────────────────────────────────

export const fetchInsights = (symbol: string, llmProvider?: string) =>
  http.get<{ symbol: string; summary: string; cached: boolean }>(`/insights/${symbol}`, {
    params: llmProvider ? { llm_provider: llmProvider } : undefined,
  }).then(r => r.data)

// ── Health ───────────────────────────────────────────────────────────────────

export const fetchHealth = () =>
  http.get<HealthResponse>('/health').then(r => r.data)

// ── Docs ─────────────────────────────────────────────────────────────────────

export const fetchDocs = () =>
  http.get<DocsResponse>('/guide').then(r => r.data)
