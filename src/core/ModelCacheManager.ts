import { ProgressiveHash } from './ProgressiveHash';
import { MetadataStore } from './MetadataStore';
import { OPFSStore } from './storage/OPFSStore';
import { DownloadProgress, ModelCacheOptions, ProgressCallback, CacheMetadata } from './types';

export class ModelCacheManager {
  private cacheName = 'browser-llm-cache';
  private metadataStore = new MetadataStore();
  private opfsStore = new OPFSStore();
  private activeDownloads = new Map<string, DownloadProgress>();
  private listeners = new Map<string, Set<ProgressCallback>>();

  constructor() {}

  public subscribe(url: string, callback: ProgressCallback): () => void {
    if (!this.listeners.has(url)) {
      this.listeners.set(url, new Set());
    }
    this.listeners.get(url)!.add(callback);

    const active = this.activeDownloads.get(url);
    if (active) {
      callback(active);
    }

    return () => {
      const urlListeners = this.listeners.get(url);
      if (urlListeners) {
        urlListeners.delete(callback);
        if (urlListeners.size === 0) {
          this.listeners.delete(url);
        }
      }
    };
  }

  private notifyProgress(url: string, progress: DownloadProgress) {
    this.activeDownloads.set(url, progress);
    const urlListeners = this.listeners.get(url);
    if (urlListeners) {
      for (const listener of urlListeners) {
        try {
          listener(progress);
        } catch (err) {
          console.error('Error in progress listener', err);
        }
      }
    }
  }

  public async has(url: string, expectedHash?: string, backend: 'cache' | 'opfs' = 'cache'): Promise<boolean> {
    try {
      let exists = false;
      if (backend === 'opfs') {
        exists = (await this.opfsStore.getFileSize(url)) > 0;
      } else {
        const cache = await caches.open(this.cacheName);
        const match = await cache.match(url);
        exists = !!match;
      }

      if (!exists) return false;

      if (expectedHash) {
        const metadata = await this.metadataStore.getRecord(url);
        if (metadata && metadata.sha256 === expectedHash) {
          return true;
        }
        return await this.verifyCachedFileHash(url, expectedHash, backend);
      }

      return true;
    } catch {
      return false;
    }
  }

  public async retrieve(url: string, options?: ModelCacheOptions): Promise<Response> {
    const backend = options?.storageBackend || 'cache';
    let cachedResponse: Response | null = null;
    let exists = false;

    if (backend === 'opfs' && this.opfsStore.isSupported()) {
      cachedResponse = await this.opfsStore.read(url);
      exists = !!cachedResponse;
    } else {
      const cache = await caches.open(this.cacheName);
      cachedResponse = await cache.match(url) || null;
      exists = !!cachedResponse;
    }

    if (exists && cachedResponse) {
      // Touch lastAccessed
      await this.metadataStore.updateLastAccessed(url);

      if (options?.sha256) {
        const metadata = await this.metadataStore.getRecord(url);
        const bypassVerification = metadata && metadata.sha256 === options.sha256 && !options.verifyOnLoad;

        if (bypassVerification) {
          return cachedResponse;
        }

        const isValid = await this.verifyCachedFileHash(url, options.sha256, backend, options.signal);
        if (isValid) {
          // Re-read because verifying consumed the body
          return backend === 'opfs' ? (await this.opfsStore.read(url))! : (await (await caches.open(this.cacheName)).match(url))!;
        } else {
          await this.delete(url, backend);
        }
      } else {
        return cachedResponse;
      }
    }

    return this.downloadAndCache(url, options);
  }

  private async downloadAndCache(url: string, options?: ModelCacheOptions): Promise<Response> {
    const signal = options?.signal;
    const backend = (options?.storageBackend === 'opfs' && this.opfsStore.isSupported()) ? 'opfs' : 'cache';
    
    let existingSize = 0;
    const fetchHeaders = new Headers(options?.headers);

    if (backend === 'opfs') {
      existingSize = await this.opfsStore.getFileSize(url);
      if (existingSize > 0) {
        fetchHeaders.set('Range', `bytes=${existingSize}-`);
      }
    }

    const response = await fetch(url, { headers: fetchHeaders, signal });

    // Handle range response (206 Partial Content) or full response (200 OK)
    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to fetch model file: ${response.statusText} (${response.status})`);
    }

    const isPartial = response.status === 206;
    if (!isPartial && backend === 'opfs') {
      // Server ignored range request, start from scratch
      existingSize = 0;
      await this.opfsStore.delete(url);
    }

    const contentLengthHeader = response.headers.get('Content-Length');
    const incomingLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
    const totalLength = isPartial ? existingSize + incomingLength : incomingLength;
    const etag = response.headers.get('ETag');

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body reader is not available');

    const hasher = options?.sha256 && !isPartial ? new ProgressiveHash() : null;
    if (isPartial && options?.sha256) {
      console.warn('Progressive hashing on resumed downloads is not fully supported yet; hash validation skipped for this attempt.');
    }

    let loaded = existingSize;
    const startTime = performance.now();
    let lastTime = startTime;
    let lastLoaded = loaded;
    let speed = 0;

    const opfsWriter = backend === 'opfs' ? await this.opfsStore.createWritableStream(url, isPartial) : null;
    const cacheChunks: Uint8Array[] = [];

    const stream = new ReadableStream<Uint8Array>({
      async start(controller: ReadableStreamDefaultController<Uint8Array>) {
        try {
          while (true) {
            if (signal?.aborted) {
              controller.error(new DOMException('Aborted', 'AbortError'));
              break;
            }

            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }

            loaded += value.byteLength;
            hasher?.update(value);

            if (opfsWriter) {
              await opfsWriter.write(value);
            } else {
              // Store chunks for Cache API (not ideal, but required since we need to consume stream to write and also hash)
              controller.enqueue(value);
            }

            const now = performance.now();
            const timeDiff = (now - lastTime) / 1000;
            if (timeDiff >= 0.25 || loaded === totalLength) {
              const loadedDiff = loaded - lastLoaded;
              speed = timeDiff > 0 ? loadedDiff / timeDiff : 0;
              lastTime = now;
              lastLoaded = loaded;

              const percentage = totalLength > 0 ? (loaded / totalLength) * 100 : 0;
              // Must use type assertion trick to call parent manager method
              (stream as any).notifyProgress(url, { loaded, total: totalLength, percentage, speed });
            }
          }
        } catch (err) {
          controller.error(err);
        }
      },
      notifyProgress: (url: string, progress: DownloadProgress) => {
        // Internal proxy for progress
      }
    } as any);

    // Wire up notify progress hack
    (stream as any).notifyProgress = this.notifyProgress.bind(this);

    try {
      if (opfsWriter) {
        // Just consume stream to pump to OPFS
        const pumpReader = stream.getReader();
        while (!(await pumpReader.read()).done) {}
        await opfsWriter.close();
      } else {
        // Cache API requires passing the response object
        const cache = await caches.open(this.cacheName);
        const responseToCache = new Response(stream, {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText
        });
        await cache.put(url, responseToCache);
      }
    } catch (err) {
      this.activeDownloads.delete(url);
      if (opfsWriter) await opfsWriter.close();
      throw err;
    }

    this.activeDownloads.delete(url);

    if (options?.sha256 && hasher) {
      const actualHash = hasher.digest();
      if (actualHash !== options.sha256) {
        await this.delete(url, backend);
        throw new Error(`Hash verification failed. Expected ${options.sha256}, got ${actualHash}`);
      }
      await this.metadataStore.setRecord({
        url, etag, contentLength: totalLength, sha256: actualHash, lastVerified: Date.now(), lastAccessed: Date.now(), backend
      });
    } else {
      await this.metadataStore.setRecord({
        url, etag, contentLength: totalLength, sha256: null, lastVerified: Date.now(), lastAccessed: Date.now(), backend
      });
    }

    const finalResponse = backend === 'opfs' ? await this.opfsStore.read(url) : (await (await caches.open(this.cacheName)).match(url)) || null;
    if (!finalResponse) throw new Error('Failed to retrieve response from cache after storing.');
    return finalResponse;
  }

  private async verifyCachedFileHash(url: string, expectedHash: string, backend: 'cache' | 'opfs', signal?: AbortSignal): Promise<boolean> {
    try {
      let match: Response | null = null;
      if (backend === 'opfs') {
        match = await this.opfsStore.read(url);
      } else {
        const cache = await caches.open(this.cacheName);
        match = (await cache.match(url)) || null;
      }

      if (!match) return false;
      const reader = match.body?.getReader();
      if (!reader) return false;

      const hasher = new ProgressiveHash();
      let loaded = 0;
      let total = backend === 'opfs' ? await this.opfsStore.getFileSize(url) : (parseInt(match.headers.get('Content-Length') || '0', 10));

      while (true) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const { done, value } = await reader.read();
        if (done) break;

        loaded += value.byteLength;
        hasher.update(value);
        this.notifyProgress(url, { loaded, total, percentage: total > 0 ? (loaded / total) * 100 : 0, speed: 0 });
      }

      this.activeDownloads.delete(url);
      const actualHash = hasher.digest();

      if (actualHash === expectedHash) {
        await this.metadataStore.setRecord({
          url, etag: match.headers.get('ETag'), contentLength: total, sha256: actualHash, lastVerified: Date.now(), lastAccessed: Date.now(), backend
        });
        return true;
      }
      return false;
    } catch {
      this.activeDownloads.delete(url);
      return false;
    }
  }

  public async delete(url: string, backend?: 'cache' | 'opfs'): Promise<void> {
    if (backend === 'opfs' || !backend) await this.opfsStore.delete(url);
    if (backend === 'cache' || !backend) {
      const cache = await caches.open(this.cacheName);
      await cache.delete(url);
    }
    await this.metadataStore.deleteRecord(url);
    this.activeDownloads.delete(url);
  }

  public async clear(): Promise<void> {
    await caches.delete(this.cacheName);
    await this.opfsStore.clear();
    await this.metadataStore.clear();
    this.activeDownloads.clear();
  }

  public getCustomFetch(defaultOptions?: ModelCacheOptions) {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : 'url' in input ? input.url : input.toString();
      const method = init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET');
      if (method !== 'GET') return fetch(input, init);

      try {
        const options: ModelCacheOptions = {
          ...defaultOptions,
          signal: init?.signal || defaultOptions?.signal,
          headers: { ...defaultOptions?.headers, ...init?.headers }
        };
        return await this.retrieve(url, options);
      } catch (err) {
        return fetch(input, init);
      }
    };
  }
}

export const modelCache = new ModelCacheManager();
