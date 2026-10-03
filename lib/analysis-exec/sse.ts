/**
 * Server-Sent Events 파서 (이슈 #545)
 *
 * 두 곳에서 쓴다.
 *   - 서버: OpenAI Responses API 스트림(`stream: true`)을 raw fetch 로 읽는다.
 *   - 브라우저: `/api/chat/analysis` 가 보내는 진행 이벤트를 읽는다.
 *
 * 그래서 Node 전용 API 를 쓰지 않는다. 규격(WHATWG HTML, server-sent events)의 필요한 부분만 따른다:
 *   - 줄 끝은 `\n`, `\r\n`, `\r` 셋 다 받는다. 청크가 `\r` 로 끝나면 다음 청크가 `\n` 으로 시작할 수 있어 보류한다.
 *   - 빈 줄에서 이벤트 하나가 끝난다. `data` 줄이 여럿이면 `\n` 으로 잇는다.
 *   - `:` 로 시작하는 줄은 주석(하트비트)이라 버린다.
 *   - 필드 이름 뒤 콜론 다음의 공백 하나만 지운다.
 *   - `data` 가 하나도 없는 이벤트는 내보내지 않는다.
 *
 * 바이트를 문자열로 바꾸는 일은 호출부가 `TextDecoder(stream: true)` 로 한다. 한글처럼 여러 바이트인 글자가
 * 청크 경계에서 잘려도 깨지지 않게 하려는 것이다(`readSseStream` 이 그렇게 한다).
 */

export type SseEvent = {
  /** `event:` 필드. 없으면 null. */
  event: string | null;
  /** `data:` 줄들을 `\n` 으로 이은 값. */
  data: string;
  /** `id:` 필드. 없으면 null. */
  id: string | null;
};

export class SseParser {
  private buffer = "";
  private eventName: string | null = null;
  private dataLines: string[] = [];
  private lastId: string | null = null;

  /** 청크 하나를 넣고 그 안에서 끝난 이벤트들을 돌려준다. */
  push(chunk: string): SseEvent[] {
    if (chunk.length === 0) return [];
    this.buffer += chunk;
    return this.drain(false);
  }

  /** 스트림이 끝났을 때 남은 줄을 처리한다. 빈 줄로 끝나지 않은 마지막 이벤트도 내보낸다. */
  flush(): SseEvent[] {
    const events = this.drain(true);
    if (this.buffer.length > 0) {
      const ev = this.processLine(this.buffer);
      this.buffer = "";
      if (ev) events.push(ev);
    }
    const tail = this.dispatch();
    if (tail) events.push(tail);
    return events;
  }

  private drain(final: boolean): SseEvent[] {
    const events: SseEvent[] = [];
    let start = 0;
    const buf = this.buffer;
    for (let i = 0; i < buf.length; i++) {
      const ch = buf.charCodeAt(i);
      if (ch !== 10 && ch !== 13) continue; // \n, \r
      if (ch === 13 && i === buf.length - 1 && !final) {
        // `\r\n` 이 청크 경계에서 갈렸을 수 있다. 다음 청크를 기다린다.
        break;
      }
      const line = buf.slice(start, i);
      if (ch === 13 && buf.charCodeAt(i + 1) === 10) i++; // \r\n 은 줄 끝 하나
      start = i + 1;
      const ev = this.processLine(line);
      if (ev) events.push(ev);
    }
    this.buffer = buf.slice(start);
    return events;
  }

  /** 한 줄을 처리한다. 빈 줄이면 쌓인 이벤트를 내보낸다. */
  private processLine(line: string): SseEvent | null {
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) return null;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "data") this.dataLines.push(value);
    else if (field === "event") this.eventName = value;
    else if (field === "id") this.lastId = value.includes("\u0000") ? this.lastId : value;
    // retry 와 모르는 필드는 버린다.
    return null;
  }

  private dispatch(): SseEvent | null {
    if (this.dataLines.length === 0) {
      this.eventName = null;
      return null;
    }
    const ev: SseEvent = { event: this.eventName, data: this.dataLines.join("\n"), id: this.lastId };
    this.eventName = null;
    this.dataLines = [];
    return ev;
  }
}

/**
 * 바이트 스트림을 SSE 이벤트로 읽는다. 다 읽거나 `signal` 이 취소되면 끝난다.
 * UTF-8 은 `TextDecoder` 의 stream 모드로 풀어 청크 경계에서 글자가 깨지지 않는다.
 */
export async function* readSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  const parser = new SseParser();
  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      for (const ev of parser.push(decoder.decode(value, { stream: true }))) {
        yield ev;
      }
    }
    for (const ev of parser.push(decoder.decode())) yield ev;
    for (const ev of parser.flush()) yield ev;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // 이미 끝난 스트림이면 무시한다.
    }
    try {
      reader.releaseLock();
    } catch {
      // 잠금이 이미 풀렸으면 무시한다.
    }
  }
}

/** SSE 이벤트 하나를 문자열로 만든다(서버가 브라우저에 보낼 때). */
export function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** 하트비트 주석. 브라우저와 중간 프록시가 오래 조용한 연결을 끊지 않게 한다. */
export const SSE_HEARTBEAT = ": keep-alive\n\n";
