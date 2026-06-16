import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { ProgressiveHash } from '../src/core/ProgressiveHash';

describe('ProgressiveHash', () => {
  const getExpectedHash = (data: Buffer | string) => {
    return crypto.createHash('sha256').update(data).digest('hex');
  };

  it('should hash empty input correctly', () => {
    const input = new Uint8Array(0);
    const hasher = new ProgressiveHash();
    hasher.update(input);
    expect(hasher.digest()).toBe(getExpectedHash(''));
  });

  it('should hash a simple string correctly', () => {
    const str = 'Hello, world! This is a test for our progressive hashing implementation.';
    const input = new TextEncoder().encode(str);
    const hasher = new ProgressiveHash();
    hasher.update(input);
    expect(hasher.digest()).toBe(getExpectedHash(str));
  });

  it('should hash inputs of exact block size (64 bytes)', () => {
    const input = new Uint8Array(64).fill(0xaa);
    const hasher = new ProgressiveHash();
    hasher.update(input);
    expect(hasher.digest()).toBe(getExpectedHash(Buffer.from(input)));
  });

  it('should hash inputs that span multiple blocks in multiple chunks', () => {
    const rawData = crypto.randomBytes(2048);
    const input = new Uint8Array(rawData);

    const hasher = new ProgressiveHash();
    
    // Chunk sizes: 17, 128, 55, 1000, rest
    hasher.update(input.subarray(0, 17));
    hasher.update(input.subarray(17, 145));
    hasher.update(input.subarray(145, 200));
    hasher.update(input.subarray(200, 1200));
    hasher.update(input.subarray(1200));

    expect(hasher.digest()).toBe(getExpectedHash(rawData));
  });

  it('should hash larger random data correctly', () => {
    const rawData = crypto.randomBytes(10000);
    const input = new Uint8Array(rawData);

    const hasher = new ProgressiveHash();
    // Simulate streaming chunks of variable size
    let offset = 0;
    while (offset < input.length) {
      const chunkSize = Math.floor(Math.random() * 256) + 1; // 1 to 256 bytes
      hasher.update(input.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    }

    expect(hasher.digest()).toBe(getExpectedHash(rawData));
  });
});
