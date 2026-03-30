import { useEffect, useRef, useState } from 'react'

interface PriceUpdate {
  symbol: string
  price: number
  timestamp: string
  provider: string
}

export function useWebSocket(symbol: string | null) {
  const [price, setPrice] = useState<PriceUpdate | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!symbol) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = `${protocol}//${host}/ws/prices/${symbol.toUpperCase()}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)
    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as PriceUpdate
        setPrice(data)
      } catch {
        // ignore malformed frames
      }
    }

    return () => {
      ws.close()
      setConnected(false)
    }
  }, [symbol])

  return { price, connected }
}
