/**
 * utils/supabase/client.js
 *
 * Browser-side Supabase client — safe for plain HTML/JS projects.
 * This is the vanilla-JS equivalent of the Next.js client.ts helper.
 *
 * Usage (ES module import):
 *   import { createClient } from './utils/supabase/client.js';
 *   const supabase = createClient();
 *
 * In this project the client is initialised in js/supabase.js and
 * the full data layer lives in js/db.js (window.SupabaseDB).
 */

import { createBrowserClient } from 'https://cdn.jsdelivr.net/npm/@supabase/ssr@latest/+esm';

const supabaseUrl = 'https://gnerkzwnxlojhjxfybhz.supabase.co';
const supabaseKey = 'sb_publishable_xoNxbJjrsBTViHFUesdKTA_07tZpwva';

/**
 * Returns a Supabase browser client.
 * Equivalent to the Next.js createBrowserClient helper.
 */
export const createClient = () =>
    createBrowserClient(supabaseUrl, supabaseKey);
