-- ================================================================
-- DropZap Database Schema
-- Run this in Supabase SQL Editor: https://app.supabase.com/project/_/sql
-- ================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------
-- ROOMS table
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rooms (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code   TEXT        UNIQUE NOT NULL,
  host_peer_id TEXT,
  password_hash TEXT,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick short_code lookup
CREATE INDEX IF NOT EXISTS rooms_short_code_idx ON public.rooms (short_code);

-- Auto-delete expired rooms (run via pg_cron or manual cleanup)
-- Alternatively, filter in queries with: WHERE expires_at > NOW()

-- RLS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active rooms"
  ON public.rooms FOR SELECT
  USING (expires_at > NOW());

CREATE POLICY "Anyone can insert a room"
  ON public.rooms FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update their room"
  ON public.rooms FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete a room"
  ON public.rooms FOR DELETE
  USING (true);

-- ----------------------------------------------------------------
-- SHARES table  (external 50MB shares via Supabase Storage)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shares (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id        UUID        REFERENCES public.rooms(id) ON DELETE SET NULL,
  file_name      TEXT        NOT NULL,
  file_size      BIGINT      NOT NULL,
  storage_path   TEXT        NOT NULL,
  password_hash  TEXT,
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  download_count INT         NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active shares"
  ON public.shares FOR SELECT
  USING (expires_at > NOW());

CREATE POLICY "Anyone can insert a share"
  ON public.shares FOR INSERT
  WITH CHECK (file_size <= 52428800); -- 50 MB hard limit

CREATE POLICY "Anyone can update share download count"
  ON public.shares FOR UPDATE
  USING (true);

-- ----------------------------------------------------------------
-- STORAGE BUCKET  (run via Supabase Dashboard or API)
-- ----------------------------------------------------------------
-- 1. Go to Storage → New Bucket
-- 2. Name: external-shares
-- 3. Public: NO (we use signed URLs)
-- 4. File size limit: 52428800 (50 MB)

-- ----------------------------------------------------------------
-- REALTIME  (enable for signaling)
-- ----------------------------------------------------------------
-- Go to Database → Replication → enable realtime for: rooms, shares
-- (We use Supabase Realtime Broadcast — no table changes needed)
