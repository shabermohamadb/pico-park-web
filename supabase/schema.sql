-- ==============================================================================
-- PICO PARK Web - Supabase Full Database Schema
-- ==============================================================================
-- Run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ==============================================================================

-- 1. Create Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT NOT NULL DEFAULT 'Player',
  avatar_url TEXT,
  is_guest BOOLEAN NOT NULL DEFAULT FALSE,
  current_level INTEGER NOT NULL DEFAULT 1,
  highest_level INTEGER NOT NULL DEFAULT 1,
  levels_cleared INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Create User Level Progress table (tracks each stage cleared)
CREATE TABLE IF NOT EXISTS public.user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  stage_name TEXT NOT NULL,
  stage_index INTEGER NOT NULL,
  world_id INTEGER NOT NULL DEFAULT 1,
  cleared BOOLEAN NOT NULL DEFAULT TRUE,
  clear_count INTEGER NOT NULL DEFAULT 1,
  best_time_seconds NUMERIC(10, 2),
  cleared_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CONSTRAINT unique_user_stage UNIQUE (user_id, stage_name)
);

-- 3. Create Multiplayer Game Rooms History table
CREATE TABLE IF NOT EXISTS public.game_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL,
  host_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  host_name TEXT NOT NULL DEFAULT 'Host',
  current_stage TEXT NOT NULL DEFAULT 'stage_jump01',
  player_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PLAYING', -- 'LOBBY', 'PLAYING', 'COMPLETED'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE
);

-- 4. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;

-- 5. Profiles RLS Policies
-- Anyone can view profiles (needed for multiplayer lobbies and leaderboards)
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

-- Authenticated users can insert their own profile
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Authenticated users can update their own profile
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- 6. User Progress RLS Policies
-- Users can view their own stage progress
CREATE POLICY "Users can view their own progress"
  ON public.user_progress FOR SELECT
  USING (auth.uid() = user_id OR auth.role() = 'anon');

-- Users can insert/upsert their stage progress
CREATE POLICY "Users can insert their own progress"
  ON public.user_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own progress
CREATE POLICY "Users can update their own progress"
  ON public.user_progress FOR UPDATE
  USING (auth.uid() = user_id);

-- 7. Game Rooms RLS Policies
CREATE POLICY "Rooms viewable by everyone"
  ON public.game_rooms FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create rooms"
  ON public.game_rooms FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Room updates by creator or players"
  ON public.game_rooms FOR UPDATE
  USING (true);

-- 8. Auto-create Profile Trigger on Google Auth Sign-Up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    display_name,
    avatar_url,
    current_level,
    highest_level,
    levels_cleared
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1),
      'Player'
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture',
      NULL
    ),
    1,
    1,
    0
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    email = EXCLUDED.email,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. Leaderboard View for highest level players
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
  p.id,
  p.display_name,
  p.avatar_url,
  p.highest_level,
  p.levels_cleared,
  p.updated_at
FROM public.profiles p
ORDER BY p.highest_level DESC, p.levels_cleared DESC, p.updated_at DESC
LIMIT 50;

