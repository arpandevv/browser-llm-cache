export class OPFSStore {
  private directoryName = 'browser-llm-cache';

  constructor() {}

  /**
   * Check if OPFS is supported in the current environment
   */
  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 
           typeof navigator.storage !== 'undefined' && 
           typeof navigator.storage.getDirectory === 'function';
  }

  /**
   * Gets the root directory handle for our cache
   */
  private async getDirectory(): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(this.directoryName, { create: true });
  }

  /**
   * Converts a URL to a safe file name using base64 encoding (replacing slashes)
   */
  private getSafeFileName(url: string): string {
    return btoa(url).replace(/\//g, '_').replace(/\+/g, '-');
  }

  /**
   * Gets the current size of a file in bytes. Returns 0 if it doesn't exist.
   */
  public async getFileSize(url: string): Promise<number> {
    try {
      const dir = await this.getDirectory();
      const filename = this.getSafeFileName(url);
      const handle = await dir.getFileHandle(filename, { create: false });
      const file = await handle.getFile();
      return file.size;
    } catch (e) {
      // File doesn't exist or OPFS error
      return 0;
    }
  }

  /**
   * Returns a writable stream to the file. If append is true, it seeks to the end of the file.
   */
  public async createWritableStream(url: string, append: boolean = false): Promise<FileSystemWritableFileStream> {
    const dir = await this.getDirectory();
    const filename = this.getSafeFileName(url);
    const handle = await dir.getFileHandle(filename, { create: true });
    
    // In Chrome/Edge OPFS, keepExistingData is required to append
    const writable = await handle.createWritable({ keepExistingData: append });
    
    if (append) {
      const file = await handle.getFile();
      await writable.seek(file.size);
    }
    
    return writable;
  }

  /**
   * Reads a file from OPFS and returns it as a Response object (similar to Cache API)
   */
  public async read(url: string): Promise<Response | null> {
    try {
      const dir = await this.getDirectory();
      const filename = this.getSafeFileName(url);
      const handle = await dir.getFileHandle(filename, { create: false });
      const file = await handle.getFile();
      
      // Return as a response so it matches the CacheStorage API format used everywhere else
      return new Response(file);
    } catch {
      return null;
    }
  }

  /**
   * Deletes a file from OPFS
   */
  public async delete(url: string): Promise<void> {
    try {
      const dir = await this.getDirectory();
      const filename = this.getSafeFileName(url);
      await dir.removeEntry(filename);
    } catch {
      // Ignore if not found
    }
  }

  /**
   * Clears the entire OPFS cache directory
   */
  public async clear(): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(this.directoryName, { recursive: true });
    } catch {
      // Ignore
    }
  }
}
