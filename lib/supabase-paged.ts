/**
 * Supabase(PostgREST)의 1000행 기본 제한(max-rows)을 우회해 조건에 맞는 전체 행을 가져온다.
 * 1000행씩 `.range(from, to)`로 끊어 요청하고, 1000행 미만이 돌아오는 페이지에서 종료한다.
 *
 * @example
 * const { data, error } = await fetchAllPaged((from, to) =>
 *   supabase.from("submissions").select("*").in("session_id", ids).range(from, to),
 * );
 */
export async function fetchAllPaged<Row>(
  makeQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
): Promise<{ data: Row[]; error: { message: string } | null }> {
  const PAGE = 1000;
  const all: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery(from, from + PAGE - 1);
    if (error) return { data: [], error };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return { data: all, error: null };
}
