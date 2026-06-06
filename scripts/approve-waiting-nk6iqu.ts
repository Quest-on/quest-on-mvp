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
  const { data: exam } = await supabase
    .from('exams').select('id, started_at').eq('code', code).single();
  if (!exam) throw new Error('exam not found');

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, student_id, status, created_at, started_at')
    .eq('exam_id', exam.id)
    .order('created_at', { ascending: true });

  console.log(`Sessions for ${code}: ${sessions?.length ?? 0}`);
  sessions?.forEach(s => console.log(' -', s.status, s.student_id, 'created', s.created_at));

  const waiting = sessions?.filter(s => s.status === 'waiting') ?? [];
  if (waiting.length === 0) { console.log('No waiting sessions.'); return; }

  const now = new Date().toISOString();
  const ids = waiting.map(s => s.id);
  const { data: upd, error } = await supabase
    .from('sessions')
    .update({ status: 'in_progress', started_at: now, attempt_timer_started_at: now })
    .in('id', ids)
    .select('id, student_id, status, started_at');
  if (error) throw error;
  console.log(`✅ Approved ${upd?.length ?? 0} session(s):`);
  upd?.forEach(s => console.log(' -', s.student_id, s.status, 'timer started', s.started_at));

  // Fetch profiles for context
  const studentIds = upd?.map(s => s.student_id) ?? [];
  if (studentIds.length) {
    const { data: profs } = await supabase
      .from('student_profiles')
      .select('student_id, name, student_number, school')
      .in('student_id', studentIds);
    profs?.forEach(p => console.log('   →', p.name, p.student_number, p.school));
  }
}
main().catch(err => { console.error(err); process.exit(1); });
