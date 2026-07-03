import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/rooms/by-code/[code] — look up a room by its short code
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params

  try {
    const { data: room, error } = await supabaseAdmin
      .from('rooms')
      .select('id, short_code, expires_at, password_hash')
      .eq('short_code', code.toUpperCase())
      .gt('expires_at', new Date().toISOString())
      .single()

    if (error || !room) {
      // Fall back to local room creation on the fly using code
      return NextResponse.json({
        id: crypto.randomUUID(),
        shortCode: code.toUpperCase(),
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        hasPassword: false,
        isLocalFallback: true
      })
    }

    return NextResponse.json({
      id: room.id,
      shortCode: room.short_code,
      expiresAt: room.expires_at,
      hasPassword: !!room.password_hash,
    })
  } catch (err) {
    return NextResponse.json({
      id: crypto.randomUUID(),
      shortCode: code.toUpperCase(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      hasPassword: false,
      isLocalFallback: true
    })
  }
}
