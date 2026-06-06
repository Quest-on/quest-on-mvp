/**
 * Clone NK6IQU exactly: same instructor, same 2 questions, en language,
 * same rubric/materials/materials_text, and register in exam_nodes tree.
 * New exam is created as draft.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const SRC_CODE = 'NK6IQU';

function genCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let r = ''; for (let i=0;i<6;i++) r += chars.charAt(Math.floor(Math.random()*chars.length));
  return r;
}
async function uniqueCode() {
  for (let i=0;i<20;i++) {
    const c = genCode();
    const { data } = await supabase.from('exams').select('id').eq('code', c).maybeSingle();
    if (!data) return c;
  }
  throw new Error('no unique code');
}

async function main() {
  const { data: src, error } = await supabase.from('exams').select('*').eq('code', SRC_CODE).single();
  if (error || !src) throw error || new Error('source missing');

  const newCode = await uniqueCode();
  const baseTitle = src.title.replace(/\s*\(copy(\s*\d+)?\)\s*$/, '').trim();
  const newTitle = `${baseTitle} (copy 2)`;

  const payload = {
    title: newTitle,
    code: newCode,
    description: src.description,
    duration: src.duration,
    questions: src.questions,
    status: 'draft',
    instructor_id: src.instructor_id,
    materials: src.materials ?? [],
    rubric: src.rubric ?? [],
    open_at: null, close_at: null, started_at: null,
    allow_draft_in_waiting: src.allow_draft_in_waiting ?? false,
    allow_chat_in_waiting: src.allow_chat_in_waiting ?? false,
    chat_weight: src.chat_weight ?? 50,
    rubric_public: src.rubric_public ?? false,
    materials_text: src.materials_text ?? [],
    rag_status: src.rag_status ?? 'none',
    type: src.type ?? 'exam',
    deadline: null,
    assignment_prompt: src.assignment_prompt,
    initial_state: src.initial_state ?? {},
    canvas_config: src.canvas_config ?? {},
    grades_released: false,
    language: src.language ?? 'ko',
  };

  const { data: newExam, error: insErr } = await supabase.from('exams').insert(payload).select('*').single();
  if (insErr || !newExam) throw insErr || new Error('insert failed');
  console.log('✅ Exam created');
  console.log('   Code:', newExam.code, '| Title:', newExam.title, '| lang:', newExam.language, '| status:', newExam.status);

  // Copy RAG chunks if any
  const { count } = await supabase.from('exam_material_chunks').select('id', { count: 'exact', head: true }).eq('exam_id', src.id);
  if ((count ?? 0) > 0) {
    const PAGE = 200; let copied = 0;
    for (let off=0; off<(count??0); off+=PAGE) {
      const { data: rows } = await supabase.from('exam_material_chunks')
        .select('file_url, content, embedding, metadata')
        .eq('exam_id', src.id).order('created_at').range(off, off+PAGE-1);
      if (!rows?.length) break;
      const toInsert = rows.map(r => ({ exam_id: newExam.id, ...r, metadata: r.metadata ?? {} }));
      const { error: e } = await supabase.from('exam_material_chunks').insert(toInsert);
      if (e) throw e;
      copied += toInsert.length;
    }
    console.log(`   Copied ${copied} RAG chunks`);
  }

  // Register in exam_nodes tree (root)
  const { data: maxRow } = await supabase.from('exam_nodes')
    .select('sort_order').eq('instructor_id', src.instructor_id).is('parent_id', null)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const nextSort = (maxRow?.sort_order ?? 0) + 1;
  const { error: nodeErr } = await supabase.from('exam_nodes').insert({
    instructor_id: src.instructor_id,
    parent_id: null,
    kind: 'exam',
    name: newTitle,
    sort_order: nextSort,
    exam_id: newExam.id,
  });
  if (nodeErr) throw nodeErr;
  console.log('   exam_node registered (sort_order', nextSort, ')');

  console.log('\n🎉 Done. New exam code:', newExam.code);
}
main().catch(e => { console.error(e); process.exit(1); });
