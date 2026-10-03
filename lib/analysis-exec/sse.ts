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
 *
 * 긴 줄(그림 data URI 가 든 `response.completed` 는 수 MB 한 줄이다)에서도 처리 시간이 줄 길이에 비례하게 한다.
 * 줄 끝이 없는 청크는 이어 붙이지 않고 모아 두기만 하고, 줄 끝을 찾을 때는 이미 훑은 앞부분을 다시 훑지 않는다.
 * 그렇지 않으면 청크마다 쌓인 버퍼를 처음부터 다시 훑어 줄 길이의 제곱만큼 걸린다(6MB 한 줄에 4.5초, 리뷰 실측).
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
  /**
   * 아직 끝나지 않은 줄의 조각들. 이어 붙이지 않고 모아 둔다. 줄 끝 문자는 들어 있지 않다. 다만 마지막 조각이 `\r` 로
   * 끝날 수 있다(`\r\n` 이 청크 경계에서 갈렸을 수 있어 보류한 것, `heldCR`).
   */
  private parts: string[] = [];
  private partsLength = 0;
  private heldCR = false;
  private eventName: string | null = null;
  private dataLines: string[] = [];
  private lastId: string | null = null;

  /** 청크 하나를 넣고 그 안에서 끝난 이벤트들을 돌려준다. */
  push(chunk: string): SseEvent[] {
    if (chunk.length === 0) return [];
    if (!this.heldCR && chunk.indexOf("\n") === -1 && chunk.indexOf("\r") === -1) {
      // 줄 끝이 없다. 모아 두기만 한다(앞부분을 다시 훑지 않는다).
      this.parts.push(chunk);
      this.partsLength += chunk.length;
      return [];
    }
    // 앞 조각에는 줄 끝이 없으므로(보류한 `\r` 하나 말고는) 그 끝에서부터 훑는다.
    const scanFrom = this.heldCR ? this.partsLength - 1 : this.partsLength;
    const buf = this.parts.length > 0 ? this.parts.join("") + chunk : chunk;
    return this.drain(buf, scanFrom, false);
  }

  /** 스트림이 끝났을 때 남은 줄을 처리한다. 빈 줄로 끝나지 않은 마지막 이벤트도 내보낸다. */
  flush(): SseEvent[] {
    const buf = this.parts.join("");
    const scanFrom = this.heldCR ? this.partsLength - 1 : this.partsLength;
    const events = buf.length > 0 ? this.drain(buf, scanFrom, true) : [];
    if (this.partsLength > 0) {
      const ev = this.processLine(this.parts.join(""));
      this.setRemainder("");
      if (ev) events.push(ev);
    }
    const tail = this.dispatch();
    if (tail) events.push(tail);
    return events;
  }

  private setRemainder(remainder: string): void {
    this.parts = remainder.length > 0 ? [remainder] : [];
    this.partsLength = remainder.length;
    this.heldCR = remainder.length > 0 && remainder.charCodeAt(remainder.length - 1) === 13;
  }

  /**
   * `buf` 에서 끝난 줄을 처리하고 남은 조각을 보관한다. `scanFrom` 앞에는 줄 끝이 없다. 다음 `\n` 과 `\r` 의 위치를
   * 기억해 두고 지나간 것만 다시 찾으므로 전체가 선형이다.
   */
  private drain(buf: string, scanFrom: number, final: boolean): SseEvent[] {
    const events: SseEvent[] = [];
    let start = 0;
    let pos = Math.max(0, scanFrom);
    let nextLF = buf.indexOf("\n", pos);
    let nextCR = buf.indexOf("\r", pos);
    while (true) {
      if (nextLF !== -1 && nextLF < pos) nextLF = buf.indexOf("\n", pos);
      if (nextCR !== -1 && nextCR < pos) nextCR = buf.indexOf("\r", pos);
      const end = nextLF === -1 ? nextCR : nextCR === -1 ? nextLF : Math.min(nextLF, nextCR);
      if (end === -1) break;
      const isCR = end === nextCR;
      if (isCR && end === buf.length - 1 && !final) {
        // `\r\n` 이 청크 경계에서 갈렸을 수 있다. 다음 청크를 기다린다.
        break;
      }
      const line = buf.slice(start, end);
      let next = end + 1;
      if (isCR && buf.charCodeAt(next) === 10) next++; // \r\n 은 줄 끝 하나
      start = next;
      pos = next;
      const ev = this.processLine(line);
      if (ev) events.push(ev);
    }
    this.setRemainder(start === 0 ? buf : buf.slice(start));
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
