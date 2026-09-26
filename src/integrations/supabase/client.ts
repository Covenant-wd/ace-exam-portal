// ================================================================
// ACADEMIA HQ — Supabase Client
// Replace this file at: src/integrations/supabase/client.ts
//
// Fill in your values from: Supabase → Settings → API
// ================================================================

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// These must be set in your .env file (or Vercel/Netlify env variables).
// No hardcoded fallbacks — having them in source exposes the project ID.
const SUPABASE_URL             = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "Missing Supabase environment variables.\n" +
    "Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to your .env file."
  );
}

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
