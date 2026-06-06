import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  const code = 'NK6IQU';
  const now = new Date().toISOString();

  const { data: exam, error: e1 } = await supabase
    .from('exams').select('id, status, started_at').eq('code', code).single();
  if (e1 || !exam) throw e1 || new Error('not found');

  if (exam.started_at) {
    console.log(`Already started at ${exam.started_at}`);
    return;
  }
  if (!['draft', 'scheduled', 'joinable'].includes(exam.status || '')) {
    console.log(`Cannot start from status '${exam.status}'`);
    return;
  }

  const { data, error } = await supabase
    .from('exams')
    .update({ status: 'running', started_at: now, updated_at: now })
    .eq('id', exam.id)
    .eq('status', exam.status)
    .select('code, status, started_at, open_at, close_at')
    .single();

  if (error) throw error;
  console.log('✅ Exam started');
  console.log(JSON.stringify(data, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
