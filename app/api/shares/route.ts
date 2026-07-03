import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const MAX_SIZE = 50 * 1024 * 1024 // 50 MB

// ─── Blocked file types (executables / potentially dangerous) ────
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'dll', 'bat', 'cmd', 'sh', 'bash', 'vbs', 'vbe', 'msi', 'com',
  'pif', 'scr', 'jar', 'ps1', 'ps2', 'psm1', 'wsf', 'wsh', 'reg',
  'lnk', 'inf', 'hta', 'cpl', 'msc', 'sys', 'drv',
])
const BLOCKED_MIME_PREFIXES = [
  'application/x-msdownload',
  'application/x-executable',
  'application/x-sh',
  'application/x-shellscript',
  'application/x-msdos-program',
]

function isBlockedFile(fileName: string, mimeType: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (BLOCKED_EXTENSIONS.has(ext)) return true
  if (BLOCKED_MIME_PREFIXES.some((m) => mimeType.startsWith(m))) return true
  return false
}

async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(password))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ─── POST /api/shares — create share record after upload ─────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      fileName, fileSize, storagePath, roomId, password,
      expiresInHours = 24, isLocalFallback = false,
    } = body as {
      fileName: string; fileSize: number; storagePath: string
      roomId?: string; password?: string; expiresInHours?: number
      isLocalFallback?: boolean
    }

    if (!fileName || !fileSize || !storagePath) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (fileSize > MAX_SIZE) {
      return NextResponse.json({ error: 'File exceeds 50 MB limit' }, { status: 413 })
    }
    // File type validation (basic MIME sniff from filename)
    if (isBlockedFile(fileName, '')) {
      return NextResponse.json({ error: 'File type not allowed for security reasons' }, { status: 415 })
    }

    const password_hash = password ? await hashPassword(password) : null
    const expiresAt = new Date(Date.now() + expiresInHours * 3600_000).toISOString()

    // If client-side already flagged this as local fallback, skip DB
    if (isLocalFallback) {
      return NextResponse.json({
        shareId: crypto.randomUUID(),
        expiresAt,
        storagePath,
        isLocalFallback: true,
      })
    }

    try {
      const { data: share, error } = await supabaseAdmin
        .from('shares')
        .insert({ file_name: fileName, file_size: fileSize, storage_path: storagePath, room_id: roomId ?? null, password_hash, expires_at: expiresAt })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ shareId: share.id, expiresAt: share.expires_at })
    } catch (dbErr) {
      console.warn('[Supabase Fallback] Share insert failed:', dbErr)
      return NextResponse.json({
        shareId: crypto.randomUUID(),
        expiresAt,
        storagePath,
        isLocalFallback: true,
      })
    }
  } catch (err) {
    console.error('[POST /api/shares]', err)
    return NextResponse.json({ error: 'Failed to create share' }, { status: 500 })
  }
}

// ─── GET /api/shares — generate signed upload URL ────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const fileName = searchParams.get('fileName')
  const fileSize = parseInt(searchParams.get('fileSize') ?? '0', 10)
  const mimeType = searchParams.get('mimeType') ?? ''

  if (!fileName) {
    return NextResponse.json({ error: 'fileName required' }, { status: 400 })
  }
  if (fileSize > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 413 })
  }
  if (isBlockedFile(fileName, mimeType)) {
    return NextResponse.json({ error: 'File type not allowed for security reasons' }, { status: 415 })
  }

  const storagePath = `uploads/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  try {
    const { data, error } = await supabaseAdmin.storage
      .from('external-shares')
      .createSignedUploadUrl(storagePath)

    if (error) throw error
    return NextResponse.json({ uploadUrl: data.signedUrl, storagePath, token: data.token, isLocalFallback: false })
  } catch (storageErr) {
    console.warn('[Supabase Fallback] Storage URL failed:', storageErr)
    const mockToken = crypto.randomUUID()
    // Point to our local upload endpoint
    const uploadUrl = `/api/shares/upload?path=${encodeURIComponent(storagePath)}&token=${mockToken}`
    return NextResponse.json({ uploadUrl, storagePath, token: mockToken, isLocalFallback: true })
  }
}
