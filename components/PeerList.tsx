'use client'

import { cn } from '@/lib/utils'
import { User, Wifi, WifiOff, Loader2, Trash2, FileIcon, Download } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/fileUtils'

export type PeerStatus = 'connecting' | 'connected' | 'disconnected'

export type Peer = {
  id: string
  label?: string
  status: PeerStatus
  joinedAt?: Date
}

export type SharedPeerFile = {
  id: string
  fileName: string
  fileSize: number
  blob: Blob
}

interface PeerListProps {
  peers: Peer[]
  localPeerId: string
  hostPeerId?: string | null
  isHostUser: boolean
  onKickPeer?: (peerId: string) => void
  peerFiles?: Record<string, SharedPeerFile[]>
  onDownloadFile?: (file: SharedPeerFile) => void
}

function PeerAvatar({ label, status, isHost }: { label: string; status: PeerStatus; isHost: boolean }) {
  const initials = label.slice(0, 2).toUpperCase()
  return (
    <div className="relative">
      <div className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-all',
        isHost ? 'bg-violet-600/40 text-violet-200 border border-violet-500/30' :
        status === 'connected' ? 'bg-zinc-700/50 text-zinc-300' :
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

export function PeerList({
  peers,
  localPeerId,
  hostPeerId,
  isHostUser,
  onKickPeer,
  peerFiles = {},
  onDownloadFile,
}: PeerListProps) {
  const remotePeers = peers.filter((p) => p.id !== localPeerId)

  // A peer is the host if their peerId matches hostPeerId
  const getIsHost = (peerId: string) => {
    if (!hostPeerId) return false
    return peerId === hostPeerId
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/70">Room Members</h3>
        <Badge variant="outline" className="border-white/20 bg-white/5 text-xs text-white/50">
          {remotePeers.filter((p) => p.status === 'connected').length + 1} Member(s)
        </Badge>
      </div>

      {/* Local peer (You) */}
      <div className="mb-4 flex flex-col gap-2 rounded-xl bg-violet-500/10 px-3 py-3 border border-violet-500/20">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600/50 text-sm font-bold text-violet-200">
              <User className="h-5 w-5" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-[#0d0d1a]" />
          </div>
          <div>
            <p className="text-sm font-medium text-white flex items-center gap-1.5">
              You
              {isHostUser && (
                <Badge className="bg-violet-600 hover:bg-violet-600 text-white border-0 text-[10px] px-1.5 py-0">Host</Badge>
              )}
            </p>
            <p className="font-mono text-xs text-white/40">{localPeerId.slice(0, 12)}…</p>
          </div>
        </div>

        {/* Files shared by You */}
        {peerFiles[localPeerId] && peerFiles[localPeerId].length > 0 && (
          <div className="mt-2 pl-2 border-l-2 border-violet-500/30 space-y-1.5">
            <p className="text-[11px] font-semibold text-violet-300">Your Shared Files:</p>
            {peerFiles[localPeerId].map((file) => (
              <div key={file.id} className="flex items-center justify-between text-xs text-white/70 bg-white/5 p-1.5 rounded border border-white/5">
                <span className="truncate max-w-[180px] flex items-center gap-1"><FileIcon className="h-3 w-3 shrink-0" /> {file.fileName}</span>
                <span className="text-[10px] text-white/40 shrink-0">{formatBytes(file.fileSize)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Remote peers list */}
      {remotePeers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-white/30 text-center">
          <WifiOff className="h-8 w-8" />
          <p className="text-sm">Waiting for peers to join…</p>
          <p className="text-xs text-white/20">Share the 6-digit room code with others</p>
        </div>
      ) : (
        <div className="space-y-3">
          {remotePeers.map((peer) => {
            const isPeerHost = getIsHost(peer.id)
            const files = peerFiles[peer.id] ?? []

            return (
              <div
                key={peer.id}
                className={cn(
                  'flex flex-col gap-2 rounded-xl p-3 border transition-all duration-300 bg-white/5',
                  peer.status === 'connected' ? 'border-white/10' : 'border-transparent opacity-60'
                )}
              >
                <div className="flex items-center gap-3">
                  <PeerAvatar
                    label={peer.label ?? peer.id.slice(0, 2)}
                    status={peer.status}
                    isHost={isPeerHost}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white flex items-center gap-1.5">
                      {peer.label ?? `Peer ${peer.id.slice(0, 6)}`}
                      {isPeerHost && (
                        <Badge className="bg-violet-600 hover:bg-violet-600 text-white border-0 text-[10px] px-1.5 py-0">Host</Badge>
                      )}
                    </p>
                    <p className="font-mono text-xs text-white/40">{peer.id.slice(0, 12)}…</p>
                  </div>

                  {/* Actions (Kick button only for Host User to kick others) */}
                  <div className="flex items-center gap-1.5">
                    {isHostUser && !isPeerHost && peer.status === 'connected' && onKickPeer && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onKickPeer(peer.id)}
                        className="h-7 w-7 p-0 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                        title="Kick member"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {peer.status === 'connecting' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                    ) : peer.status === 'connected' ? (
                      <Wifi className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-white/30" />
                    )}
                  </div>
                </div>

                {/* Peer's shared files list */}
                {files.length > 0 && (
                  <div className="mt-1 pl-2 border-l-2 border-cyan-500/40 space-y-1.5">
                    <p className="text-[11px] font-semibold text-cyan-300">Shared Files ({files.length}):</p>
                    {files.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between text-xs text-white/80 bg-white/5 hover:bg-white/10 p-1.5 rounded border border-white/5 transition-all"
                      >
                        <span className="truncate max-w-[140px] flex items-center gap-1">
                          <FileIcon className="h-3 w-3 text-cyan-400 shrink-0" />
                          {file.fileName}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-white/40">{formatBytes(file.fileSize)}</span>
                          {onDownloadFile && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded"
                              onClick={() => onDownloadFile(file)}
                              title="Download File"
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
