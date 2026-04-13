// ================================================================
// ACADEMIA HQ — Supabase Client
// Replace this file at: src/integrations/supabase/client.ts
//
// Fill in your values from: Supabase → Settings → API
// ================================================================

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "YOUR_PROJECT_URL_HERE";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "YOUR_ANON_KEY_HERE";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
