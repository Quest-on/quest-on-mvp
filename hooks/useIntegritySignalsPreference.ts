"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getBrowserStorage,
  readIntegrityPreference,
  writeIntegrityPreference,
} from "@/lib/integrity-signals";

/**
 * 채점 화면 '의심 표시' 켜짐/꺼짐. 시험별로 localStorage 에 저장한다
 * (`qon.grade.integrity.{examId}`), 기본값은 켜짐.
 *
 * 하이드레이션 안전: 첫 렌더는 저장값과 상관없이 항상 켜짐이다(서버 HTML 과 같다).
 * 저장값은 마운트 effect 에서 읽는다. 채점 데이터는 마운트 뒤에 도착하므로 화면에
 * 켜짐 → 꺼짐 깜빡임이 보이지 않는다.
 *
 * 쓰기는 effect 가 아니라 setter 안에서 한다. effect 에서 쓰면 읽기 전의 기본값(켜짐)이
 * 저장된 꺼짐을 덮어쓸 수 있다.
 */
export function useIntegritySignalsPreference(
  examId: string,
): readonly [boolean, (show: boolean) => void] {
  const [showIntegritySignals, setShowIntegritySignals] = useState(true);

  useEffect(() => {
    setShowIntegritySignals(readIntegrityPreference(getBrowserStorage(), examId));
  }, [examId]);

  const update = useCallback(
    (show: boolean) => {
      setShowIntegritySignals(show);
      writeIntegrityPreference(getBrowserStorage(), examId, show);
    },
    [examId],
  );

  return [showIntegritySignals, update] as const;
}
