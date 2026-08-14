import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ivpfwenftlaprqvwlsng.supabase.co'
const supabaseKey = 'sb_publishable_pbKdapZv9sg8hUoXnSkmvg_RtJjoNH2'

export const supabase = createClient(supabaseUrl, supabaseKey)
