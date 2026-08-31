import { createClient } from '@supabase/supabase-js'
const SUPABASE_URL = 'https://nvhaetvreopkktlxxdwg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52aGFldHZyZW9wa2t0bHh4ZHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Mzg3MDcsImV4cCI6MjA5NDAxNDcwN30.yjsQeAhjZfXYV_Od6lkdZCCBSgt00Z9Pb-9Ki-a79kA';
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

async function run() {
  const { data, error } = await supabaseClient
    .from('expenses')
    .select('id, category_id, categories(name)')
    .limit(1);
  console.log('Error:', error);
  console.log('Data:', data);
}
run();
