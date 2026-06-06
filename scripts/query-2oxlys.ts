import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  const { data, error } = await supabase
    .from('exams')
    .select('*')
    .eq('code', '2OXLYS')
    .single();
  if (error) { console.error(error); process.exit(1); }
  console.log('EXAM:', JSON.stringify({
    id: data.id,
    title: data.title,
    code: data.code,
    description: data.description,
    duration: data.duration,
    status: data.status,
    instructor_id: data.instructor_id,
    type: data.type,
    language: data.language,
    chat_weight: data.chat_weight,
    rubric_public: data.rubric_public,
    allow_draft_in_waiting: data.allow_draft_in_waiting,
    allow_chat_in_waiting: data.allow_chat_in_waiting,
    questions_count: Array.isArray(data.questions) ? data.questions.length : 'not array',
  }, null, 2));
  console.log('\nQUESTIONS:');
  if (Array.isArray(data.questions)) {
    data.questions.forEach((q: any, i: number) => {
      console.log(`\n--- Q${i} ---`);
      console.log(JSON.stringify(q, null, 2).slice(0, 800));
    });
  }
  console.log('\nRUBRIC:', JSON.stringify(data.rubric, null, 2).slice(0, 1000));
  console.log('\nMATERIALS:', JSON.stringify(data.materials, null, 2).slice(0, 500));
  console.log('\nMATERIALS_TEXT length:', data.materials_text ? JSON.stringify(data.materials_text).length : 0);
  console.log('\nASSIGNMENT_PROMPT:', data.assignment_prompt?.slice(0, 300));
  console.log('\nINITIAL_STATE:', JSON.stringify(data.initial_state));
  console.log('\nCANVAS_CONFIG:', JSON.stringify(data.canvas_config));
}
main();
