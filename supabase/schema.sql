-- ================================================================
-- DropZap Database Schema — v2
-- Run this in Supabase SQL Editor: https://app.supabase.com/project/_/sql
-- ================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------
-- ROOMS table
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rooms (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code    TEXT        UNIQUE NOT NULL,
  host_peer_id  TEXT,
  host_token    TEXT,                     -- secret token given to creator only
  password_hash TEXT,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '60 minutes',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add host_token if upgrading from v1
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS host_token TEXT;

-- Index for quick short_code lookup
CREATE INDEX IF NOT EXISTS rooms_short_code_idx ON public.rooms (short_code);

-- RLS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active rooms" ON public.rooms;
CREATE POLICY "Anyone can read active rooms"
  ON public.rooms FOR SELECT
  USING (expires_at > NOW());

DROP POLICY IF EXISTS "Anyone can insert a room" ON public.rooms;
CREATE POLICY "Anyone can insert a room"
  ON public.rooms FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update their room" ON public.rooms;
CREATE POLICY "Anyone can update their room"
  ON public.rooms FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "Anyone can delete a room" ON public.rooms;
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

DROP POLICY IF EXISTS "Anyone can read active shares" ON public.shares;
CREATE POLICY "Anyone can read active shares"
  ON public.shares FOR SELECT
  USING (expires_at > NOW());

DROP POLICY IF EXISTS "Anyone can insert a share" ON public.shares;
CREATE POLICY "Anyone can insert a share"
  ON public.shares FOR INSERT
  WITH CHECK (file_size <= 52428800);

DROP POLICY IF EXISTS "Anyone can update share download count" ON public.shares;
CREATE POLICY "Anyone can update share download count"
  ON public.shares FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "Anyone can delete a share" ON public.shares;
CREATE POLICY "Anyone can delete a share"
  ON public.shares FOR DELETE
  USING (true);

-- ----------------------------------------------------------------
-- STORAGE BUCKET  (run via Supabase Dashboard)
-- ----------------------------------------------------------------
-- 1. Go to Storage → New Bucket
-- 2. Name: external-shares
-- 3. Public: NO (we use signed URLs)
-- 4. File size limit: 52428800 (50 MB)
-- 5. Add storage policy: Allow INSERT for authenticated + anon with service role

-- ----------------------------------------------------------------
-- REALTIME  (enable for signaling)
-- ----------------------------------------------------------------
-- Go to Database → Replication → enable realtime for: rooms, shares
