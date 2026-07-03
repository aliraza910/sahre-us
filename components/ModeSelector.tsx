'use client'

import { cn } from '@/lib/utils'
import { Wifi, Globe, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

type Mode = 'lan' | 'external'

interface ModeSelectorProps {
  mode: Mode
  onChange: (mode: Mode) => void
  autoDetected?: boolean
  detecting?: boolean
}

export function ModeSelector({ mode, onChange, autoDetected, detecting }: ModeSelectorProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/70">Transfer Mode</h3>
        {autoDetected && !detecting && (
          <Badge variant="outline" className="border-white/20 bg-white/5 text-xs text-white/40">
            Auto-detected
          </Badge>
        )}
        {detecting && (
          <div className="flex items-center gap-1.5 text-xs text-white/40">
            <Loader2 className="h-3 w-3 animate-spin" />
            Detecting…
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* LAN Mode */}
        <button
          id="mode-lan"
          onClick={() => onChange('lan')}
          className={cn(
            'group relative rounded-xl border p-4 text-left transition-all duration-200',
            mode === 'lan'
              ? 'border-violet-500/50 bg-violet-500/15 shadow-lg shadow-violet-500/10'
              : 'border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/5'
          )}
        >
          <div className={cn(
            'mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
            mode === 'lan' ? 'bg-violet-500/30' : 'bg-white/10 group-hover:bg-white/15'
          )}>
            <Wifi className={cn('h-5 w-5', mode === 'lan' ? 'text-violet-300' : 'text-white/50')} />
          </div>
          <p className={cn('text-sm font-semibold', mode === 'lan' ? 'text-violet-200' : 'text-white/70')}>
            LAN / Local
          </p>
          <p className="mt-0.5 text-xs text-white/40">Up to 1 GB</p>
          <p className="text-xs text-white/30">Direct P2P</p>
          {mode === 'lan' && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-violet-400 shadow-sm shadow-violet-400" />
          )}
        </button>

        {/* External Mode */}
        <button
          id="mode-external"
          onClick={() => onChange('external')}
          className={cn(
            'group relative rounded-xl border p-4 text-left transition-all duration-200',
            mode === 'external'
              ? 'border-cyan-500/50 bg-cyan-500/15 shadow-lg shadow-cyan-500/10'
              : 'border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/5'
          )}
        >
          <div className={cn(
            'mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
            mode === 'external' ? 'bg-cyan-500/30' : 'bg-white/10 group-hover:bg-white/15'
          )}>
            <Globe className={cn('h-5 w-5', mode === 'external' ? 'text-cyan-300' : 'text-white/50')} />
          </div>
          <p className={cn('text-sm font-semibold', mode === 'external' ? 'text-cyan-200' : 'text-white/70')}>
            External
          </p>
          <p className="mt-0.5 text-xs text-white/40">Up to 50 MB</p>
          <p className="text-xs text-white/30">Via Cloud</p>
          {mode === 'external' && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400" />
          )}
        </button>
      </div>

      <p className="mt-3 text-center text-xs text-white/30">
        {mode === 'lan'
          ? '⚡ All data stays on your network — no server overhead'
          : '🔒 Encrypted upload to secure cloud storage'}
      </p>
    </div>
  )
}
