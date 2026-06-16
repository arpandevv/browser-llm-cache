import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetadataStore } from '../src/core/MetadataStore';

describe('MetadataStore', () => {
  let mockStore: any;
  let mockTransaction: any;
  let mockDb: any;
  let mockOpenRequest: any;

  beforeEach(() => {
    mockStore = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
    };

    mockTransaction = {
      objectStore: vi.fn().mockReturnValue(mockStore),
    };

    mockDb = {
      objectStoreNames: {
        contains: vi.fn().mockReturnValue(true),
      },
      transaction: vi.fn().mockReturnValue(mockTransaction),
    };

    mockOpenRequest = {};
    
    // Stub global indexedDB
    (global as any).indexedDB = {
      open: vi.fn().mockReturnValue(mockOpenRequest),
    };
  });

  it('should get metadata record', async () => {
    const store = new MetadataStore();
    
    // Simulate database open success
    setTimeout(() => {
      mockOpenRequest.result = mockDb;
      mockOpenRequest.onsuccess();
    }, 0);

    // Simulate get request success
    const mockGetRequest: any = {};
    mockStore.get.mockReturnValue(mockGetRequest);
    setTimeout(() => {
      mockGetRequest.result = { url: 'http://test.com', sha256: 'xyz' };
      mockGetRequest.onsuccess();
    }, 10);

    const record = await store.getRecord('http://test.com');
    expect(record).toEqual({ url: 'http://test.com', sha256: 'xyz' });
    expect(mockDb.transaction).toHaveBeenCalledWith('files', 'readonly');
    expect(mockStore.get).toHaveBeenCalledWith('http://test.com');
  });

  it('should set metadata record', async () => {
    const store = new MetadataStore();
    
    setTimeout(() => {
      mockOpenRequest.result = mockDb;
      mockOpenRequest.onsuccess();
    }, 0);

    const mockPutRequest: any = {};
    mockStore.put.mockReturnValue(mockPutRequest);
    setTimeout(() => {
      mockPutRequest.onsuccess();
    }, 10);

    const record = { url: 'http://test.com', sha256: 'xyz', etag: '123', contentLength: 100, lastVerified: 123456 };
    await store.setRecord(record);
    
    expect(mockDb.transaction).toHaveBeenCalledWith('files', 'readwrite');
    expect(mockStore.put).toHaveBeenCalledWith(record);
  });

  it('should delete metadata record', async () => {
    const store = new MetadataStore();
    
    setTimeout(() => {
      mockOpenRequest.result = mockDb;
      mockOpenRequest.onsuccess();
    }, 0);

    const mockDeleteRequest: any = {};
    mockStore.delete.mockReturnValue(mockDeleteRequest);
    setTimeout(() => {
      mockDeleteRequest.onsuccess();
    }, 10);

    await store.deleteRecord('http://test.com');
    
    expect(mockDb.transaction).toHaveBeenCalledWith('files', 'readwrite');
    expect(mockStore.delete).toHaveBeenCalledWith('http://test.com');
  });

  it('should clear all metadata records', async () => {
    const store = new MetadataStore();
    
    setTimeout(() => {
      mockOpenRequest.result = mockDb;
      mockOpenRequest.onsuccess();
    }, 0);

    const mockClearRequest: any = {};
    mockStore.clear.mockReturnValue(mockClearRequest);
    setTimeout(() => {
      mockClearRequest.onsuccess();
    }, 10);

    await store.clear();
    
    expect(mockDb.transaction).toHaveBeenCalledWith('files', 'readwrite');
    expect(mockStore.clear).toHaveBeenCalled();
  });
});
