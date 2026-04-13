// ================================================================
// ACADEMIA HQ — Supabase Client
// Replace this file at: src/integrations/supabase/client.ts
//
// Fill in your values from: Supabase → Settings → API
// ================================================================

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://xpuietzepndkxtkdmmoj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_z18ljLTStPV77p7RhBh26w_vufqZoz1";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
