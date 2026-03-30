export interface PriceResponse {
  symbol: string
  price: number
  timestamp: string
  provider: string
  source: 'cache' | 'db' | 'provider'
}

export interface PriceHistoryItem {
  price: number
  timestamp: string
  provider: string
}

export interface PortfolioResponse {
  id: string
  name: string
  portfolio_type: string
  created_at: string
}

export interface PositionResponse {
  id: string
  portfolio_id: string
  symbol: string
  provider: string
  quantity: number
  avg_cost_basis: number
  is_active: boolean
  opened_at: string
  closed_at: string | null
}

export interface PositionSnapshot {
  position_id: string
  symbol: string
  provider: string
  quantity: number
  avg_cost_basis: number
  current_price: number
  market_value: number
  unrealized_pnl: number
  pnl_pct: number
  weight: number
}

export interface PortfolioSnapshot {
  portfolio_id: string
  portfolio_name: string
  total_value: number
  total_pnl: number
  positions: PositionSnapshot[]
}

export interface MACDSchema {
  line: number
  signal: number
  histogram: number
}

export interface BollingerSchema {
  upper: number
  middle: number
  lower: number
  bandwidth: number
}

export interface IndicatorResponse {
  symbol: string
  provider: string
  rsi: number | null
  macd: MACDSchema | null
  bollinger: BollingerSchema | null
  signal: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  reasons: string[]
  price_count: number
}

export interface RiskResponse {
  portfolio_id: string
  total_value: number
  var_1day_95: number | null
  sharpe_ratio: number | null
  max_drawdown: number | null
  correlation_matrix: Record<string, Record<string, number>> | null
  symbols_analysed: string[]
  warning: string | null
}

export interface AlertResponse {
  id: string
  symbol: string
  provider: string
  anomaly_type: string
  severity: string
  price: number
  z_score: number | null
  fast_ma: number | null
  slow_ma: number | null
  resolved: boolean
  timestamp: string
}

export interface PortfolioAnalysisResponse {
  portfolio_id: string
  regime: string
  risks: string[]
  recommendations: string[]
  alert_explanations: string[]
  narrative: string
  cached: boolean
}

export interface AskQuestionResponse {
  question: string
  answer: string
  cached: boolean
}

export interface PollingJobResponse {
  job_id: string
  status: string
  config: {
    symbols: string[]
    interval: number
  }
}

export interface HealthResponse {
  status: string
  postgres: string
  redis: string
}

// ── Docs ─────────────────────────────────────────────────────────────────────

export interface DocThreshold {
  label: string
  value: string
  meaning: string
  action: string
}

export interface DocSubsection {
  id: string
  title: string
  summary: string
  how_it_works: string
  formula: string | null
  thresholds: DocThreshold[]
  real_world: string
  tip: string
}

export interface DocSection {
  id: string
  title: string
  icon: string
  color: string
  intro: string
  subsections: DocSubsection[]
}

export interface DocsResponse {
  title: string
  subtitle: string
  sections: DocSection[]
}
