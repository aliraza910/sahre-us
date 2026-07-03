import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateRoomCode, codeToRoomId } from '@/lib/fileUtils'

// Simple in-memory rate limiter (per IP, 10 rooms/hour)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 3600_000 })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

// POST /api/rooms — create a new room
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many rooms created. Try again in an hour.' },
      { status: 429 }
    )
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { password, customCode } = body as { password?: string; customCode?: string }

    let short_code: string
    if (customCode && /^[A-Z0-9]{6}$/.test(customCode)) {
      // User-specified code — use directly (collision will be caught by DB unique constraint)
      short_code = customCode
    } else {
      short_code = generateRoomCode()
      let attempts = 0
      // Ensure uniqueness (rare collision retry)
      while (attempts < 5) {
        try {
          const { data: existing } = await supabaseAdmin
            .from('rooms')
            .select('id')
            .eq('short_code', short_code)
            .single()
          if (!existing) break
        } catch { break } // DB error = treat as no collision
        short_code = generateRoomCode()
        attempts++
      }
    }

    let password_hash: string | null = null
    if (password) {
      // Simple hash using crypto (no bcrypt needed for MVP)
      const enc = new TextEncoder()
      const buf = await crypto.subtle.digest('SHA-256', enc.encode(password))
      password_hash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
    }

    try {
      const { data: room, error } = await supabaseAdmin
        .from('rooms')
        .insert({ short_code, password_hash })
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({
        roomId: room.id,
        shortCode: room.short_code,
        expiresAt: room.expires_at,
        hasPassword: !!password_hash,
      })
    } catch (dbErr) {
      console.warn('[Supabase Fallback] Query failed, using deterministic local room:', dbErr)
      return NextResponse.json({
        roomId: codeToRoomId(short_code),
        shortCode: short_code,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        hasPassword: !!password_hash,
        isLocalFallback: true,
      })
    }
  } catch (err) {
    console.error('[POST /api/rooms]', err)
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
  }
}
