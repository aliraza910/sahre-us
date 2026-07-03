import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const MAX_SIZE = 50 * 1024 * 1024 // 50 MB hard limit

// POST /api/shares — create external share record after upload
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { fileName, fileSize, storagePath, roomId, password, expiresInHours = 24 } = body as {
      fileName: string
      fileSize: number
      storagePath: string
      roomId?: string
      password?: string
      expiresInHours?: number
    }

    if (!fileName || !fileSize || !storagePath) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (fileSize > MAX_SIZE) {
      return NextResponse.json({ error: 'File exceeds 50 MB limit for external sharing' }, { status: 413 })
    }

    let password_hash: string | null = null
    if (password) {
      const enc = new TextEncoder()
      const buf = await crypto.subtle.digest('SHA-256', enc.encode(password))
      password_hash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
    }

    const expiresAt = new Date(Date.now() + expiresInHours * 3600_000).toISOString()

    try {
      const { data: share, error } = await supabaseAdmin
        .from('shares')
        .insert({ file_name: fileName, file_size: fileSize, storage_path: storagePath, room_id: roomId ?? null, password_hash, expires_at: expiresAt })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ shareId: share.id, expiresAt: share.expires_at })
    } catch (dbErr) {
      console.warn('[Supabase Fallback] Share insert failed, using local fallback:', dbErr)
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

// GET /api/shares — generate signed upload URL for storage
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const fileName = searchParams.get('fileName')
  const fileSize = parseInt(searchParams.get('fileSize') ?? '0', 10)

  if (!fileName) {
    return NextResponse.json({ error: 'fileName required' }, { status: 400 })
  }
  if (fileSize > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 413 })
  }

  const storagePath = `uploads/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  try {
    const { data, error } = await supabaseAdmin.storage
      .from('external-shares')
      .createSignedUploadUrl(storagePath)

    if (error) throw error
    return NextResponse.json({ uploadUrl: data.signedUrl, storagePath, token: data.token })
  } catch (storageErr) {
    console.warn('[Supabase Fallback] Storage signed URL failed, using local fallback:', storageErr)
    // Return a local upload endpoint fallback
    const mockToken = crypto.randomUUID()
    return NextResponse.json({
      uploadUrl: `/api/shares/upload?path=${encodeURIComponent(storagePath)}&token=${mockToken}`,
      storagePath,
      token: mockToken,
      isLocalFallback: true,
    })
  }
}

