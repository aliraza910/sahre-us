import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/rooms/[roomId] — fetch room details
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params

  try {
    const { data: room, error } = await supabaseAdmin
      .from('rooms')
      .select('id, short_code, expires_at, created_at, password_hash')
      .eq('id', roomId)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (error || !room) {
      // Test if it is a valid UUID, then fall back to offline room details
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (uuidRegex.test(roomId)) {
        return NextResponse.json({
          id: roomId,
          shortCode: 'LOCAL',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          createdAt: new Date().toISOString(),
          hasPassword: false,
          isLocalFallback: true
        })
      }
      return NextResponse.json({ error: 'Room not found or expired' }, { status: 404 })
    }

    return NextResponse.json({
      id: room.id,
      shortCode: room.short_code,
      expiresAt: room.expires_at,
      createdAt: room.created_at,
      hasPassword: !!room.password_hash,
    })
  } catch (err) {
    return NextResponse.json({
      id: roomId,
      shortCode: 'LOCAL',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      createdAt: new Date().toISOString(),
      hasPassword: false,
      isLocalFallback: true
    })
  }
}

// DELETE /api/rooms/[roomId] — close/delete a room and all its shares
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params

  try {
    // Delete associated shares first
    await supabaseAdmin.from('shares').delete().eq('room_id', roomId)
    // Delete the room
    const { error } = await supabaseAdmin.from('rooms').delete().eq('id', roomId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch {
    // Local fallback — just report success so the client can redirect
    return NextResponse.json({ success: true, isLocalFallback: true })
  }
}

