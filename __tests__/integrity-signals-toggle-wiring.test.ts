/**
 * 스위치를 누르면 토글 상태 함수가 불린다 (이슈 #514).
 *
 * `integrity-signals-ui.test.ts` 는 실제 Radix 스위치로 렌더 결과(role, aria-checked, 라벨 연결)만
 * 본다. 정적 렌더로는 클릭을 보낼 수 없어서, `onCheckedChange` 가 스위치까지 이어져 있는지는
 * 거기서 못 잡는다 — 그 한 줄이 지워져도 렌더 결과는 같다. 그래서 스위치를 가짜로 바꿔 받은
 * props 를 기록하고, 기록된 콜백을 직접 불러 상위 상태 함수로 값이 올라가는지 본다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

type SwitchProps = {
  id?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  "aria-describedby"?: string;
};

const received = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock("@/components/ui/switch", () => ({
  Switch: (props: SwitchProps) => {
    received.calls.push(props);
    return null;
  },
}));

async function renderToggle(checked: boolean, onCheckedChange: (v: boolean) => void) {
  const { IntegritySignalsToggle } = await import("@/components/instructor/IntegritySignalsToggle");
  renderToStaticMarkup(createElement(IntegritySignalsToggle, { checked, onCheckedChange }));
  return received.calls.at(-1) as SwitchProps;
}

describe("IntegritySignalsToggle — 스위치 연결", () => {
  beforeEach(() => {
    received.calls.length = 0;
  });

  it("스위치가 끄는 값(false)을 보내면 상위 상태 함수가 false 로 불린다", async () => {
    const setShowIntegritySignals = vi.fn();
    const props = await renderToggle(true, setShowIntegritySignals);

    expect(props.onCheckedChange).toBeTypeOf("function");
    props.onCheckedChange!(false);

    expect(setShowIntegritySignals).toHaveBeenCalledTimes(1);
    expect(setShowIntegritySignals).toHaveBeenCalledWith(false);
  });

  it("켜는 값(true)도 그대로 올라간다", async () => {
    const setShowIntegritySignals = vi.fn();
    const props = await renderToggle(false, setShowIntegritySignals);

    props.onCheckedChange!(true);

    expect(setShowIntegritySignals).toHaveBeenCalledWith(true);
  });

  it("스위치에 현재 상태와 설명 연결이 내려간다", async () => {
    const off = await renderToggle(false, vi.fn());
    expect(off.checked).toBe(false);
    expect(off.id).toBeTruthy();
    expect(off["aria-describedby"]).toBeTruthy();
    expect(off["aria-describedby"]).not.toBe(off.id);

    const on = await renderToggle(true, vi.fn());
    expect(on.checked).toBe(true);
  });
});
