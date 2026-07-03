'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Download, Lock, File as FileIcon, Clock, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { formatBytes, getFileIcon } from '@/lib/fileUtils'
import { cn } from '@/lib/utils'

type ShareInfo = {
  downloadUrl: string
  fileName: string
  fileSize: number
  expiresAt: string
  downloadCount: number
}

export default function ExternalDownloadPage() {
  const { shareId } = useParams<{ shareId: string }>()

  const [requiresPassword, setRequiresPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [done, setDone] = useState(false)

  const fetchShare = useCallback(async (pw?: string) => {
    setLoading(true)
    setError(null)
    try {
      const url = `/api/shares/${shareId}${pw ? `?password=${encodeURIComponent(pw)}` : ''}`
      const res = await fetch(url)
      const data = await res.json()

      if (res.status === 401 && data.requiresPassword) {
        setRequiresPassword(true)
        setLoading(false)
        return
      }
      if (!res.ok) {
        setError(data.error ?? 'Failed to load share')
        setLoading(false)
        return
      }

      setShareInfo(data)
      setRequiresPassword(false)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [shareId])

  useEffect(() => { fetchShare() }, [fetchShare])

  const handlePasswordSubmit = useCallback(() => {
    if (!password.trim()) { toast.error('Enter a password'); return }
    fetchShare(password)
  }, [password, fetchShare])

  const handleDownload = useCallback(async () => {
    if (!shareInfo?.downloadUrl) return
    setDownloading(true)
    setDownloadProgress(0)

    try {
      const res = await fetch(shareInfo.downloadUrl)
      if (!res.ok) throw new Error('Download failed')

      const contentLength = parseInt(res.headers.get('content-length') ?? '0', 10)
      const reader = res.body?.getReader()
      if (!reader) throw new Error('Stream not supported')

      const chunks: Uint8Array[] = []
      let received = 0

      while (true) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break
        if (value) {
          chunks.push(value)
          received += value.length
          if (contentLength > 0) {
            setDownloadProgress(Math.round((received / contentLength) * 100))
          }
        }
      }

      const blob = new Blob(chunks as any)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = shareInfo.fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 10_000)

      setDone(true)
      toast.success('Download complete!')
    } catch (err) {
      toast.error('Download failed. The link may have expired.')
      console.error(err)
    } finally {
      setDownloading(false)
    }
  }, [shareInfo])

  const expiresIn = shareInfo
    ? Math.max(0, Math.round((new Date(shareInfo.expiresAt).getTime() - Date.now()) / 60_000))
    : 0

  // ─── Loading ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-mesh">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-violet-400" />
          <p className="text-white/50">Loading share…</p>
        </div>
      </div>
    )
  }

  // ─── Error ───────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-mesh px-6">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-400" />
          <h2 className="mb-2 text-2xl font-bold text-white">Share Not Found</h2>
          <p className="text-white/50">{error}</p>
        </div>
      </div>
    )
  }

  // ─── Password gate ────────────────────────────────────────────
  if (requiresPassword) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-mesh bg-grid px-6">
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
          <div className="h-[400px] w-[400px] rounded-full bg-violet-600/8 blur-[100px]" />
        </div>
        <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/20 border border-violet-500/30">
              <Lock className="h-7 w-7 text-violet-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Password Required</h1>
            <p className="text-sm text-white/50">This file is protected. Enter the password to download.</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dl-password" className="text-white/70">Password</Label>
              <Input
                id="dl-password"
                type="password"
                placeholder="Enter password…"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
                autoFocus
              />
            </div>
            <Button
              id="submit-password"
              className="w-full h-12 bg-violet-600 hover:bg-violet-500 font-semibold"
              onClick={handlePasswordSubmit}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Unlock'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!shareInfo) return null

  // ─── Download page ────────────────────────────────────────────
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-mesh bg-grid px-6">
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="h-[500px] w-[500px] rounded-full bg-cyan-600/6 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
          {/* File info */}
          <div className="mb-8 flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/8 border border-white/10 text-4xl">
              {getFileIcon(shareInfo.fileName)}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-white">{shareInfo.fileName}</h1>
              <p className="text-sm text-white/50">{formatBytes(shareInfo.fileSize)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="outline" className="border-white/10 text-xs text-white/40">
                  <Clock className="mr-1 h-3 w-3" />
                  Expires in {expiresIn}m
                </Badge>
                <Badge variant="outline" className="border-white/10 text-xs text-white/40">
                  {shareInfo.downloadCount} download{shareInfo.downloadCount !== 1 ? 's' : ''}
                </Badge>
              </div>
            </div>
          </div>

          {/* Download progress */}
          {downloading && (
            <div className="mb-6 space-y-2">
              <div className="flex justify-between text-xs text-white/50">
                <span>Downloading…</span>
                <span>{downloadProgress}%</span>
              </div>
              <Progress value={downloadProgress} className="h-2 [&>div]:bg-cyan-500" />
            </div>
          )}

          {/* Done state */}
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-400" />
              <p className="text-lg font-semibold text-white">Download Complete!</p>
              <p className="text-sm text-white/50">Check your downloads folder.</p>
            </div>
          ) : (
            <Button
              id="download-btn"
              className={cn(
                'w-full h-14 gap-3 text-base font-semibold transition-all',
                downloading
                  ? 'bg-cyan-700 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-500 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:scale-[1.01]'
              )}
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Downloading…</>
              ) : (
                <><Download className="h-5 w-5" /> Download File</>
              )}
            </Button>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-white/25">
          Powered by DropZap · Secure cloud storage
        </p>
      </div>
    </div>
  )
}
