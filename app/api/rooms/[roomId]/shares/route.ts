import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/rooms/[roomId]/shares — list all non-expired shares for a room
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params

  try {
    const { data: shares, error } = await supabaseAdmin
      .from('shares')
      .select('id, file_name, file_size, expires_at, download_count, created_at, password_hash')
      .eq('room_id', roomId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({
      shares: shares.map((s) => ({
        id: s.id,
        fileName: s.file_name,
        fileSize: s.file_size,
        expiresAt: s.expires_at,
        downloadCount: s.download_count,
        createdAt: s.created_at,
        hasPassword: !!s.password_hash,
      })),
    })
  } catch {
    // Local fallback — no DB
    return NextResponse.json({ shares: [], isLocalFallback: true })
  }
}

// DELETE /api/rooms/[roomId]/shares — delete a specific share (by shareId query param)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params
  const shareId = req.nextUrl.searchParams.get('shareId')

  if (!shareId) {
    return NextResponse.json({ error: 'shareId required' }, { status: 400 })
  }

  try {
    const { error } = await supabaseAdmin
      .from('shares')
      .delete()
      .eq('id', shareId)
      .eq('room_id', roomId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: true, isLocalFallback: true })
  }
}
