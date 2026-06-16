export class ProgressiveHash {
  // initial values
  private h0 = 0x6a09e667;
  private h1 = 0xbb67ae85;
  private h2 = 0x3c6ef372;
  private h3 = 0xa54ff53a;
  private h4 = 0x510e527f;
  private h5 = 0x9b05688c;
  private h6 = 0x1f83d9ab;
  private h7 = 0x5be0cd19;

  // Constants
  private static readonly K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  private blockBuffer = new Uint8Array(64);
  private blockLength = 0;
  private bytesHashed = 0;

  constructor() {}

  public update(chunk: Uint8Array): void {
    let offset = 0;
    const length = chunk.length;
    this.bytesHashed += length;

    // If there is data in the buffer, fill it first
    if (this.blockLength > 0) {
      const bytesToCopy = Math.min(64 - this.blockLength, length);
      this.blockBuffer.set(chunk.subarray(0, bytesToCopy), this.blockLength);
      this.blockLength += bytesToCopy;
      offset += bytesToCopy;

      if (this.blockLength === 64) {
        this.processBlock(this.blockBuffer);
        this.blockLength = 0;
      }
    }

    // Process full blocks directly from the chunk
    while (offset + 64 <= length) {
      this.processBlock(chunk.subarray(offset, offset + 64));
      offset += 64;
    }

    // Buffer any remaining bytes
    if (offset < length) {
      this.blockBuffer.set(chunk.subarray(offset), 0);
      this.blockLength = length - offset;
    }
  }

  public digest(): string {
    // Finalize padding
    const totalBits = this.bytesHashed * 8;
    
    // Create final padding block(s)
    const padLength = (this.blockLength < 56) ? (64 - this.blockLength) : (128 - this.blockLength);
    const padding = new Uint8Array(padLength);
    padding[0] = 0x80;

    const high = Math.floor(totalBits / 0x100000000);
    const low = totalBits | 0;

    padding[padLength - 8] = (high >>> 24) & 0xff;
    padding[padLength - 7] = (high >>> 16) & 0xff;
    padding[padLength - 6] = (high >>> 8) & 0xff;
    padding[padLength - 5] = high & 0xff;
    padding[padLength - 4] = (low >>> 24) & 0xff;
    padding[padLength - 3] = (low >>> 16) & 0xff;
    padding[padLength - 2] = (low >>> 8) & 0xff;
    padding[padLength - 1] = low & 0xff;

    // Hash the padding
    this.update(padding);

    // Format the final 8 H words into a hex string
    const hex = (n: number) => {
      const s = (n >>> 0).toString(16);
      return '00000000'.substring(s.length) + s;
    };

    return (
      hex(this.h0) +
      hex(this.h1) +
      hex(this.h2) +
      hex(this.h3) +
      hex(this.h4) +
      hex(this.h5) +
      hex(this.h6) +
      hex(this.h7)
    );
  }

  private processBlock(block: Uint8Array): void {
    const W = new Uint32Array(64);
    
    // Initialize first 16 words in W from the block (big-endian)
    for (let i = 0; i < 16; i++) {
      const idx = i * 4;
      W[i] = (block[idx] << 24) | (block[idx + 1] << 16) | (block[idx + 2] << 8) | block[idx + 3];
    }

    // Extend the first 16 words into the remaining 48 words
    for (let i = 16; i < 64; i++) {
      const w15 = W[i - 15];
      const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
      
      const w2 = W[i - 2];
      const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
      
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }

    // Initialize working variables
    let a = this.h0;
    let b = this.h1;
    let c = this.h2;
    let d = this.h3;
    let e = this.h4;
    let f = this.h5;
    let g = this.h6;
    let h = this.h7;

    // Compression loop
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + ProgressiveHash.K[i] + W[i]) | 0;
      
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    // Add working variables to current hash values
    this.h0 = (this.h0 + a) | 0;
    this.h1 = (this.h1 + b) | 0;
    this.h2 = (this.h2 + c) | 0;
    this.h3 = (this.h3 + d) | 0;
    this.h4 = (this.h4 + e) | 0;
    this.h5 = (this.h5 + f) | 0;
    this.h6 = (this.h6 + g) | 0;
    this.h7 = (this.h7 + h) | 0;
  }
}
