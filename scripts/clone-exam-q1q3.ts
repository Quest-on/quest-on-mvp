/**
 * Clone exam 2OXLYS with only Q1 (idx 0) and Q3 (idx 2), dropping Q2.
 * Same instructor, new code, status=draft, copies rubric/materials/materials_text + RAG chunks.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const SRC_CODE = '2OXLYS';
const KEEP_INDEXES = [0, 2]; // Q1 and Q3 (0-based)

function generateExamCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let r = '';
  for (let i = 0; i < 6; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
  return r;
}

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const c = generateExamCode();
    const { data } = await supabase.from('exams').select('id').eq('code', c).maybeSingle();
    if (!data) return c;
  }
  throw new Error('Failed to generate unique exam code');
}

async function main() {
  const { data: src, error: srcErr } = await supabase
    .from('exams').select('*').eq('code', SRC_CODE).single();
  if (srcErr || !src) throw srcErr || new Error('source not found');

  const allQs = Array.isArray(src.questions) ? src.questions : [];
  const keptQs = KEEP_INDEXES.map(i => allQs[i]).filter(Boolean);
  console.log(`Keeping ${keptQs.length} questions (indexes ${KEEP_INDEXES.join(', ')}) out of ${allQs.length}`);

  const newCode = await uniqueCode();
  const newTitle = `${src.title.trim()} (Q1+Q3)`;

  const insertPayload = {
    title: newTitle,
    code: newCode,
    description: src.description,
    duration: src.duration,
    questions: keptQs,
    status: 'draft',
    instructor_id: src.instructor_id,
    materials: src.materials ?? [],
    rubric: src.rubric ?? [],
    open_at: null,
    close_at: null,
    started_at: null,
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

  const { data: newExam, error: insErr } = await supabase
    .from('exams').insert(insertPayload).select('*').single();
  if (insErr || !newExam) throw insErr || new Error('insert failed');
  console.log(`\n✅ New exam created`);
  console.log(`   ID:    ${newExam.id}`);
  console.log(`   Code:  ${newExam.code}`);
  console.log(`   Title: ${newExam.title}`);
  console.log(`   Instructor: ${newExam.instructor_id}`);
  console.log(`   Status: ${newExam.status}`);
  console.log(`   rag_status: ${newExam.rag_status}`);
  console.log(`   Questions: ${keptQs.length}`);

  // Copy exam_material_chunks (RAG embeddings) in batches
  console.log(`\n📦 Copying RAG chunks…`);
  const { count, error: cntErr } = await supabase
    .from('exam_material_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('exam_id', src.id);
  if (cntErr) throw cntErr;
  console.log(`   Source chunks: ${count}`);

  if ((count ?? 0) > 0) {
    const PAGE = 200;
    let copied = 0;
    for (let offset = 0; offset < (count ?? 0); offset += PAGE) {
      const { data: chunks, error: chErr } = await supabase
        .from('exam_material_chunks')
        .select('file_url, content, embedding, metadata')
        .eq('exam_id', src.id)
        .order('created_at', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (chErr) throw chErr;
      if (!chunks || chunks.length === 0) break;

      const rows = chunks.map(c => ({
        exam_id: newExam.id,
        file_url: c.file_url,
        content: c.content,
        embedding: c.embedding, // pgvector string accepted as-is
        metadata: c.metadata ?? {},
      }));
      const { error: insChErr } = await supabase.from('exam_material_chunks').insert(rows);
      if (insChErr) throw insChErr;
      copied += rows.length;
      console.log(`   copied ${copied}/${count}`);
    }
  }

  console.log(`\n🎉 Done. New exam code: ${newExam.code}`);
}

main().catch(err => { console.error('ERROR:', err); process.exit(1); });
