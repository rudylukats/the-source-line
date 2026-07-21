import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://townoxolapkvbzpncqfg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_0hmDQIcHxmbsCWxO9VHjMw_jT-QA3NF";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
