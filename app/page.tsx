'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Shield, Globe, Wifi, ArrowRight, Lock, Hash, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const FEATURES = [
  {
    icon: Zap,
    title: 'Blazing LAN Speed',
    desc: '1GB in under 10s on a good Wi-Fi. Direct WebRTC P2P — no server overhead.',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20',
  },
  {
    icon: Shield,
    title: 'Privacy First',
    desc: 'LAN transfers never touch any server. External shares are encrypted in Supabase Storage.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    icon: Globe,
    title: 'Share Anywhere',
    desc: 'Generate a secure link (up to 50 MB) for anyone on the internet. Password optional.',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/20',
  },
]

const HOW_IT_WORKS = [
  { step: '01', title: 'Create a Room', desc: 'Click "Create Room" and share the link or 6-digit code with your peers.' },
  { step: '02', title: 'Peers Join', desc: 'Others open the link. WebRTC automatically establishes a direct P2P connection.' },
  { step: '03', title: 'Drop & Transfer', desc: 'Drag your file, hit Send. Chunks fly peer-to-peer at full LAN speed with live progress.' },
]

export default function HomePage() {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [password, setPassword] = useState('')
  const [customCode, setCustomCode] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const handleDialogChange = useCallback((open: boolean) => {
    setShowCreateDialog(open)
    if (!open) { setPassword(''); setCustomCode('') }
  }, [])

  const createRoom = useCallback(async () => {
    const code = customCode.trim().toUpperCase()
    if (code && !/^[A-Z0-9]{6}$/.test(code)) {
      toast.error('Custom code must be exactly 6 letters/numbers')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password || undefined, customCode: code || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowCreateDialog(false)
      router.push(`/room/${data.roomId}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create room')
    } finally {
      setCreating(false)
    }
  }, [password, customCode, router])

  const joinRoom = useCallback(async () => {
    const code = joinCode.trim().toUpperCase()
    if (code.length < 6) {
      toast.error('Enter a valid 6-character room code')
      return
    }
    setJoining(true)
    try {
      // Lookup room by short code
      const res = await fetch(`/api/rooms/by-code/${code}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Room not found or expired')
      router.push(`/room/${data.id}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Room not found')
    } finally {
      setJoining(false)
    }
  }, [joinCode, router])

  return (
    <div className="relative min-h-screen bg-mesh bg-grid overflow-hidden">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-1/2 -right-40 h-[400px] w-[400px] rounded-full bg-cyan-600/8 blur-[100px]" />

      {/* ─── Hero ───────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-6xl px-6 pb-20 pt-24 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-300">
          <Wifi className="h-4 w-4" />
          WebRTC P2P · No signup required
        </div>

        <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight sm:text-7xl">
          Drop.{' '}
          <span className="gradient-text">Share.</span>
          {' '}Done.
        </h1>

        <p className="mx-auto mb-12 max-w-2xl text-lg text-white/60 leading-relaxed">
          Transfer files at{' '}
          <span className="text-violet-400 font-semibold">full LAN speed</span> (1 GB+) via WebRTC P2P — no server, no slowdown.
          Or generate a secure cloud link for external sharing up to{' '}
          <span className="text-cyan-400 font-semibold">50 MB</span>.
        </p>

        {/* CTAs */}
        <div id="create" className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          {/* Create Room */}
          <Dialog open={showCreateDialog} onOpenChange={handleDialogChange}>
            <DialogTrigger render={
              <Button
                id="hero-create-room"
                size="lg"
                className="h-14 gap-3 bg-violet-600 px-8 text-base font-semibold hover:bg-violet-500 shadow-xl shadow-violet-500/20 transition-all hover:shadow-violet-500/30 hover:scale-[1.02]"
              >
                <Zap className="h-5 w-5" />
                Create Room
              </Button>
            } />
            <DialogContent className="border-white/10 bg-[#12121f] text-white sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">Create a Room</DialogTitle>
              </DialogHeader>
              <div className="space-y-5 pt-2">
                {/* Custom room code */}
                <div className="space-y-2">
                  <Label htmlFor="custom-code" className="text-white/70">
                    <Hash className="mr-1.5 inline h-3.5 w-3.5" />
                    Room Code <span className="text-white/30">(optional — 6 chars)</span>
                  </Label>
                  <Input
                    id="custom-code"
                    type="text"
                    placeholder="e.g. ALPHA1 — leave blank to auto-generate"
                    value={customCode}
                    maxLength={6}
                    onChange={(e) => setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    className="border-white/10 bg-white/5 font-mono tracking-widest text-violet-300 placeholder:text-white/20 placeholder:tracking-normal focus:border-violet-500/50"
                  />
                  {customCode.length > 0 && customCode.length < 6 && (
                    <p className="text-xs text-amber-400/80">{6 - customCode.length} more character{6 - customCode.length !== 1 ? 's' : ''} needed</p>
                  )}
                  {customCode.length === 6 && (
                    <p className="text-xs text-emerald-400/80">✓ Room code looks good</p>
                  )}
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="room-password" className="text-white/70">
                    <Lock className="mr-1.5 inline h-3.5 w-3.5" />
                    Room Password <span className="text-white/30">(optional)</span>
                  </Label>
                  <Input
                    id="room-password"
                    type="password"
                    placeholder="Leave blank for open room"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createRoom()}
                    className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-violet-500/50"
                  />
                </div>

                <Button
                  id="confirm-create-room"
                  className="w-full h-12 bg-violet-600 hover:bg-violet-500 text-white font-semibold"
                  onClick={createRoom}
                  disabled={creating || (customCode.length > 0 && customCode.length < 6)}
                >
                  {creating ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…</>
                  ) : (
                    <><Zap className="mr-2 h-4 w-4" /> Create Room</>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Join Room */}
          <div className="flex flex-col items-start gap-1.5">
            <div className="flex h-14 items-center gap-2 rounded-xl border border-white/15 bg-white/5 p-2 backdrop-blur-sm">
              <div className="flex items-center gap-2 pl-2 text-white/40">
                <Hash className="h-4 w-4" />
              </div>
              <Input
                id="join-code-input"
                type="text"
                placeholder="ENTER CODE"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                onKeyDown={(e) => e.key === 'Enter' && joinCode.length === 6 && joinRoom()}
                maxLength={6}
                className="h-auto w-32 border-0 bg-transparent p-0 font-mono text-base tracking-widest text-white placeholder:text-white/20 focus-visible:ring-0"
              />
              <Button
                id="join-room-btn"
                size="sm"
                variant="outline"
                className={cn(
                  'h-10 gap-1.5 border-white/20 bg-white/5 text-white transition-all',
                  joinCode.length === 6 ? 'hover:bg-violet-600 hover:border-violet-500 hover:text-white' : 'opacity-40 cursor-not-allowed'
                )}
                onClick={joinRoom}
                disabled={joining || joinCode.length !== 6}
              >
                {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ArrowRight className="h-4 w-4" /> Join</>}
              </Button>
            </div>
            {/* Live char counter */}
            {joinCode.length > 0 && joinCode.length < 6 && (
              <p className="pl-2 text-xs text-amber-400/70">{6 - joinCode.length} more character{6 - joinCode.length !== 1 ? 's' : ''} needed</p>
            )}
            {joinCode.length === 6 && (
              <p className="pl-2 text-xs text-emerald-400/70">✓ Press Join or Enter</p>
            )}
          </div>

        </div>

        {/* Speed badge */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm text-white/40">
          <span className="flex items-center gap-1.5"><Wifi className="h-4 w-4 text-violet-400" /> LAN: 50–500 MB/s</span>
          <span className="h-1 w-1 rounded-full bg-white/20" />
          <span className="flex items-center gap-1.5"><Globe className="h-4 w-4 text-cyan-400" /> External: internet speed</span>
          <span className="h-1 w-1 rounded-full bg-white/20" />
          <span className="flex items-center gap-1.5"><Shield className="h-4 w-4 text-emerald-400" /> End-to-end P2P</span>
        </div>
      </section>

      {/* ─── Feature Cards ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-6 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc, color, bg }) => (
            <div
              key={title}
              className={cn(
                'group rounded-2xl border p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg',
                bg
              )}
            >
              <div className={cn('mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border', bg)}>
                <Icon className={cn('h-6 w-6', color)} />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
              <p className="text-sm leading-relaxed text-white/55">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── How It Works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-6 pb-32">
        <h2 className="mb-12 text-center text-3xl font-bold text-white">
          How it works
        </h2>
        <div className="grid gap-8 sm:grid-cols-3">
          {HOW_IT_WORKS.map(({ step, title, desc }) => (
            <div key={step} className="relative text-center">
              <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 border border-violet-500/30 text-xl font-black text-violet-400">
                {step}
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
              <p className="text-sm leading-relaxed text-white/55">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
