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

async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(password))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// POST /api/rooms — create a new room
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many rooms created. Try again in an hour.' }, { status: 429 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { password, customCode } = body as { password?: string; customCode?: string }

    let short_code: string
    if (customCode && /^[A-Z0-9]{6}$/.test(customCode)) {
      short_code = customCode
    } else {
      short_code = generateRoomCode()
      let attempts = 0
      while (attempts < 5) {
        try {
          const { data: existing } = await supabaseAdmin
            .from('rooms').select('id').eq('short_code', short_code).single()
          if (!existing) break
        } catch { break }
        short_code = generateRoomCode()
        attempts++
      }
    }

    const password_hash = password ? await hashPassword(password) : null
    // Each room creator gets a secret host_token — only they can delete the room
    const host_token = crypto.randomUUID()

    try {
      const { data: room, error } = await supabaseAdmin
        .from('rooms')
        .insert({ short_code, password_hash, host_token })
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({
        roomId: room.id,
        shortCode: room.short_code,
        expiresAt: room.expires_at,
        hasPassword: !!password_hash,
        hostToken: host_token,        // returned only at creation time
      })
    } catch (dbErr) {
      console.warn('[Supabase Fallback] Using deterministic local room:', dbErr)
      return NextResponse.json({
        roomId: codeToRoomId(short_code),
        shortCode: short_code,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        hasPassword: !!password_hash,
        hostToken: host_token,
        isLocalFallback: true,
      })
    }
  } catch (err) {
    console.error('[POST /api/rooms]', err)
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
  }
}
