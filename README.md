<div align="center">
  <h1>🤖 browser-llm-cache</h1>
  <p>
    <b>Low-RAM, resumable, and hash-verified cache for large model weights running client-side.</b>
  </p>
  <p>
    <a href="https://www.npmjs.com/package/browser-llm-cache"><img src="https://img.shields.io/npm/v/browser-llm-cache?color=blue&logo=npm" alt="npm version" /></a>
    <img src="https://img.shields.io/badge/Language-TypeScript-blue?logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
    <img src="https://img.shields.io/badge/Zero-Dependencies-success" alt="Zero Dependencies" />
  </p>
  <br/>
</div>

Modern browsers can run incredibly powerful AI models locally using WebGPU and Web Assembly (via libraries like `@huggingface/transformers` or `web-llm`). However, downloading gigabytes of weight files (like `.safetensors` or `.onnx`) poses significant challenges:

> 🛑 **Memory Overload:** Downloading a 2GB file directly into JavaScript RAM can crash browser tabs (especially on mobile devices).
>
> 🛑 **Fragile Downloads:** If a 4GB download drops at 3.9GB, standard `fetch` forces the user to start all over from 0%.
>
> 🛑 **Storage Limits:** Users downloading multiple models will quickly fill up their limited browser storage.

✨ **`browser-llm-cache` V2** solves these issues by intercepting streams, writing resumable zero-copy chunks directly to the **Origin Private File System (OPFS)**, and managing storage via an intelligent **LRU Eviction** engine.

---

## Features

*   📦 **Memory-Constant Caching:** Streams downloads directly to the browser's Cache Storage or OPFS disk, keeping JS heap memory flat regardless of file size.
*   🔄 **Resumable Downloads (Range Requests):** When using the OPFS backend, interrupted downloads automatically resume exactly where they left off via `HTTP Range` headers.
*   🧹 **Smart LRU Cache Eviction:** Set a `maxCacheQuota` to automatically evict the least recently used models when storage gets full.
*   ⚡ **Instant Cache Verification:** Verifies the cryptographic hash (`SHA-256`) chunk-by-chunk during the download. Subsequent loads verify against IndexedDB metadata, making cache hits instant.
*   🎣 **React Hooks Integration:** Track concurrent multi-file downloads with overall progress, file-by-file progress, speed tracking (bytes/sec), error states, and cancellation support.
*   🔌 **Library Agnostic / Transformers.js Ready:** Expose a custom `fetch` override that integrates directly into HuggingFace `transformers.js` or standard HTTP clients.

---

## Installation

```bash
npm install browser-llm-cache
```

---

## Quickstart (React)

Track and load a model with progress UI using the built-in React hook:

```tsx
import React from 'react';
import { useModelLoader } from 'browser-llm-cache';

const MODEL_FILES = [
  'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx',
  'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer.json'
];

export function ModelLoaderComponent() {
  const {
    isReady,
    isDownloading,
    overallProgress,
    error,
    startDownload,
    cancel,
    enforceQuota
  } = useModelLoader(MODEL_FILES, {
    autoStart: false, // Kick off manually
    storageBackend: 'opfs', // Enables resumable downloads and fast file handles
    maxCacheQuota: 2 * 1024 * 1024 * 1024 // 2GB limit (triggers LRU eviction if exceeded)
  });

  return (
    <div className="card">
      <h3>Model Asset Loader</h3>
      
      {!isDownloading && !isReady && (
        <button onClick={startDownload}>Download Model Assets</button>
      )}

      {isDownloading && (
        <div>
          <p>Downloading... {overallProgress.percentage.toFixed(1)}%</p>
          <div className="progress-bar" style={{ width: `${overallProgress.percentage}%` }} />
          <p>Speed: {(overallProgress.speed / 1024 / 1024).toFixed(2)} MB/s</p>
          <button onClick={cancel}>Pause Download</button>
        </div>
      )}

      {isReady && <p>✅ All files loaded and verified!</p>}
      {error && <p className="error">Error: {error.message}</p>}
    </div>
  );
}
```

---

## HuggingFace / Transformers.js Integration

Directly override the default fetch engine of `@huggingface/transformers` to track downloads and secure assets:

```typescript
import { env, pipeline } from '@huggingface/transformers';
import { modelCache } from 'browser-llm-cache';

// 1. Redirect Transformers.js fetch call to our caching manager
env.fetch = modelCache.getCustomFetch({
  storageBackend: 'opfs',
  verifyOnLoad: false // Skips SHA-256 calculation for instant local loads
});

// 2. Subscribe to progress updates for the model files
const unsubscribe = modelCache.subscribe(
  'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx',
  (progress) => {
    console.log(`Model Weight Download: ${progress.percentage.toFixed(1)}%`);
  }
);

// 3. Run the pipeline as usual (will stream-cache to OPFS on first run)
const classifier = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

// Clean up listener when no longer needed
unsubscribe();
```

---

## API Reference

### `ModelCacheManager` (Shared Instance: `modelCache`)

#### `retrieve(url, options)`
Downloads a URL and stores it in the OPFS or Cache API if it is not already cached.
*   **Options:**
    *   `storageBackend`: `'opfs' | 'cache'` - Uses OPFS (resumable) or Cache API. Defaults to `'cache'`.
    *   `sha256`: `string` - Expected SHA-256 checksum. If download doesn't match, throws error and deletes cache file.
    *   `verifyOnLoad`: `boolean` - If true, always reads cached file and recalculates SHA-256 rather than relying on IndexedDB metadata match.
*   **Returns:** `Promise<Response>`

#### `getCustomFetch(defaultOptions)`
Returns a fetch adapter function compatible with the browser `fetch` standard. Useful for injecting into WebLLM or Transformers.js.

### `LRUManager` (Shared Instance: `lruManager`)

#### `enforceQuota(maxBytes: number)`
Checks the total storage consumed by all models. If it exceeds `maxBytes`, it sorts the cached files by their `lastAccessed` timestamp and deletes the oldest ones until the storage falls below the quota.
*   **Returns:** `Promise<number>` - Total bytes freed during eviction.

---

## License

MIT
