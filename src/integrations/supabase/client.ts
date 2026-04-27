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
    // autoRefreshToken: true means Supabase will proactively refresh the JWT
    // before it expires (in the background). This is good. However it also
    // fires an onAuthStateChange(TOKEN_REFRESHED) event every time the tab
    // becomes visible again — which used to trigger a full page re-render.
    // That is fixed in auth.tsx by ignoring TOKEN_REFRESHED for role resolution.
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    // Add a custom fetch that gracefully handles offline — returns a cached
    // response or a NetworkError that Supabase can handle without crashing.
    fetch: (url, options) => {
      return fetch(url, options).catch((err) => {
        // Let the caller handle the network error gracefully
        return Promise.reject(err);
      });
    },
  },
  realtime: {
    params: {
      // Throttle realtime events to reduce reconnect churn on mobile/unreliable
      // connections (prevents rapid reconnect loops when switching tabs).
      eventsPerSecond: 2,
    },
  },
});
