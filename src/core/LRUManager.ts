import { MetadataStore } from './MetadataStore';
import { ModelCacheManager } from './ModelCacheManager';

export class LRUManager {
  private metadataStore = new MetadataStore();
  private cacheManager: ModelCacheManager;

  constructor(cacheManager: ModelCacheManager) {
    this.cacheManager = cacheManager;
  }

  /**
   * Enforces a maximum storage quota in bytes.
   * If the current storage exceeds maxBytes, it deletes the least recently accessed files
   * until the total storage is below the quota.
   * 
   * @param maxBytes Maximum allowed storage in bytes
   * @returns Total bytes freed during eviction
   */
  public async enforceQuota(maxBytes: number): Promise<number> {
    const records = await this.metadataStore.getAllRecords();
    
    let totalStorage = records.reduce((sum, record) => sum + record.contentLength, 0);
    
    if (totalStorage <= maxBytes) {
      return 0; // Under quota, nothing to do
    }

    // Sort by last accessed, oldest first
    records.sort((a, b) => a.lastAccessed - b.lastAccessed);

    let freedBytes = 0;

    for (const record of records) {
      if (totalStorage <= maxBytes) {
        break; // Target reached
      }

      await this.cacheManager.delete(record.url, record.backend);
      totalStorage -= record.contentLength;
      freedBytes += record.contentLength;
    }

    return freedBytes;
  }

  /**
   * Utility to get current storage usage across both OPFS and Cache APIs
   */
  public async getCurrentUsage(): Promise<number> {
    const records = await this.metadataStore.getAllRecords();
    return records.reduce((sum, record) => sum + record.contentLength, 0);
  }
}
