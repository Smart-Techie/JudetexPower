/**
 * supabase.js
 * Supabase client initialization — ONLY the public anon key is used here.
 * The service-role / secret key is NEVER included in the frontend.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://gnerkzwnxlojhjxfybhz.supabase.co';
const SUPABASE_ANON = 'sb_publishable_xoNxbJjrsBTViHFUesdKTA_07tZpwva';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
