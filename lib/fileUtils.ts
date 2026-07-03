// ─── File utility helpers for DropZap ───────────────────────────

export const CHUNK_SIZE = 64 * 1024        // 64 KB per chunk
export const MAX_BUFFER = 256 * 1024       // pause if DataChannel buffer > 256 KB
export const MAX_LAN_SIZE = 1024 * 1024 * 1024  // 1 GB
export const MAX_EXTERNAL_SIZE = 50 * 1024 * 1024 // 50 MB

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

/**
 * Format transfer speed (bytes/ms) → "12.4 MB/s"
 */
export function formatSpeed(bytesPerMs: number): string {
  const bytesPerSec = bytesPerMs * 1000
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`
  return `${(bytesPerSec / 1024 / 1024 / 1024).toFixed(2)} GB/s`
}

/**
 * Compute ETA given bytes remaining and current speed (bytes/ms)
 */
export function formatEta(remainingBytes: number, bytesPerMs: number): string {
  if (bytesPerMs <= 0) return '—'
  const ms = remainingBytes / bytesPerMs
  const secs = ms / 1000
  if (secs < 60) return `${Math.ceil(secs)}s`
  if (secs < 3600) return `${Math.ceil(secs / 60)}m`
  return `${(secs / 3600).toFixed(1)}h`
}

/**
 * Generate a 6-char alphanumeric room code
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/**
 * Convert a 6-char room code to a deterministic UUID.
 * SAME code → SAME UUID on every device, every time.
 * This is critical for local (no-Supabase) fallback mode so
 * the host and guests all resolve to the identical room ID.
 *
 * "ALPHA1" → "414c5048-4131-4000-8000-000000000000"
 */
export function codeToRoomId(code: string): string {
  const upper = code.toUpperCase().padEnd(6, '0').slice(0, 6)
  // 6 chars → 12 hex chars
  const hex = Array.from(upper)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
  // Pad to 32 hex chars
  const full = (hex + '0'.repeat(20)).slice(0, 32)
  // Build UUID v4 variant-1 format: xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx
  return [
    full.slice(0, 8),
    full.slice(8, 12),
    '4' + full.slice(13, 16),
    '8' + full.slice(17, 20),
    full.slice(20, 32),
  ].join('-')
}

/**
 * Decode the 6-character room code from a deterministic UUID.
 */
export function roomIdToCode(uuid: string): string | null {
  const clean = uuid.replace(/-/g, '').toLowerCase()
  if (clean.length !== 32) return null
  let code = ''
  try {
    for (let i = 0; i < 12; i += 2) {
      const hexPair = clean.slice(i, i + 2)
      const charCode = parseInt(hexPair, 16)
      if (isNaN(charCode) || charCode === 0) return null
      code += String.fromCharCode(charCode)
    }
    const upper = code.toUpperCase()
    if (/^[A-Z0-9]{6}$/.test(upper)) {
      return upper
    }
  } catch {}
  return null
}



/**
 * Slice a File into ArrayBuffer chunks
 */
export async function* chunkFile(
  file: File,
  chunkSize = CHUNK_SIZE
): AsyncGenerator<{ chunk: ArrayBuffer; index: number; total: number }> {
  const total = Math.ceil(file.size / chunkSize)
  for (let i = 0; i < total; i++) {
    const start = i * chunkSize
    const end = Math.min(start + chunkSize, file.size)
    const blob = file.slice(start, end)
    const chunk = await blob.arrayBuffer()
    yield { chunk, index: i, total }
  }
}

/**
 * Detect if the client is on a LAN (private IP range)
 * Uses WebRTC ICE candidate reflection
 */
export async function detectLANMode(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [] })
      pc.createDataChannel('probe')
      let found = false

      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          pc.close()
          if (!found) resolve(false)
          return
        }
        const { candidate } = e.candidate
        // Private IP ranges: 10.x, 172.16-31.x, 192.168.x
        if (/(\b(10|192\.168)\.\d{1,3}\.\d{1,3}\b|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})/.test(candidate)) {
          found = true
          pc.close()
          resolve(true)
        }
      }

      pc.createOffer().then((offer) => pc.setLocalDescription(offer))
      setTimeout(() => {
        pc.close()
        resolve(false)
      }, 3000)
    } catch {
      resolve(false)
    }
  })
}

/**
 * Get file type icon emoji
 */
export function getFileIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const icons: Record<string, string> = {
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
    ppt: '📊', pptx: '📊', zip: '🗜️', rar: '🗜️', '7z': '🗜️',
    tar: '🗜️', gz: '🗜️', mp4: '🎬', mkv: '🎬', avi: '🎬',
    mov: '🎬', mp3: '🎵', wav: '🎵', flac: '🎵', jpg: '🖼️',
    jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️',
    txt: '📃', md: '📃', json: '⚙️', js: '⚡', ts: '⚡',
    py: '🐍', go: '🔵', rs: '🦀', exe: '⚙️', dmg: '💿',
    iso: '💿',
  }
  return icons[ext] ?? '📁'
}

/**
 * Trigger a browser file download from a Blob
 */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
