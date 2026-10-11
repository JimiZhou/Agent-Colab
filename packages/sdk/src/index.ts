import { watchProjectEvents, type WatchOptions } from "./events.js";
export { watchProjectEvents, SyncAccessError } from "./events.js";
export type { ProjectEvent, WatchOptions, SyncStatus } from "./events.js";
export class ColabClient {
  constructor(
    public baseUrl: string,
    private token?: string,
  ) {}
  watch(projectId: string, options: Omit<WatchOptions, "token">) {
    return watchProjectEvents(this.baseUrl, projectId, {
      ...options,
      token: this.token,
    });
  }
  async request(
    path: string,
    body?: unknown,
    key = crypto.randomUUID(),
  ): Promise<any> {
    const r = await fetch(this.baseUrl.replace(/\/$/, "") + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(this.token ? { Authorization: "Bearer " + this.token } : {}),
        ...(body === undefined
          ? {}
          : { "Content-Type": "application/json", "Idempotency-Key": key }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await r.json();
    if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(result.error)}`);
    return result;
  }
}
