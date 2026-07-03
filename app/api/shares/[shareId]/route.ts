import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/shares/[shareId] — verify password and return signed download URL
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params
  const password = req.nextUrl.searchParams.get('password')

  const { data: share, error } = await supabaseAdmin
    .from('shares')
    .select('*')
    .eq('id', shareId)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (error || !share) {
    return NextResponse.json({ error: 'Share not found or expired' }, { status: 404 })
  }

  // Password check
  if (share.password_hash) {
    if (!password) {
      return NextResponse.json({ error: 'Password required', requiresPassword: true }, { status: 401 })
    }
    const enc = new TextEncoder()
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(password))
    const hash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
    if (hash !== share.password_hash) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
    }
  }

  // Generate signed download URL (valid 10 min)
  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from('external-shares')
    .createSignedUrl(share.storage_path, 600)

  if (signError || !signed) {
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
  }

  // Increment download count
  await supabaseAdmin
    .from('shares')
    .update({ download_count: share.download_count + 1 })
    .eq('id', shareId)

  return NextResponse.json({
    downloadUrl: signed.signedUrl,
    fileName: share.file_name,
    fileSize: share.file_size,
    expiresAt: share.expires_at,
    downloadCount: share.download_count + 1,
  })
}
