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
    .from('exams').select('id, started_at, status').eq('code', code).single();
  if (!exam) throw new Error('exam not found');
  if (exam.status !== 'running') throw new Error(`exam not running: ${exam.status}`);
  if (!exam.started_at) throw new Error('exam has no started_at');

  const { data: pending } = await supabase
    .from('sessions')
    .select('id, student_id, status, created_at')
    .eq('exam_id', exam.id)
    .eq('status', 'late_pending');

  if (!pending || pending.length === 0) {
    console.log('No late_pending sessions.'); return;
  }
  console.log(`Found ${pending.length} late_pending session(s).`);

  const now = new Date().toISOString();
  for (const s of pending) {
    const { error } = await supabase
      .from('sessions')
      .update({
        status: 'in_progress',
        started_at: exam.started_at,
        attempt_timer_started_at: exam.started_at,
        is_active: true,
        last_heartbeat_at: now,
        late_entry_approved_at: now,
        preflight_accepted_at: now,
      })
      .eq('id', s.id)
      .eq('status', 'late_pending');
    if (error) { console.error(' failed', s.id, error); continue; }

    const { data: prof } = await supabase
      .from('student_profiles')
      .select('name, student_number, school')
      .eq('student_id', s.student_id).maybeSingle();
    console.log(`✅ approved ${s.student_id} (${prof?.name ?? 'unknown'} ${prof?.student_number ?? ''} ${prof?.school ?? ''})`);
  }
}
main().catch(err => { console.error(err); process.exit(1); });
