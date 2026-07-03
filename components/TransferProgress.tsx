'use client'

import { formatBytes, formatSpeed, formatEta } from '@/lib/fileUtils'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { ArrowDown, ArrowUp, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TransferProgress } from '@/lib/webrtc'

interface TransferProgressCardProps {
  transfer: TransferProgress
}

export function TransferProgressCard({ transfer }: TransferProgressCardProps) {
  const { peerId, fileName, fileSize, transferred, speed, direction } = transfer
  const percent = fileSize > 0 ? Math.round((transferred / fileSize) * 100) : 0
  const done = percent >= 100
  const remaining = fileSize - transferred

  return (
    <div className={cn(
      'rounded-2xl border p-4 backdrop-blur-sm transition-all duration-300',
      done
        ? 'border-emerald-500/30 bg-emerald-500/10'
        : 'border-white/10 bg-white/5'
    )}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {direction === 'send' ? (
              <ArrowUp className="h-4 w-4 shrink-0 text-violet-400" />
            ) : (
              <ArrowDown className="h-4 w-4 shrink-0 text-cyan-400" />
            )}
            <p className="truncate text-sm font-medium text-white">{fileName}</p>
          </div>
          <p className="mt-0.5 truncate text-xs text-white/40">
            Peer: {peerId.slice(0, 8)}…
          </p>
        </div>
        <div className="flex items-center gap-2">
          {done ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          ) : (
            <Badge
              variant="outline"
              className="shrink-0 border-white/20 bg-white/5 font-mono text-xs text-white/70"
            >
              {formatSpeed(speed)}
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Progress
          value={percent}
          className={cn(
            'h-2',
            done ? '[&>div]:bg-emerald-400' : direction === 'send'
              ? '[&>div]:bg-violet-500'
              : '[&>div]:bg-cyan-500'
          )}
        />
        <div className="flex justify-between text-xs text-white/40">
          <span>{formatBytes(transferred)} / {formatBytes(fileSize)}</span>
          <span>
            {done
              ? '✓ Complete'
              : speed > 0
                ? `ETA ${formatEta(remaining, speed)}`
                : `${percent}%`
            }
          </span>
        </div>
      </div>
    </div>
  )
}

interface TransferListProps {
  transfers: TransferProgress[]
}

export function TransferList({ transfers }: TransferListProps) {
  if (transfers.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">
        Transfers
      </h3>
      {transfers.map((t) => (
        <TransferProgressCard key={`${t.peerId}-${t.fileName}-${t.direction}`} transfer={t} />
      ))}
    </div>
  )
}
