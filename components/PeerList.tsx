'use client'

import { cn } from '@/lib/utils'
import { User, Wifi, WifiOff, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export type PeerStatus = 'connecting' | 'connected' | 'disconnected'

export type Peer = {
  id: string
  label?: string
  status: PeerStatus
  joinedAt?: Date
}

interface PeerListProps {
  peers: Peer[]
  localPeerId: string
}

function PeerAvatar({ label, status }: { label: string; status: PeerStatus }) {
  const initials = label.slice(0, 2).toUpperCase()
  return (
    <div className="relative">
      <div className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-all',
        status === 'connected' ? 'bg-violet-500/30 text-violet-300' :
        status === 'connecting' ? 'bg-amber-500/30 text-amber-300' :
        'bg-white/10 text-white/40'
      )}>
        {initials}
      </div>
      <span className={cn(
        'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0d0d1a]',
        status === 'connected' ? 'bg-emerald-400' :
        status === 'connecting' ? 'bg-amber-400 animate-pulse' :
        'bg-white/20'
      )} />
    </div>
  )
}

export function PeerList({ peers, localPeerId }: PeerListProps) {
  const remotePeers = peers.filter((p) => p.id !== localPeerId)

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/70">Connected Peers</h3>
        <Badge
          variant="outline"
          className="border-white/20 bg-white/5 text-xs text-white/50"
        >
          {remotePeers.filter((p) => p.status === 'connected').length} / {remotePeers.length} online
        </Badge>
      </div>

      {/* Local peer (you) */}
      <div className="mb-3 flex items-center gap-3 rounded-xl bg-violet-500/10 px-3 py-2 border border-violet-500/20">
        <div className="relative">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600/50 text-sm font-bold text-violet-200">
            <User className="h-5 w-5" />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-[#0d0d1a]" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">You</p>
          <p className="font-mono text-xs text-white/40">{localPeerId.slice(0, 12)}…</p>
        </div>
        <Badge className="ml-auto bg-violet-500/30 text-violet-300 border-violet-500/30 text-xs">
          Host
        </Badge>
      </div>

      {/* Remote peers */}
      {remotePeers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-white/30">
          <WifiOff className="h-8 w-8" />
          <p className="text-sm">Waiting for peers to join…</p>
          <p className="text-xs text-white/20">Share the room link or code</p>
        </div>
      ) : (
        <div className="space-y-2">
          {remotePeers.map((peer) => (
            <div
              key={peer.id}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2 transition-all duration-300',
                peer.status === 'connected'
                  ? 'bg-white/5 hover:bg-white/8'
                  : 'bg-white/3 opacity-60'
              )}
            >
              <PeerAvatar
                label={peer.label ?? peer.id.slice(0, 2)}
                status={peer.status}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">
                  {peer.label ?? `Peer ${peer.id.slice(0, 6)}`}
                </p>
                <p className="font-mono text-xs text-white/40">{peer.id.slice(0, 12)}…</p>
              </div>
              <div className="flex items-center gap-1.5">
                {peer.status === 'connecting' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                    <span className="text-xs text-amber-400">Connecting</span>
                  </>
                ) : peer.status === 'connected' ? (
                  <>
                    <Wifi className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs text-emerald-400">Connected</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-4 w-4 text-white/30" />
                    <span className="text-xs text-white/30">Offline</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
