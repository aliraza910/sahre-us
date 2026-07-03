import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { roomIdToCode } from '@/lib/fileUtils'

async function hashStr(s: string): Promise<string> {
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// GET /api/rooms/[roomId] — fetch room metadata, optionally verify password
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params
  const passwordParam = req.nextUrl.searchParams.get('password')

  // ── Try DB first ──────────────────────────────────────────────
  try {
    const { data: room, error: dbError } = await supabaseAdmin
      .from('rooms')
      .select('id, short_code, expires_at, created_at, password_hash')
      .eq('id', roomId)
      .maybeSingle()

    // DB connectivity error (e.g. invalid API key) → fall through to local fallback
    if (dbError) throw dbError

    if (!room) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (uuidRegex.test(roomId)) {
        return NextResponse.json({
          id: roomId,
          shortCode: roomIdToCode(roomId) ?? 'LOCAL',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          createdAt: new Date().toISOString(),
          hasPassword: false,
          isLocalFallback: true,
        })
      }
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    if (new Date(room.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Room has expired', expired: true }, { status: 410 })
    }

    if (room.password_hash) {
      if (!passwordParam) {
        return NextResponse.json({ id: room.id, shortCode: room.short_code, expiresAt: room.expires_at, requiresPassword: true, hasPassword: true }, { status: 401 })
      }
      const hash = await hashStr(passwordParam)
      if (hash !== room.password_hash) {
        return NextResponse.json({ error: 'Incorrect password', requiresPassword: true }, { status: 401 })
      }
    }

    return NextResponse.json({
      id: room.id,
      shortCode: room.short_code,
      expiresAt: room.expires_at,
      createdAt: room.created_at,
      hasPassword: !!room.password_hash,
    })
  } catch {
    // ── Local fallback — DB unreachable ────────────────────────
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidRegex.test(roomId)) {
      return NextResponse.json({
        id: roomId,
        shortCode: roomIdToCode(roomId) ?? 'LOCAL',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        createdAt: new Date().toISOString(),
        hasPassword: false,
        isLocalFallback: true,
      })
    }
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }

}

// DELETE /api/rooms/[roomId] — host-only room deletion
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params
  const hostToken = req.headers.get('x-host-token')

  try {
    // Verify host_token before deleting
    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('id, host_token')
      .eq('id', roomId)
      .maybeSingle()

    if (room && room.host_token && room.host_token !== hostToken) {
      return NextResponse.json({ error: 'Unauthorized — not the host' }, { status: 403 })
    }

    await supabaseAdmin.from('shares').delete().eq('room_id', roomId)
    await supabaseAdmin.from('rooms').delete().eq('id', roomId)
    return NextResponse.json({ success: true })

  } catch {
    // Local fallback — just allow it
    return NextResponse.json({ success: true, isLocalFallback: true })
  }
}
