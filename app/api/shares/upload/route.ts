import { NextRequest, NextResponse } from 'next/server'

// ─── In-memory file store for local dev fallback ─────────────────
// Only used when Supabase Storage is not configured.
// Files are stored in memory per server process — ephemeral!
const localFiles = new Map<string, {
  data: Uint8Array
  mimeType: string
  fileName: string
  expiresAt: number   // unix ms
}>()

const EXPIRY_MS = 24 * 3600 * 1000   // 24 hours

function purgeExpired() {
  const now = Date.now()
  for (const [k, v] of localFiles) {
    if (v.expiresAt < now) localFiles.delete(k)
  }
}

// ─── PUT /api/shares/upload — receive file bytes ──────────────────
export async function PUT(req: NextRequest) {
  purgeExpired()

  const { searchParams } = new URL(req.url)
  const path = searchParams.get('path')
  const token = searchParams.get('token')

  if (!path || !token) {
    return NextResponse.json({ error: 'Missing path or token' }, { status: 400 })
  }

  const data = new Uint8Array(await req.arrayBuffer())
  const mimeType = req.headers.get('content-type') || 'application/octet-stream'
  const fileName = decodeURIComponent(path).split('/').pop() || 'file'

  localFiles.set(path, { data, mimeType, fileName, expiresAt: Date.now() + EXPIRY_MS })

  return NextResponse.json({ success: true })
}

// ─── GET /api/shares/upload — serve stored file ───────────────────
// Used by the local share download page to retrieve files
export async function GET(req: NextRequest) {
  purgeExpired()

  const { searchParams } = new URL(req.url)
  const path = searchParams.get('path')

  if (!path) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  }

  const file = localFiles.get(path)
  if (!file) {
    return NextResponse.json({ error: 'File not found or expired' }, { status: 404 })
  }

  return new NextResponse(new Blob([file.data as any]), {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.fileName)}"`,
      'Content-Length': file.data.byteLength.toString(),
    },
  })
}
