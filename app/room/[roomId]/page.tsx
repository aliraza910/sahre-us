'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Send, Zap, AlertTriangle, LogOut, Upload, Globe, Trash2,
  File as FileIcon, Clock, Download, Shield, RefreshCw, X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { FileDropzone } from '@/components/FileDropzone'
import { PeerList, type Peer } from '@/components/PeerList'
import { TransferList } from '@/components/TransferProgress'
import { ModeSelector } from '@/components/ModeSelector'
import { RoomQR } from '@/components/RoomQR'
import { SignalingService } from '@/lib/signaling'
import { WebRTCManager, type TransferProgress } from '@/lib/webrtc'
import { detectLANMode, formatBytes } from '@/lib/fileUtils'
import { cn } from '@/lib/utils'

function generatePeerId(): string { return crypto.randomUUID() }

const ROOM_STORE_KEY = 'dropzap:rooms'

// ── Persist room metadata locally so revisiting users keep their expiry ─────
function saveRoomLocally(roomId: string, data: RoomData) {
  try {
    const store = JSON.parse(localStorage.getItem(ROOM_STORE_KEY) ?? '{}')
    store[roomId] = data
    localStorage.setItem(ROOM_STORE_KEY, JSON.stringify(store))
  } catch {}
}

function loadRoomLocally(roomId: string): RoomData | null {
  try {
    const store = JSON.parse(localStorage.getItem(ROOM_STORE_KEY) ?? '{}')
    const entry: RoomData | undefined = store[roomId]
    if (!entry) return null
    // Expired?
    if (new Date(entry.expiresAt) < new Date()) {
      delete store[roomId]
      localStorage.setItem(ROOM_STORE_KEY, JSON.stringify(store))
      return null
    }
    return entry
  } catch { return null }
}

function clearRoomLocally(roomId: string) {
  try {
    const store = JSON.parse(localStorage.getItem(ROOM_STORE_KEY) ?? '{}')
    delete store[roomId]
    localStorage.setItem(ROOM_STORE_KEY, JSON.stringify(store))
  } catch {}
}

type RoomData = {
  id: string
  shortCode: string
  expiresAt: string
  hasPassword: boolean
  isLocalFallback?: boolean
}

type SharedFile = {
  id: string
  fileName: string
  fileSize: number
  expiresAt: string
  downloadCount: number
  createdAt: string
  hasPassword: boolean
}

function timeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const m = Math.floor(ms / 60_000)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m left`
  return `${m}m left`
}

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const router = useRouter()

  const [room, setRoom] = useState<RoomData | null>(null)
  const [roomError, setRoomError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isHost, setIsHost] = useState(false)
  const [deletingRoom, setDeletingRoom] = useState(false)

  // Shared files
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [deletingShareId, setDeletingShareId] = useState<string | null>(null)

  // P2P state
  const localPeerId = useRef(generatePeerId())
  const signalingRef = useRef<SignalingService | null>(null)
  const webrtcRef = useRef<WebRTCManager | null>(null)

  // UI state
  const [peers, setPeers] = useState<Peer[]>([])
  const [transfers, setTransfers] = useState<TransferProgress[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [mode, setMode] = useState<'lan' | 'external'>('lan')
  const [detecting, setDetecting] = useState(true)
  const [autoDetected, setAutoDetected] = useState(false)
  const [uploadingExternal, setUploadingExternal] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [externalShareLink, setExternalShareLink] = useState<string | null>(null)

  // ── Fetch room (with localStorage cache) ────────────────────────
  useEffect(() => {
    const cached = loadRoomLocally(roomId)
    if (cached) {
      setRoom(cached)
      setLoading(false)
    }

    fetch(`/api/rooms/${roomId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          if (!cached) setRoomError(data.error)
          return
        }
        setRoom(data)
        saveRoomLocally(roomId, data)
        // Mark as host if this was a fresh load (not cached)
        if (!cached) setIsHost(true)
      })
      .catch(() => { if (!cached) setRoomError('Failed to load room') })
      .finally(() => setLoading(false))
  }, [roomId])

  // ── Fetch shared files ───────────────────────────────────────────
  const fetchSharedFiles = useCallback(() => {
    setFilesLoading(true)
    fetch(`/api/rooms/${roomId}/shares`)
      .then((r) => r.json())
      .then((data) => setSharedFiles(data.shares ?? []))
      .catch(() => {})
      .finally(() => setFilesLoading(false))
  }, [roomId])

  useEffect(() => { if (room) fetchSharedFiles() }, [room, fetchSharedFiles])

  // ── LAN auto-detect ──────────────────────────────────────────────
  useEffect(() => {
    detectLANMode().then((isLAN) => {
      setMode(isLAN ? 'lan' : 'external')
      setAutoDetected(true)
      setDetecting(false)
    })
  }, [])

  // ── Setup signaling + WebRTC ─────────────────────────────────────
  useEffect(() => {
    if (!room) return
    const signaling = new SignalingService()
    const webrtc = new WebRTCManager(localPeerId.current, signaling)
    signalingRef.current = signaling
    webrtcRef.current = webrtc

    webrtc.onProgress = (progress) => {
      setTransfers((prev) => {
        const key = `${progress.peerId}-${progress.fileName}-${progress.direction}`
        const idx = prev.findIndex((t) => `${t.peerId}-${t.fileName}-${t.direction}` === key)
        if (idx >= 0) { const u = [...prev]; u[idx] = progress; return u }
        return [...prev, progress]
      })
    }
    webrtc.onPeerJoin = (peerId) => {
      setPeers((prev) => {
        if (prev.find((p) => p.id === peerId)) return prev
        return [...prev, { id: peerId, status: 'connecting', joinedAt: new Date() }]
      })
      toast.success(`Peer joined: ${peerId.slice(0, 8)}…`)
      setTimeout(() => {
        setPeers((prev) => prev.map((p) => p.id === peerId ? { ...p, status: 'connected' } : p))
      }, 1500)
    }
    webrtc.onPeerLeave = (peerId) => {
      setPeers((prev) => prev.filter((p) => p.id !== peerId))
      toast.info(`Peer disconnected: ${peerId.slice(0, 8)}…`)
    }
    webrtc.onFileReceived = (name, blob) => {
      toast.success(`Received: ${name}`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = name
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    }
    signaling.join(roomId, localPeerId.current)
    return () => { webrtc.destroy(); signaling.leave() }
  }, [room, roomId])

  // ── Send via LAN ─────────────────────────────────────────────────
  const sendLAN = useCallback(async () => {
    if (!selectedFile || !webrtcRef.current) return
    if (peers.filter((p) => p.status === 'connected').length === 0) {
      toast.error('No connected peers to send to'); return
    }
    setSending(true)
    try {
      await webrtcRef.current.sendFileToAll(selectedFile)
      toast.success('File sent to all peers!')
    } catch (err: unknown) {
      toast.error('Transfer failed'); console.error(err)
    } finally { setSending(false) }
  }, [selectedFile, peers])

  // ── Upload external share ────────────────────────────────────────
  const sendExternal = useCallback(async () => {
    if (!selectedFile) return
    setUploadingExternal(true)
    setUploadProgress(0)
    setExternalShareLink(null)
    try {
      // 1. Get signed upload URL
      const urlRes = await fetch(
        `/api/shares?fileName=${encodeURIComponent(selectedFile.name)}&fileSize=${selectedFile.size}`
      )
      const { uploadUrl, storagePath, error: urlErr } = await urlRes.json()
      if (urlErr) throw new Error(urlErr)

      // 2. Upload with XHR for progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => (xhr.status < 400 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)))
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', selectedFile.type || 'application/octet-stream')
        xhr.send(selectedFile)
      })

      setUploadProgress(100)

      // 3. Create share record
      const shareRes = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: selectedFile.name, fileSize: selectedFile.size, storagePath, roomId: room?.id }),
      })
      const { shareId, error: shareErr } = await shareRes.json()
      if (shareErr) throw new Error(shareErr)

      const link = `${window.location.origin}/s/${shareId}`
      setExternalShareLink(link)
      await navigator.clipboard.writeText(link).catch(() => {})
      toast.success('Share link copied to clipboard!')
      fetchSharedFiles() // refresh the list
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally { setUploadingExternal(false) }
  }, [selectedFile, room, fetchSharedFiles])

  // ── Delete share ─────────────────────────────────────────────────
  const deleteShare = useCallback(async (shareId: string) => {
    setDeletingShareId(shareId)
    try {
      await fetch(`/api/rooms/${roomId}/shares?shareId=${shareId}`, { method: 'DELETE' })
      setSharedFiles((prev) => prev.filter((s) => s.id !== shareId))
      toast.success('Share deleted')
    } catch {
      toast.error('Failed to delete share')
    } finally { setDeletingShareId(null) }
  }, [roomId])

  // ── Delete room ──────────────────────────────────────────────────
  const deleteRoom = useCallback(async () => {
    if (!confirm('Delete this room and all its shares? This cannot be undone.')) return
    setDeletingRoom(true)
    try {
      await fetch(`/api/rooms/${roomId}`, { method: 'DELETE' })
      clearRoomLocally(roomId)
      toast.success('Room deleted')
      router.push('/')
    } catch {
      toast.error('Failed to delete room')
      setDeletingRoom(false)
    }
  }, [roomId, router])

  // ── Render states ────────────────────────────────────────────────
  if (loading && !room) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-mesh">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <p className="text-white/50">Loading room…</p>
        </div>
      </div>
    )
  }

  if (roomError || !room) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-mesh px-6">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-400" />
          <h2 className="mb-2 text-2xl font-bold text-white">Room Not Found</h2>
          <p className="mb-6 text-white/50">{roomError ?? 'This room may have expired or never existed.'}</p>
          <Button onClick={() => router.push('/')} className="bg-violet-600 hover:bg-violet-500">Go Home</Button>
        </div>
      </div>
    )
  }

  const connectedCount = peers.filter((p) => p.status === 'connected').length
  const expiry = timeLeft(room.expiresAt)

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-mesh bg-grid">
      <div className="pointer-events-none fixed -top-20 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-violet-600/8 blur-[100px]" />

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Room {room.shortCode}</h1>
              <Badge
                variant="outline"
                className={cn('border text-xs', connectedCount > 0
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-white/10 text-white/40')}
              >
                {connectedCount > 0 ? `${connectedCount} peer${connectedCount > 1 ? 's' : ''} online` : 'Waiting…'}
              </Badge>
              {room.isLocalFallback && (
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs">
                  Local Mode
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-white/40">
              <span>Code: <span className="font-mono text-violet-400">{room.shortCode}</span></span>
              <span>·</span>
              <Clock className="h-3.5 w-3.5" />
              <span>{expiry}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {isHost && (
              <Button
                id="delete-room-btn"
                variant="outline"
                size="sm"
                className="gap-2 border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/15 hover:border-red-500/40"
                onClick={deleteRoom}
                disabled={deletingRoom}
              >
                {deletingRoom
                  ? <><div className="h-3.5 w-3.5 animate-spin rounded-full border border-red-400 border-t-transparent" /> Deleting…</>
                  : <><Trash2 className="h-3.5 w-3.5" /> Delete Room</>}
              </Button>
            )}
            <Button
              id="leave-room"
              variant="outline"
              size="sm"
              className="gap-2 border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              onClick={() => router.push('/')}
            >
              <LogOut className="h-4 w-4" /> Leave
            </Button>
          </div>
        </div>

        {/* ── Main grid ──────────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">

          {/* Left — Transfer area */}
          <div className="space-y-6">
            <ModeSelector mode={mode} onChange={setMode} autoDetected={autoDetected} detecting={detecting} />

            {/* File drop */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
              <h2 className="mb-4 text-base font-semibold text-white">
                {mode === 'lan' ? '⚡ Send via LAN (P2P)' : '🔗 Share via Cloud Link'}
              </h2>
              <FileDropzone
                mode={mode}
                onFileSelect={setSelectedFile}
                selectedFile={selectedFile}
                onClear={() => { setSelectedFile(null); setExternalShareLink(null); setUploadProgress(0) }}
                disabled={sending || uploadingExternal}
              />

              {selectedFile && (
                <div className="mt-4">
                  {mode === 'lan' ? (
                    <Button
                      id="send-file-btn"
                      className="w-full h-12 gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold shadow-lg shadow-violet-500/20"
                      onClick={sendLAN}
                      disabled={sending || connectedCount === 0}
                    >
                      {sending
                        ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Sending…</>
                        : <><Send className="h-5 w-5" /> Send to {connectedCount} Peer{connectedCount !== 1 ? 's' : ''}</>}
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      {uploadingExternal && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-white/50">
                            <span>Uploading…</span><span>{uploadProgress}%</span>
                          </div>
                          <Progress value={uploadProgress} className="h-1.5 [&>div]:bg-cyan-500" />
                        </div>
                      )}
                      <Button
                        id="upload-external-btn"
                        className="w-full h-12 gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
                        onClick={sendExternal}
                        disabled={uploadingExternal}
                      >
                        {uploadingExternal
                          ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Uploading…</>
                          : <><Upload className="h-5 w-5" /> Generate Share Link</>}
                      </Button>
                      {externalShareLink && (
                        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
                          <p className="mb-1 text-xs text-cyan-400 font-medium flex items-center gap-1.5">
                            <Globe className="h-3.5 w-3.5" /> Share Link (copied!)
                          </p>
                          <p className="break-all font-mono text-xs text-white/60">{externalShareLink}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {mode === 'lan' && connectedCount === 0 && (
                    <p className="mt-2 text-center text-xs text-amber-400">⚠ Waiting for peers to join before sending</p>
                  )}
                </div>
              )}
            </div>

            {/* Active transfers */}
            <TransferList transfers={transfers} />

            {/* ── Shared files panel ──────────────────────────── */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Globe className="h-4 w-4 text-cyan-400" />
                  Shared Files
                  {sharedFiles.length > 0 && (
                    <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 text-xs ml-1">
                      {sharedFiles.length}
                    </Badge>
                  )}
                </h2>
                <Button
                  id="refresh-shares-btn"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-white/40 hover:text-white"
                  onClick={fetchSharedFiles}
                  disabled={filesLoading}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', filesLoading && 'animate-spin')} />
                </Button>
              </div>

              {filesLoading && sharedFiles.length === 0 ? (
                <div className="flex justify-center py-6">
                  <div className="h-6 w-6 animate-spin rounded-full border border-white/20 border-t-white/60" />
                </div>
              ) : sharedFiles.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Globe className="h-8 w-8 text-white/10" />
                  <p className="text-sm text-white/30">No external shares yet</p>
                  <p className="text-xs text-white/20">Switch to Cloud mode to generate a share link</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sharedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="group flex items-center gap-3 rounded-xl border border-white/8 bg-white/5 p-3 transition-all hover:border-white/15 hover:bg-white/8"
                    >
                      {/* Icon */}
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                        <FileIcon className="h-4 w-4 text-cyan-400" />
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{file.fileName}</p>
                        <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5">
                          <span>{formatBytes(file.fileSize)}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Download className="h-3 w-3" />{file.downloadCount}
                          </span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />{timeLeft(file.expiresAt)}
                          </span>
                          {file.hasPassword && (
                            <><span>·</span><Shield className="h-3 w-3 text-amber-400" /></>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-white/40 hover:text-cyan-400"
                          onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/s/${file.id}`); toast.success('Link copied!') }}
                        >
                          <Globe className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-white/40 hover:text-red-400"
                          onClick={() => deleteShare(file.id)}
                          disabled={deletingShareId === file.id}
                        >
                          {deletingShareId === file.id
                            ? <div className="h-3.5 w-3.5 animate-spin rounded-full border border-red-400 border-t-transparent" />
                            : <X className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="space-y-6">
            <PeerList
              peers={[{ id: localPeerId.current, status: 'connected' }, ...peers]}
              localPeerId={localPeerId.current}
            />
            <Separator className="bg-white/10" />
            <RoomQR
              roomUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/room/${room.id}`}
              shortCode={room.shortCode}
              expiresAt={room.expiresAt}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
