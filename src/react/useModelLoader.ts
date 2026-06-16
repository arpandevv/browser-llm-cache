import { useState, useEffect, useCallback, useRef } from 'react';
import { modelCache } from '../core/ModelCacheManager';
import { DownloadProgress, ModelCacheOptions } from '../core/types';

import { LRUManager } from '../core/LRUManager';

const lruManager = new LRUManager(modelCache);

export interface UseModelLoaderOptions {
  autoStart?: boolean;
  hashes?: Record<string, string>; // Map of URL to SHA-256
  verifyOnLoad?: boolean;
  storageBackend?: 'cache' | 'opfs';
  maxCacheQuota?: number;
}

export function useModelLoader(
  urls: string | string[],
  options: UseModelLoaderOptions = {}
) {
  const { autoStart = true, hashes = {}, verifyOnLoad = false, storageBackend = 'cache', maxCacheQuota } = options;

  // Stable URL array
  const urlsArrayRef = useRef<string[]>([]);
  const newUrlsArray = Array.isArray(urls) ? urls : [urls];
  if (JSON.stringify(urlsArrayRef.current) !== JSON.stringify(newUrlsArray)) {
    urlsArrayRef.current = newUrlsArray;
  }

  // Stable hashes map
  const hashesRef = useRef<Record<string, string>>({});
  if (JSON.stringify(hashesRef.current) !== JSON.stringify(hashes)) {
    hashesRef.current = hashes;
  }

  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progresses, setProgresses] = useState<Record<string, DownloadProgress>>({});

  const progressRef = useRef<Record<string, DownloadProgress>>({});
  const abortControllerRef = useRef<AbortController | null>(null);

  const startDownload = useCallback(async () => {
    setError(null);
    setIsReady(false);
    setIsDownloading(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const currentUrls = urlsArrayRef.current;
    const currentHashes = hashesRef.current;

    // Initialize progress values
    const initialProgresses: Record<string, DownloadProgress> = {};
    for (const url of currentUrls) {
      initialProgresses[url] = {
        loaded: 0,
        total: 0,
        percentage: 0,
        speed: 0
      };
    }
    progressRef.current = initialProgresses;
    setProgresses({ ...initialProgresses });

    try {
      const downloadPromises = currentUrls.map(async (url) => {
        const expectedHash = currentHashes[url];
        const cacheOptions: ModelCacheOptions = {
          sha256: expectedHash,
          verifyOnLoad,
          signal,
          storageBackend
        };

        const unsubscribe = modelCache.subscribe(url, (progress) => {
          progressRef.current[url] = progress;
          setProgresses({ ...progressRef.current });
        });

        try {
          await modelCache.retrieve(url, cacheOptions);
        } finally {
          unsubscribe();
        }
      });

      await Promise.all(downloadPromises);

      if (maxCacheQuota) {
        await lruManager.enforceQuota(maxCacheQuota);
      }

      // Verify no other load was started in the meantime
      if (signal === abortControllerRef.current?.signal) {
        setIsReady(true);
        setIsDownloading(false);
      }
    } catch (err: any) {
      if (signal === abortControllerRef.current?.signal) {
        if (err.name === 'AbortError') {
          setIsDownloading(false);
          return;
        }
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsDownloading(false);
      }
    }
  }, [verifyOnLoad]);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsDownloading(false);
  }, []);

  const clear = useCallback(async () => {
    cancel();
    const deletePromises = urlsArrayRef.current.map((url) => modelCache.delete(url, options.storageBackend));
    await Promise.all(deletePromises);
    setIsReady(false);
    setProgresses({});
    progressRef.current = {};
  }, [cancel, options.storageBackend]);

  const enforceQuota = useCallback(async (maxBytes?: number) => {
    const quota = maxBytes || options.maxCacheQuota;
    if (quota) {
      return await lruManager.enforceQuota(quota);
    }
    return 0;
  }, [options.maxCacheQuota]);

  useEffect(() => {
    if (autoStart) {
      startDownload();
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [startDownload, autoStart]);

  // Aggregate stats
  const totalBytes = Object.values(progresses).reduce((acc, p) => acc + (p.total || 0), 0);
  const loadedBytes = Object.values(progresses).reduce((acc, p) => acc + (p.loaded || 0), 0);
  const overallPercentage = totalBytes > 0 ? (loadedBytes / totalBytes) * 100 : 0;
  const overallSpeed = Object.values(progresses).reduce((acc, p) => acc + p.speed, 0);

  return {
    isReady,
    isDownloading,
    progress: progresses,
    overallProgress: {
      loaded: loadedBytes,
      total: totalBytes,
      percentage: overallPercentage,
      speed: overallSpeed
    },
    error,
    startDownload,
    cancel,
    clear,
    enforceQuota
  };
}
