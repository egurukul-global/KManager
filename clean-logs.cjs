const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://nvhaetvreopkktlxxdwg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52aGFldHZyZW9wa2t0bHh4ZHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Mzg3MDcsImV4cCI6MjA5NDAxNDcwN30.yjsQeAhjZfXYV_Od6lkdZCCBSgt00Z9Pb-9Ki-a79kA';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function cleanStuckLogs() {
  const { data, error } = await supabase.from('report_logs').update({ status: 'failed' }).eq('status', 'in_progress');
  console.log('Cleaned stuck logs', error ? error : 'success');
}
cleanStuckLogs();
