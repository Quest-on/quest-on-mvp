"use client";

import { useCallback, useSyncExternalStore } from "react";
import { integrityPreferenceStore } from "@/lib/integrity-signals";

// 서버 렌더와 하이드레이션의 값. 서버 HTML 은 사용자의 localStorage 를 모르므로 항상 기본값(켜짐).
const getServerSnapshot = () => true;

/**
 * 채점 화면 '의심 표시' 켜짐/꺼짐. 시험별로 localStorage 에 저장한다
 * (`qon.grade.integrity.{examId}`), 기본값은 켜짐.
 *
 * `useSyncExternalStore` 로 읽는다. 클라이언트 렌더에서는 **첫 렌더부터** 저장값을
 * 돌려주므로, react-query 캐시로 같은 시험의 다른 학생 페이지에 다시 들어올 때(데이터가
 * 첫 렌더에 이미 있다) 켜짐 → 꺼짐 깜빡임이 없다. 서버 렌더와 하이드레이션은
 * `getServerSnapshot`(켜짐)을 쓰고, 하이드레이션 직후 저장값이 다르면 React 가 한 번 더
 * 렌더한다. 다른 탭에서 바꾸면 `storage` 이벤트로 따라간다.
 *
 * localStorage 접근이 막혀 있어도(프라이빗 모드 등) 켜짐으로 폴백하고, 스위치는 이 탭에서
 * 계속 동작한다.
 */
export function useIntegritySignalsPreference(
  examId: string,
): readonly [boolean, (show: boolean) => void] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => integrityPreferenceStore.subscribe(examId, onStoreChange),
    [examId],
  );
  const getSnapshot = useCallback(
    () => integrityPreferenceStore.getSnapshot(examId),
    [examId],
  );
  const showIntegritySignals = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback(
    (show: boolean) => integrityPreferenceStore.setPreference(examId, show),
    [examId],
  );

  return [showIntegritySignals, update] as const;
}
