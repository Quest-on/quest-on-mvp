"use client";

import { InstructorMemoryScreen } from "@/components/instructor/memory/InstructorMemoryScreen";

/**
 * /instructor/memory — 교수가 자기에 대해 학습된 내용을 열람·삭제하는 화면.
 *
 * 주입(MEMORY_INJECTION_ENABLED) 여부로 이 라우트를 가리지 않는다. 주입이 꺼진 채로
 * 기록만 쌓이는 릴리스에서도 열람·삭제 권한은 있어야 한다.
 */
export default function InstructorMemoryPage() {
  return <InstructorMemoryScreen />;
}
