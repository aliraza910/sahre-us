'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Send, Zap, AlertTriangle, LogOut, Upload, Globe, Trash2,
  File as FileIcon, Clock, Download, Shield, RefreshCw, X, MessageSquare, Edit2, Check
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { FileDropzone } from '@/components/FileDropzone'
import { PeerList, type Peer, type SharedPeerFile } from '@/components/PeerList'
import { TransferList } from '@/components/TransferProgress'
import { ModeSelector } from '@/components/ModeSelector'
import { RoomQR } from '@/components/RoomQR'
import { SignalingService } from '@/lib/signaling'
import { WebRTCManager, type TransferProgress } from '@/lib/webrtc'
import { detectLANMode, formatBytes, downloadBlob } from '@/lib/fileUtils'
import { cn } from '@/lib/utils'

const ROOM_STORE_KEY = 'dropzap:rooms'

type RoomData = {
  id: string
  shortCode: string
  expiresAt: string
  hasPassword: boolean
  isLocalFallback?: boolean
  hostToken?: string
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

type ChatMessage = {
  senderId: string
  senderLabel: string
  text: string
  timestamp: string
}

const ANIMALS = ['Fox', 'Eagle', 'Owl', 'Deer', 'Panda', 'Koala', 'Tiger', 'Lion', 'Wolf', 'Falcon']
const ADJECTIVES = ['Swift', 'Clever', 'Bright', 'Silent', 'Bold', 'Kind', 'Noble', 'Quick', 'Wild']

function generateRandomName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const anim = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  return `${adj} ${anim}`
}

function getSavedHostToken(roomId: string): string | null {
  try {
    const store = JSON.parse(localStorage.getItem(ROOM_STORE_KEY) ?? '{}')
    return store[roomId]?.hostToken ?? null
  } catch { return null }
}

function saveRoomTokenLocally(roomId: string, data: RoomData) {
  try {
    const store = JSON.parse(localStorage.getItem(ROOM_STORE_KEY) ?? '{}')
    store[roomId] = {
      ...store[roomId],
      ...data
    }
    localStorage.setItem(ROOM_STORE_KEY, JSON.stringify(store))
  } catch {}
}

function clearRoomLocally(roomId: string) {
  try {
    const store = JSON.parse(localStorage.getItem(ROOM_STORE_KEY) ?? '{}')
    delete store[roomId]
    localStorage.setItem(ROOM_STORE_KEY, JSON.stringify(store))
  } catch {}
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

  // Room & Password challenge states
  const [room, setRoom] = useState<RoomData | null>(null)
  const [roomError, setRoomError] = useState<string | null>(null)
  const [isExpired, setIsExpired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [passwordRequired, setPasswordRequired] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState('')

  // Member Identity
  const [username, setUsername] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)
  const [tempName, setTempName] = useState('')

  // Host Identity
  const [isHost, setIsHost] = useState(false)
  const [hostPeerId, setHostPeerId] = useState<string | null>(null)
  const [deletingRoom, setDeletingRoom] = useState(false)

  // Peer & WebRTC File States
  const [peers, setPeers] = useState<Peer[]>([])
  const [peerFiles, setPeerFiles] = useState<Record<string, SharedPeerFile[]>>({})
  const [transfers, setTransfers] = useState<TransferProgress[]>([])

  // Cloud Shares
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [deletingShareId, setDeletingShareId] = useState<string | null>(null)

  // P2P/Signaling services
  const localPeerId = useRef(crypto.randomUUID())
  const signalingRef = useRef<SignalingService | null>(null)
  const webrtcRef = useRef<WebRTCManager | null>(null)

  // Chat Room States
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [typingPeers, setTypingPeers] = useState<Record<string, { label: string; timestamp: number }>>({})
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // General Drop UI States
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [mode, setMode] = useState<'lan' | 'external'>('lan')
  const [detecting, setDetecting] = useState(true)
  const [autoDetected, setAutoDetected] = useState(false)
  const [uploadingExternal, setUploadingExternal] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [externalShareLink, setExternalShareLink] = useState<string | null>(null)

  // Set up User Profile Name
  useEffect(() => {
    if (typeof window !== 'undefined') {
      let saved = localStorage.getItem('dropzap:username')
      if (!saved) {
        saved = generateRandomName()
        localStorage.setItem('dropzap:username', saved)
      }
      setUsername(saved)
      setTempName(saved)
    }
  }, [])

  // ── Fetch room details (with optional password challenge) ───────
  const fetchRoom = useCallback((pwd?: string) => {
    setLoading(true)
    setPasswordError('')
    const url = `/api/rooms/${roomId}${pwd ? `?password=${encodeURIComponent(pwd)}` : ''}`

    fetch(url)
      .then(async (res) => {
        const data = await res.json()
        if (res.status === 401 && data.requiresPassword) {
          setPasswordRequired(true)
          setLoading(false)
          return
        }
        if (res.status === 410 || data.expired) {
          setIsExpired(true)
          setLoading(false)
          return
        }
        if (!res.ok) {
          if (pwd) {
            setPasswordError(data.error ?? 'Invalid password')
          } else {
            setRoomError(data.error ?? 'Failed to load room')
          }
          setLoading(false)
          return
        }

        // Room successfully loaded
        setRoom(data)
        setPasswordRequired(false)

        // Check if we are the host of this room
        const savedToken = getSavedHostToken(roomId)
        if (savedToken) {
          setIsHost(true)
          setHostPeerId(localPeerId.current)
        }
        saveRoomTokenLocally(roomId, data)
        setLoading(false)
      })
      .catch((err) => {
        setRoomError('Network connection issue')
        setLoading(false)
      })
  }, [roomId])

  useEffect(() => {
    fetchRoom()
  }, [fetchRoom])

  // ── Fetch shared files list ──────────────────────────────────────
  const fetchSharedFiles = useCallback(() => {
    if (!room) return
    setFilesLoading(true)
    fetch(`/api/rooms/${roomId}/shares`)
      .then((r) => r.json())
      .then((data) => setSharedFiles(data.shares ?? []))
      .catch(() => {})
      .finally(() => setFilesLoading(false))
  }, [room, roomId])

  useEffect(() => {
    if (room) fetchSharedFiles()
  }, [room, fetchSharedFiles])

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
    if (!room || !username) return

    const signaling = new SignalingService()
    const webrtc = new WebRTCManager(localPeerId.current, signaling)
    signalingRef.current = signaling
    webrtcRef.current = webrtc

    // Setup receive handling
    webrtc.onFileReceived = (name, blob, senderId) => {
      toast.info(`New file from ${senderId.slice(0, 6)}: ${name} (Download manually below)`)
      setPeerFiles((prev) => {
        const list = prev[senderId] ?? []
        return {
          ...prev,
          [senderId]: [...list, { id: crypto.randomUUID(), fileName: name, fileSize: blob.size, blob }],
        }
      })
    }

    webrtc.onProgress = (progress) => {
      setTransfers((prev) => {
        const key = `${progress.peerId}-${progress.fileName}-${progress.direction}`
        const idx = prev.findIndex((t) => `${t.peerId}-${t.fileName}-${t.direction}` === key)
        if (idx >= 0) {
          const u = [...prev]
          u[idx] = progress
          return u
        }
        return [...prev, progress]
      })
    }

    webrtc.onPeerJoin = (peerId) => {
      // Exchange current host status & names
      signaling.send({
        type: 'ping',
        from: localPeerId.current,
        to: peerId,
        data: {
          label: username,
          isHost: getSavedHostToken(roomId) !== null,
        },
      })
    }

    webrtc.onPeerLeave = (peerId) => {
      setPeers((prev) => prev.filter((p) => p.id !== peerId))
      setTypingPeers((prev) => {
        const next = { ...prev }
        delete next[peerId]
        return next
      })
    }

    // Register signaling event listeners
    const unsubPing = signaling.on('ping', ({ from, data }) => {
      const pingData = data as { label: string; isHost?: boolean }
      setPeers((prev) => {
        const exists = prev.find((p) => p.id === from)
        if (exists) {
          return prev.map((p) => p.id === from ? { ...p, label: pingData.label, status: 'connected' } : p)
        }
        return [...prev, { id: from, label: pingData.label, status: 'connected' }]
      })

      if (pingData.isHost) {
        setHostPeerId(from)
      }

      // Reply back with our info
      signaling.send({
        type: 'chat-typing', // triggers mapping updates
        from: localPeerId.current,
        to: from,
        data: { label: username, isHost: getSavedHostToken(roomId) !== null },
      })
    })

    const unsubTyping = signaling.on('chat-typing', ({ from, data }) => {
      const pingData = data as { label: string; isHost?: boolean }
      setPeers((prev) => {
        const exists = prev.find((p) => p.id === from)
        if (exists) {
          return prev.map((p) => p.id === from ? { ...p, label: pingData.label } : p)
        }
        return [...prev, { id: from, label: pingData.label, status: 'connected' }]
      })

      if (pingData.isHost) {
        setHostPeerId(from)
      }
    })

    // Listen to host Kick command
    const unsubKick = signaling.on('kick', ({ to }) => {
      if (to === localPeerId.current) {
        toast.error('You have been kicked from this room by the host')
        router.push('/')
      }
    })

    // Group Chat Messages
    const unsubChat = signaling.on('chat-msg', ({ from, data }) => {
      const msg = data as ChatMessage
      setChatMessages((prev) => [...prev, msg])
    })

    // Typing Indicators
    const unsubTypingStatus = signaling.on('chat-typing', ({ from, data }) => {
      const typingData = data as { isTyping?: boolean; label: string }
      if (typingData.isTyping !== undefined) {
        setTypingPeers((prev) => {
          const next = { ...prev }
          if (typingData.isTyping) {
            next[from] = { label: typingData.label, timestamp: Date.now() }
          } else {
            delete next[from]
          }
          return next
        })
      }
    })

    // Connect to room channel
    signaling.join(roomId, localPeerId.current)

    return () => {
      unsubPing()
      unsubKick()
      unsubChat()
      unsubTyping()
      unsubTypingStatus()
      webrtc.destroy()
      signaling.leave()
    }
  }, [room, roomId, username, router])

  // Periodic cleanup of typing indicators
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now()
      setTypingPeers((prev) => {
        let changed = false
        const next = { ...prev }
        for (const [id, value] of Object.entries(prev)) {
          if (now - value.timestamp > 3000) {
            delete next[id]
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

  // Scroll Chat to bottom
  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // ── Send message in chat ──────────────────────────────────────────
  const sendChatMessage = () => {
    if (!chatInput.trim() || !signalingRef.current) return
    const msg: ChatMessage = {
      senderId: localPeerId.current,
      senderLabel: username,
      text: chatInput.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    // Broadcast message
    signalingRef.current.send({
      type: 'chat-msg',
      from: localPeerId.current,
      data: msg,
    })
    // Add locally immediately
    setChatMessages((prev) => [...prev, msg])
    setChatInput('')

    // Cancel typing status
    signalingRef.current.send({
      type: 'chat-typing',
      from: localPeerId.current,
      data: { isTyping: false, label: username },
    })
  }

  // Handle Typing indicator notifications
  const handleChatInputChange = (val: string) => {
    setChatInput(val)
    if (!signalingRef.current) return

    signalingRef.current.send({
      type: 'chat-typing',
      from: localPeerId.current,
      data: { isTyping: val.length > 0, label: username },
    })
  }

  // ── Kick a peer (Host only) ──────────────────────────────────────
  const handleKickPeer = (peerId: string) => {
    if (!isHost || !signalingRef.current) return
    if (confirm(`Are you sure you want to kick this member?`)) {
      signalingRef.current.send({
        type: 'kick',
        from: localPeerId.current,
        to: peerId,
        data: {},
      })
      toast.success('Kick command sent')
    }
  }

  // ── Send file over WebRTC LAN ────────────────────────────────────
  const sendLAN = useCallback(async () => {
    if (!selectedFile || !webrtcRef.current) return
    const activePeers = peers.filter((p) => p.status === 'connected')
    if (activePeers.length === 0) {
      toast.error('No connected members to send to')
      return
    }
    setSending(true)
    try {
      await webrtcRef.current.sendFileToAll(selectedFile)
      // Save locally under our own sender section so we see it listed
      setPeerFiles((prev) => {
        const list = prev[localPeerId.current] ?? []
        return {
          ...prev,
          [localPeerId.current]: [...list, { id: crypto.randomUUID(), fileName: selectedFile.name, fileSize: selectedFile.size, blob: selectedFile }],
        }
      })
      toast.success('File sent successfully!')
      setSelectedFile(null)
    } catch (err: unknown) {
      toast.error('Transfer failed')
    } finally {
      setSending(false)
    }
  }, [selectedFile, peers])

  // ── Upload external cloud share link ─────────────────────────────
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
      const data = await urlRes.json()
      if (!urlRes.ok) throw new Error(data.error)

      // 2. Upload with XHR
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => (xhr.status < 400 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)))
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.open('PUT', data.uploadUrl)
        xhr.setRequestHeader('Content-Type', selectedFile.type || 'application/octet-stream')
        xhr.send(selectedFile)
      })

      setUploadProgress(100)

      // 3. Create share record
      const shareRes = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          storagePath: data.storagePath,
          roomId: room?.id,
          isLocalFallback: data.isLocalFallback,
        }),
      })
      const shareData = await shareRes.json()
      if (!shareRes.ok) throw new Error(shareData.error)

      const link = shareData.isLocalFallback
        ? `${window.location.origin}/api/shares/upload?path=${encodeURIComponent(shareData.storagePath)}`
        : `${window.location.origin}/s/${shareData.shareId}`

      setExternalShareLink(link)
      await navigator.clipboard.writeText(link).catch(() => {})
      toast.success('Share link copied to clipboard!')
      setSelectedFile(null)
      fetchSharedFiles()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingExternal(false)
    }
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
    } finally {
      setDeletingShareId(null)
    }
  }, [roomId])

  // ── Delete room ──────────────────────────────────────────────────
  const deleteRoom = useCallback(async () => {
    if (!confirm('Delete this room and all its shares? This cannot be undone.')) return
    setDeletingRoom(true)
    try {
      const token = getSavedHostToken(roomId)
      await fetch(`/api/rooms/${roomId}`, {
        method: 'DELETE',
        headers: token ? { 'x-host-token': token } : {},
      })
      clearRoomLocally(roomId)
      toast.success('Room deleted')
      router.push('/')
    } catch {
      toast.error('Failed to delete room')
      setDeletingRoom(false)
    }
  }, [roomId, router])

  // Save customized display name
  const saveNameChange = () => {
    const trimmed = tempName.trim()
    if (!trimmed) return
    setUsername(trimmed)
    localStorage.setItem('dropzap:username', trimmed)
    setIsEditingName(false)
    toast.success(`Display name updated to: ${trimmed}`)
    // Announce name change to room members
    if (signalingRef.current) {
      signalingRef.current.send({
        type: 'chat-typing',
        from: localPeerId.current,
        data: { label: trimmed, isHost },
      })
    }
  }

  // ── Render loading, expired, password pages ──────────────────────
  if (loading && !room && !passwordRequired && !isExpired) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-mesh">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <p className="text-white/50">Loading room…</p>
        </div>
      </div>
    )
  }

  if (isExpired) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-mesh px-6">
        <div className="text-center max-w-md bg-white/5 p-8 rounded-2xl border border-white/10 backdrop-blur-md">
          <Clock className="mx-auto mb-4 h-14 w-14 text-amber-500" />
          <h2 className="mb-2 text-2xl font-bold text-white">Room Has Expired</h2>
          <p className="mb-6 text-white/50 text-sm">
            Rooms expire automatically after 60 minutes to ensure privacy and clear server resources.
          </p>
          <Button onClick={() => router.push('/')} className="w-full bg-violet-600 hover:bg-violet-500">
            Create a New Room
          </Button>
        </div>
      </div>
    )
  }

  if (passwordRequired) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-mesh px-6">
        <div className="w-full max-w-md bg-[#12121f] p-8 rounded-2xl border border-white/10 shadow-2xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Shield className="h-6 w-6 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Room is Locked</h2>
            <p className="text-sm text-white/40 mt-1">Please enter the password to gain access</p>
          </div>
          <div className="space-y-4">
            <Input
              type="password"
              placeholder="Room Password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchRoom(passwordInput)}
              className="border-white/10 bg-white/5 text-white placeholder:text-white/20 focus:border-violet-500"
            />
            {passwordError && (
              <p className="text-xs text-red-400 font-semibold">{passwordError}</p>
            )}
            <Button
              className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold"
              onClick={() => fetchRoom(passwordInput)}
            >
              Verify & Enter
            </Button>
          </div>
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

  const activeMembers = peers.filter((p) => p.status === 'connected')
  const expiryText = timeLeft(room.expiresAt)

  // Formatting typing notice
  const getTypingText = () => {
    const list = Object.values(typingPeers).map((tp) => tp.label)
    if (list.length === 0) return ''
    if (list.length === 1) return `${list[0]} is typing...`
    if (list.length === 2) return `${list[0]} and ${list[1]} are typing...`
    return 'Multiple members are typing...'
  }

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
              <Badge variant="outline" className="border-white/10 text-white/40 text-xs">
                {activeMembers.length + 1} Member(s)
              </Badge>
              {room.isLocalFallback && (
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs">
                  Local Mode
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-white/40">
              <span>Code: <span className="font-mono text-violet-400 font-semibold">{room.shortCode}</span></span>
              <span>·</span>
              <Clock className="h-3.5 w-3.5" />
              <span>{expiryText}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isHost && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/15 hover:border-red-500/40"
                onClick={deleteRoom}
                disabled={deletingRoom}
              >
                {deletingRoom ? (
                  <><div className="h-3.5 w-3.5 animate-spin rounded-full border border-red-400 border-t-transparent" /> Deleting…</>
                ) : (
                  <><Trash2 className="h-3.5 w-3.5" /> Delete Room</>
                )}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              onClick={() => router.push('/')}
            >
              <LogOut className="h-4 w-4" /> Leave
            </Button>
          </div>
        </div>

        {/* ── Main Layout Grid ───────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">

          {/* Left Column (Files and Transfers) */}
          <div className="space-y-6">
            {/* Mode selection */}
            <ModeSelector mode={mode} onChange={setMode} autoDetected={autoDetected} detecting={detecting} />

            {/* Drop Zone Box */}
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
                      className="w-full h-12 gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold shadow-lg shadow-violet-500/20"
                      onClick={sendLAN}
                      disabled={sending || activeMembers.length === 0}
                    >
                      {sending ? (
                        <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Sending…</>
                      ) : (
                        <><Send className="h-5 w-5" /> Send to {activeMembers.length} Peer{activeMembers.length !== 1 ? 's' : ''}</>
                      )}
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
                        className="w-full h-12 gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
                        onClick={sendExternal}
                        disabled={uploadingExternal}
                      >
                        {uploadingExternal ? (
                          <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Uploading…</>
                        ) : (
                          <><Upload className="h-5 w-5" /> Generate Share Link</>
                        )}
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
                  {mode === 'lan' && activeMembers.length === 0 && (
                    <p className="mt-2 text-center text-xs text-amber-400">⚠ Waiting for peers to join before sending</p>
                  )}
                </div>
              )}
            </div>

            {/* Active Transfer lists */}
            <TransferList transfers={transfers} />

            {/* Cloud Shares History */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Globe className="h-4 w-4 text-cyan-400" />
                  Cloud Shares History
                  {sharedFiles.length > 0 && (
                    <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 text-xs ml-1">
                      {sharedFiles.length}
                    </Badge>
                  )}
                </h2>
                <Button
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
                <div className="flex flex-col items-center gap-2 py-8 text-center text-white/30">
                  <Globe className="h-8 w-8 text-white/10" />
                  <p className="text-sm">No external shares generated yet</p>
                  <p className="text-xs text-white/20">Generate secure URLs valid for 24 hours</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sharedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="group flex items-center gap-3 rounded-xl border border-white/8 bg-white/5 p-3 hover:border-white/15 hover:bg-white/8"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                        <FileIcon className="h-4 w-4 text-cyan-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{file.fileName}</p>
                        <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5">
                          <span>{formatBytes(file.fileSize)}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1"><Download className="h-3 w-3" />{file.downloadCount}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeLeft(file.expiresAt)}</span>
                          {file.hasPassword && <><Shield className="h-3 w-3 text-amber-400" /></>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-white/40 hover:text-cyan-400"
                          onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/s/${file.id}`); toast.success('Link copied!') }}
                        >
                          <Globe className="h-3.5 w-3.5" />
                        </Button>
                        {isHost && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-white/40 hover:text-red-400"
                            onClick={() => deleteShare(file.id)}
                            disabled={deletingShareId === file.id}
                          >
                            {deletingShareId === file.id ? (
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border border-red-400 border-t-transparent" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column (Members & Chat Room) */}
          <div className="space-y-6">

            {/* Profile Identity Editor */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40 font-semibold uppercase tracking-wider">Your Member Tag</span>
                {!isEditingName ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 text-xs"
                    onClick={() => setIsEditingName(true)}
                  >
                    <Edit2 className="h-3 w-3" /> Rename
                  </Button>
                ) : (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                      onClick={saveNameChange}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => { setTempName(username); setIsEditingName(false) }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {!isEditingName ? (
                <p className="mt-2 text-lg font-bold text-white font-sans">{username}</p>
              ) : (
                <Input
                  className="mt-2 h-9 border-white/20 bg-white/5 text-white text-sm focus:border-violet-500 focus:ring-0"
                  value={tempName}
                  maxLength={15}
                  onChange={(e) => setTempName(e.target.value.replace(/[^a-zA-Z0-9 ]/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && saveNameChange()}
                />
              )}
            </div>

            {/* Members section */}
            <PeerList
              peers={[{ id: localPeerId.current, label: username + ' (You)', status: 'connected' }, ...peers]}
              localPeerId={localPeerId.current}
              hostPeerId={hostPeerId}
              isHostUser={isHost}
              onKickPeer={handleKickPeer}
              peerFiles={peerFiles}
              onDownloadFile={(file) => downloadBlob(file.blob, file.fileName)}
            />

            {/* Group Chat Room */}
            <div className="rounded-2xl border border-white/10 bg-white/5 flex flex-col h-[380px] backdrop-blur-sm">
              <div className="p-3 border-b border-white/10 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-violet-400" />
                <span className="text-sm font-semibold text-white/90">Group Chat</span>
              </div>

              {/* Messages Pane */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-white/20 text-xs gap-1.5">
                    <MessageSquare className="h-6 w-6 text-white/10" />
                    <p>Start a conversation with members</p>
                  </div>
                ) : (
                  chatMessages.map((msg, i) => {
                    const isSelf = msg.senderId === localPeerId.current
                    return (
                      <div key={i} className={cn('flex flex-col max-w-[85%]', isSelf ? 'ml-auto items-end' : 'mr-auto items-start')}>
                        <span className="text-[10px] text-white/40 mb-0.5">{msg.senderLabel}</span>
                        <div className={cn(
                          'p-2.5 rounded-2xl text-xs leading-relaxed font-medium',
                          isSelf
                            ? 'bg-violet-600 text-white rounded-tr-none'
                            : 'bg-white/8 text-white rounded-tl-none border border-white/5'
                        )}>
                          {msg.text}
                        </div>
                        <span className="text-[9px] text-white/30 mt-0.5">{msg.timestamp}</span>
                      </div>
                    )
                  })
                )}
                <div ref={chatScrollRef} />
              </div>

              {/* Typing indicator */}
              {getTypingText() && (
                <p className="px-3 py-1 text-[10px] text-violet-300/80 italic animate-pulse">{getTypingText()}</p>
              )}

              {/* Chat Input */}
              <div className="p-2 border-t border-white/10 flex gap-1.5 items-center">
                <Input
                  className="h-9 border-white/15 bg-white/5 text-xs text-white placeholder:text-white/20 focus:border-violet-500"
                  placeholder="Send a message..."
                  value={chatInput}
                  onChange={(e) => handleChatInputChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                />
                <Button
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-500 h-9 px-3 shrink-0"
                  onClick={sendChatMessage}
                >
                  <Send className="h-3.5 w-3.5 text-white" />
                </Button>
              </div>
            </div>

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
