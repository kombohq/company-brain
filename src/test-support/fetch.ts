import { spyOn } from "bun:test";

/** Maps a requested URL to the response the stubbed `fetch` returns. */
export type FetchHandler = (url: string) => Response | Promise<Response>;

/** Replace the global `fetch` with `handler`; pair with `mock.restore()` to undo it. */
export function stubFetch(handler: FetchHandler): void {
  // Bun types `fetch` with a `preconnect` method a plain function can't satisfy, so
  // the cast is unavoidable; confining it here keeps every test's stub clean.
  spyOn(globalThis, "fetch").mockImplementation((async (
    input: string | URL | Request,
  ) =>
    handler(
      String(input instanceof Request ? input.url : input),
    )) as typeof fetch);
}
