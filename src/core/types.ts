export interface DownloadProgress {
  loaded: number;
  total: number;
  percentage: number;
  speed: number; // Bytes per second
}

export type ProgressCallback = (progress: DownloadProgress) => void;

export interface ModelCacheOptions {
  sha256?: string;
  verifyOnLoad?: boolean;
  headers?: HeadersInit;
  signal?: AbortSignal;
  storageBackend?: 'cache' | 'opfs';
}

export interface CacheMetadata {
  url: string;
  etag: string | null;
  contentLength: number;
  sha256: string | null;
  lastVerified: number;
  lastAccessed: number;
  backend: 'cache' | 'opfs';
}
