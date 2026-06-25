import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const CHUNK_RELOAD_KEY = 'vs_chunk_reload_attempt';

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch dynamically imported module|Loading chunk \d+ failed|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );
}

/** Retry lazy imports and hard-reload once when a stale deploy hash is cached. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const module = await factory();
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        // ignore
      }
      return module;
    } catch (error) {
      if (!isChunkLoadError(error)) throw error;

      let reloaded = false;
      try {
        reloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1';
      } catch {
        // ignore
      }

      if (!reloaded) {
        try {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
        } catch {
          // ignore
        }
        window.location.reload();
        await new Promise(() => {
          // wait for navigation
        });
      }

      throw error;
    }
  });
}

export function installChunkLoadRecovery(): void {
  window.addEventListener('vite:preloadError', () => {
    window.location.reload();
  });
}
