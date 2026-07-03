import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { codeToRoomId } from '@/lib/fileUtils'

// GET /api/rooms/by-code/[code] — look up a room by its short code
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const upper = code.toUpperCase()

  try {
    // First check if room exists and is active
    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('id, short_code, expires_at, password_hash')
      .eq('short_code', upper)
      .maybeSingle()

    if (!room) {
      // No room in DB — local fallback with deterministic ID so host+guest agree
      return NextResponse.json({
        id: codeToRoomId(upper),
        shortCode: upper,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        hasPassword: false,
        isLocalFallback: true,
      })
    }

    // Room exists — is it expired?
    if (new Date(room.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Room has expired', expired: true }, { status: 410 })
    }

    return NextResponse.json({
      id: room.id,
      shortCode: room.short_code,
      expiresAt: room.expires_at,
      hasPassword: !!room.password_hash,
    })

  } catch {
    // DB unreachable — deterministic fallback
    return NextResponse.json({
      id: codeToRoomId(upper),
      shortCode: upper,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      hasPassword: false,
      isLocalFallback: true,
    })
  }
}
