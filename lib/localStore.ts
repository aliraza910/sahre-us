// ─── Shared In-Memory Store for Local Fallback Mode ──────────────
// This is used when Supabase is not available or not migrated.

export type LocalRoom = {
  id: string
  shortCode: string
  passwordHash: string | null
  expiresAt: string
  createdAt: string
  hostToken: string
}

// Global variable to persist across hot-reloads in Next.js development
const globalForStore = global as unknown as {
  localRooms?: Map<string, LocalRoom>
}

export const localRooms = globalForStore.localRooms ?? new Map<string, LocalRoom>()

if (process.env.NODE_ENV !== 'production') {
  globalForStore.localRooms = localRooms
}

export function purgeExpiredRooms() {
  const now = new Date()
  for (const [id, room] of localRooms.entries()) {
    if (new Date(room.expiresAt) < now) {
      localRooms.delete(id)
    }
  }
}
