/**
 * SSE 파서 (이슈 #545)
 *
 * OpenAI Responses 스트림과 `/api/chat/analysis` 의 진행 이벤트를 같은 파서로 읽는다. 이벤트 경계와 부분 청크가
 * 틀리면 셀이 사라지거나 두 번 세어진다. 그래서 경계를 하나씩 고정한다.
 */
import { describe, expect, it } from "vitest";
import { SseParser, formatSseEvent, readSseStream } from "@/lib/analysis-exec/sse";

function streamOf(chunks: Array<string | Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const out: Array<{ event: string | null; data: string }> = [];
  for await (const ev of readSseStream(stream)) out.push({ event: ev.event, data: ev.data });
  return out;
}

describe("SseParser 이벤트 경계", () => {
  it("빈 줄에서 이벤트 하나가 끝나고, event 와 data 를 읽는다", () => {
    const parser = new SseParser();
    const events = parser.push('event: response.created\ndata: {"a":1}\n\nevent: x\ndata: 2\n\n');
    expect(events).toEqual([
      { event: "response.created", data: '{"a":1}', id: null },
      { event: "x", data: "2", id: null },
    ]);
  });

  it("빈 줄이 오기 전에는 이벤트를 내보내지 않는다", () => {
    const parser = new SseParser();
    expect(parser.push("event: a\ndata: 1\n")).toEqual([]);
    expect(parser.push("\n")).toEqual([{ event: "a", data: "1", id: null }]);
  });

  it("data 줄이 여럿이면 줄바꿈으로 잇는다", () => {
    const parser = new SseParser();
    expect(parser.push("data: one\ndata: two\n\n")).toEqual([{ event: null, data: "one\ntwo", id: null }]);
  });

  it("주석 줄(하트비트)과 data 없는 이벤트는 버린다", () => {
    const parser = new SseParser();
    expect(parser.push(": keep-alive\n\nevent: only-name\n\n")).toEqual([]);
  });

  it("콜론 뒤 공백 하나만 지운다", () => {
    const parser = new SseParser();
    expect(parser.push("data:  두 칸\n\n")[0].data).toBe(" 두 칸");
    expect(parser.push("data:붙음\n\n")[0].data).toBe("붙음");
  });

  it("CRLF 와 CR 줄 끝도 받는다", () => {
    const parser = new SseParser();
    // 마지막 CR 은 다음 청크가 LF 일 수 있어 보류된다. 스트림이 끝나면(flush) 처리한다.
    const events = [...parser.push("event: a\r\ndata: 1\r\n\r\nevent: b\rdata: 2\r\r"), ...parser.flush()];
    expect(events).toEqual([
      { event: "a", data: "1", id: null },
      { event: "b", data: "2", id: null },
    ]);
  });

  it("CRLF 가 청크 경계에서 갈려도 빈 줄을 하나 더 만들지 않는다", () => {
    const parser = new SseParser();
    const a = parser.push("data: 1\r");
    const b = parser.push("\ndata: 2\r\n\r\n");
    expect([...a, ...b]).toEqual([{ event: null, data: "1\n2", id: null }]);
  });

  it("한 줄이 여러 청크로 갈려도 이어 붙인다(큰 data URI 줄)", () => {
    const parser = new SseParser();
    const big = "x".repeat(50_000);
    const line = `data: {"url":"data:image/png;base64,${big}"}\n\n`;
    const events = [] as ReturnType<SseParser["push"]>;
    for (let i = 0; i < line.length; i += 777) events.push(...parser.push(line.slice(i, i + 777)));
    expect(events).toHaveLength(1);
    expect(events[0].data.length).toBe(line.length - "data: ".length - 2);
  });

  it("flush 는 빈 줄로 끝나지 않은 마지막 이벤트도 내보낸다", () => {
    const parser = new SseParser();
    expect(parser.push("event: tail\ndata: last")).toEqual([]);
    expect(parser.flush()).toEqual([{ event: "tail", data: "last", id: null }]);
  });
});

describe("readSseStream 바이트 청크", () => {
  it("한글 글자의 UTF-8 바이트가 청크 경계에서 갈려도 깨지지 않는다", async () => {
    const bytes = new TextEncoder().encode('event: text\ndata: {"delta":"분석"}\n\n');
    // '분' 은 3바이트다. 그 가운데에서 자른다.
    const cut = bytes.indexOf(0xeb) + 1;
    const events = await collect(streamOf([bytes.slice(0, cut), bytes.slice(cut)]));
    expect(events).toEqual([{ event: "text", data: '{"delta":"분석"}' }]);
  });

  it("이벤트가 여러 청크에 걸쳐 오고 한 청크에 여러 이벤트가 와도 순서대로 나온다", async () => {
    const events = await collect(
      streamOf(["event: a\nda", "ta: 1\n", "\nevent: b\ndata: 2\n\nevent: c\n", "data: 3\n\n"])
    );
    expect(events.map((e) => `${e.event}:${e.data}`)).toEqual(["a:1", "b:2", "c:3"]);
  });

  it("스트림이 빈 줄 없이 끝나도 마지막 이벤트를 놓치지 않는다", async () => {
    const events = await collect(streamOf(["data: 1\n\ndata: 2"]));
    expect(events.map((e) => e.data)).toEqual(["1", "2"]);
  });

  it("formatSseEvent 로 만든 문자열을 그대로 다시 읽는다", async () => {
    const payload = { message: { content: "결과\n두 줄", timestamp: "t" } };
    const events = await collect(streamOf([formatSseEvent("done", payload)]));
    expect(events).toEqual([{ event: "done", data: JSON.stringify(payload) }]);
  });
});
