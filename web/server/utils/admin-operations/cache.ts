export class OperationTimeoutError extends Error {
  constructor() {
    super('Operation timed out.')
    this.name = 'OperationTimeoutError'
  }
}

interface CacheEntry<T> {
  expiresAt: number
  value: Promise<T>
}

/** A process-local TTL cache that deduplicates concurrent async loads. */
export class PromiseTtlCache<K, V> {
  private readonly entries = new Map<K, CacheEntry<V>>()

  constructor(private readonly now: () => number = Date.now) {}

  getOrCreate(key: K, ttlMs: number, load: () => Promise<V>): Promise<V> {
    const existing = this.entries.get(key)
    if (existing && existing.expiresAt > this.now()) {
      return existing.value
    }

    let value: Promise<V>
    try {
      value = load()
    } catch (error) {
      value = Promise.reject(error)
    }

    const entry: CacheEntry<V> = {
      expiresAt: Number.POSITIVE_INFINITY,
      value,
    }
    this.entries.set(key, entry)

    void entry.value.then(
      () => {
        if (this.entries.get(key) === entry) {
          entry.expiresAt = this.now() + ttlMs
        }
      },
      () => {
        if (this.entries.get(key) === entry) {
          this.entries.delete(key)
        }
      },
    )

    return entry.value
  }
}

/** Bounds an operation even when the dependency ignores AbortSignal. */
export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  let timeout: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
      reject(new OperationTimeoutError())
    }, Math.max(1, timeoutMs))
    timeout.unref?.()
  })

  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      timeoutPromise,
    ])
  } catch (error) {
    if (timedOut) {
      throw new OperationTimeoutError()
    }
    throw error
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
