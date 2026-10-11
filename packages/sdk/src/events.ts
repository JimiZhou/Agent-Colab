export type ProjectEvent = {
  id: string;
  sequence: number;
  type: string;
  at: string;
  [key: string]: unknown;
};
export type SyncStatus = "connecting" | "live" | "reconnecting" | "stopped";
export class SyncAccessError extends Error {
  constructor(public status: number) {
    super(`Project event access denied (${status})`);
  }
}
export interface WatchOptions {
  token?: string;
  after?: number;
  signal: AbortSignal;
  onStatus?: (status: SyncStatus) => void;
  retryMs?: number;
}

/** At-least-once across restarts. Persist sequence only after applying an event. */
export async function* watchProjectEvents(
  baseUrl: string,
  projectId: string,
  options: WatchOptions,
): AsyncGenerator<ProjectEvent> {
  let after = options.after ?? 0;
  if (!Number.isSafeInteger(after) || after < 0)
    throw Error("Invalid event cursor");
  let failures = 0;
  const status = (value: SyncStatus) => {
    if (!options.signal.aborted) options.onStatus?.(value);
  };
  try {
    while (!options.signal.aborted) {
      status(failures ? "reconnecting" : "connecting");
      const connection = new AbortController();
      const abort = () => connection.abort();
      options.signal.addEventListener("abort", abort, { once: true });
      let watchdog: ReturnType<typeof setTimeout>;
      const resetWatchdog = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => connection.abort(), 30000);
      };
      resetWatchdog();
      try {
        const response = await fetch(
          `${baseUrl.replace(/\/$/, "")}/api/projects/${encodeURIComponent(projectId)}/events/stream?after=${after}`,
          {
            headers: {
              Accept: "text/event-stream",
              "Last-Event-ID": String(after),
              ...(options.token
                ? { Authorization: `Bearer ${options.token}` }
                : {}),
            },
            signal: connection.signal,
            redirect: "error",
          },
        );
        if ([400, 401, 403, 404].includes(response.status))
          throw new SyncAccessError(response.status);
        if (
          !response.ok ||
          !response.body ||
          !response.headers.get("content-type")?.startsWith("text/event-stream")
        )
          throw Error("Event stream unavailable");
        status("live");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          while (!options.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            failures = 0;
            resetWatchdog();
            buffer += decoder.decode(value, { stream: true });
            if (buffer.length > 1024 * 1024)
              throw Error("Event frame exceeds limit");
            let end: number;
            while ((end = buffer.search(/\r?\n\r?\n/)) >= 0) {
              const frame = buffer.slice(0, end);
              buffer = buffer.slice(
                end + (buffer.slice(end).startsWith("\r\n") ? 4 : 2),
              );
              const lines = frame.split(/\r?\n/);
              if (!lines.some((line) => line === "event: activity")) continue;
              const data = lines
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trimStart())
                .join("\n");
              const event: ProjectEvent = JSON.parse(data);
              if (
                !Number.isSafeInteger(event.sequence) ||
                typeof event.type !== "string"
              )
                throw Error("Invalid event frame");
              if (event.sequence <= after) continue;
              yield event;
              after = event.sequence;
            }
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      } catch (error) {
        if (error instanceof SyncAccessError) {
          status("stopped");
          throw error;
        }
        if (options.signal.aborted) return;
      } finally {
        clearTimeout(watchdog!);
        options.signal.removeEventListener("abort", abort);
        connection.abort();
      }
      if (options.signal.aborted) return;
      status("reconnecting");
      const delay = Math.min(
        30000,
        (options.retryMs ?? 1000) * 2 ** Math.min(failures++, 5),
      );
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          options.signal.removeEventListener("abort", finish);
          resolve();
        };
        const timer = setTimeout(finish, delay);
        options.signal.addEventListener("abort", finish, { once: true });
        if (options.signal.aborted) finish();
      });
    }
  } finally {
    if (!options.signal.aborted) options.onStatus?.("stopped");
  }
}
