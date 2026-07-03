'use client'

import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface RoomQRProps {
  roomUrl: string
  shortCode: string
  expiresAt: string
}

export function RoomQR({ roomUrl, shortCode, expiresAt }: RoomQRProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, roomUrl, {
      width: 180,
      margin: 2,
      color: {
        dark: '#ffffff',
        light: '#00000000',
      },
    })
  }, [roomUrl])

  const copyUrl = async () => {
    await navigator.clipboard.writeText(roomUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const copyCode = async () => {
    await navigator.clipboard.writeText(shortCode)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  const expires = new Date(expiresAt)
  const minutesLeft = Math.max(0, Math.round((expires.getTime() - Date.now()) / 60_000))

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm space-y-4">
      <div className="text-center">
        <h3 className="text-sm font-medium text-white/70 mb-3">Scan to Join</h3>
        <div className="inline-flex items-center justify-center rounded-2xl bg-white/5 p-3 border border-white/10">
          <canvas ref={canvasRef} className="rounded-lg" />
        </div>
      </div>

      {/* Room code */}
      <div className="text-center">
        <p className="text-xs text-white/40 mb-1.5">Room Code</p>
        <button
          id="room-code-copy"
          onClick={copyCode}
          className="group inline-flex items-center gap-2 rounded-xl bg-violet-500/20 border border-violet-500/30 px-4 py-2 transition-all hover:bg-violet-500/30"
        >
          <span className="font-mono text-xl font-bold tracking-[0.3em] text-violet-300">
            {shortCode}
          </span>
          {codeCopied
            ? <Check className="h-4 w-4 text-emerald-400" />
            : <Copy className="h-4 w-4 text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          }
        </button>
      </div>

      {/* Copy link button */}
      <Button
        id="copy-room-link"
        variant="outline"
        className={cn(
          'w-full gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10 transition-all',
          copied && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
        )}
        onClick={copyUrl}
      >
        {copied ? (
          <><Check className="h-4 w-4" /> Copied!</>
        ) : (
          <><Copy className="h-4 w-4" /> Copy Room Link</>
        )}
      </Button>

      {/* Expiry */}
      <div className="text-center">
        <Badge
          variant="outline"
          className={cn(
            'border-white/10 text-xs',
            minutesLeft < 10
              ? 'text-red-400 border-red-500/20 bg-red-500/10'
              : 'text-white/40'
          )}
        >
          ⏱ Expires in {minutesLeft}m
        </Badge>
      </div>
    </div>
  )
}
