/**
 * Worker pool over `data` with a fixed concurrency limit.
 * Iterator pulls are serialized so one shared `AsyncIterable` / async generator is safe.
 */
export async function processParallel<T>({
  concurrency,
  data,
  fn,
}: {
  concurrency: number;
  data: Iterable<T> | AsyncIterable<T>;
  fn: (item: T) => void | Promise<void>;
}): Promise<void> {
  if (concurrency < 1) {
    throw new Error("processParallel: concurrency must be >= 1");
  }

  const dataEntries = valuesFrom(data);

  let pullGate = Promise.resolve();
  const safeNext = async () => {
    const prev = pullGate;
    let release!: () => void;
    pullGate = new Promise<void>((r) => {
      release = r;
    });
    await prev;
    try {
      return await dataEntries.next();
    } finally {
      release();
    }
  };

  const workers: Promise<void>[] = [];
  let error: Error | undefined;

  const workerFn = async () => {
    while (!error) {
      const result = await safeNext();
      if (result.done) break;

      try {
        await fn(result.value);
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
      }
    }
  };

  for (let i = 0; i < concurrency; i++) {
    workers.push(workerFn());
  }

  await Promise.all(workers);
  if (error) throw error;
}

async function* valuesFrom<T>(
  iterable: Iterable<T> | AsyncIterable<T>,
): AsyncGenerator<T> {
  for await (const entry of iterable) {
    yield entry;
  }
}
