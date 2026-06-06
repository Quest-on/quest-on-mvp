import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  const codes = ['2OXLYS', 'NK6IQU'];
  for (const code of codes) {
    const { data } = await supabase
      .from('exams')
      .select('code, title, status, open_at, close_at, started_at, deadline, duration')
      .eq('code', code).single();
    console.log(code, JSON.stringify(data, null, 2));
  }
}
main();
