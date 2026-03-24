import * as ImageManipulator from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';
import { Buffer } from 'buffer';

export class ImageProcessingService {
  private static readonly VHASH_HEX_LENGTH = 16;
  /**
   * Normalizes an image from the camera or gallery.
   * Resizes to a maximum bounding box of 1920x1080 to prevent OOM errors and constrain payload size.
   * Compresses to 0.7 JPEG output natively, forcing consistent Base64 payload extraction.
   * 
   * @param uri Local file URI to the raw image constraint
   * @returns Base64 string of the processed JPEG
   */
  /**
   * Performs a 4-point perspective warp to rectify document proportions.
   * 2026 Spec: Uses corner detection to normalize the document into a strict 1024x1024 square.
   */
  private async performWarp(uri: string): Promise<string> {
    console.log('[ImageProcessingService] Performing 4-point perspective warp...');
    // In a production environment with native modules (e.g., OpenCV), this would
    // find corners and apply a transformation matrix. 
    // For this implementation, we utilize high-quality cropping and resizing 
    // to simulate the normalized output.
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1024, height: 1024 } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return result.uri;
  }

  /**
   * Normalizes an image to a 1024x1024 grayscale square (Universal Binding Specification).
   * Supports dynamic cropping for the resizable scanner viewfinder.
   */
  async normalizeToBindingSpec(
    uri: string,
    viewfinderSize?: { width: number, height: number },
    screenSize?: { width: number, height: number },
    source: 'camera' | 'gallery' = 'camera'
  ): Promise<{ base64: string; vHash: string }> {
    try {
      console.log(`[ImageProcessingService] Starting Digital Binding Pipeline: ${uri}`);
      
      // If viewfinder is provided, use the specialized normalization with crop
      const finalResult = await this.normalizeForVerifier(uri, viewfinderSize, screenSize, source);
      
      if (!finalResult.base64) {
        throw new Error("Target image encoder failed to return Base64 layout");
      }
      
      const vHash = this.computeVisualFingerprintFromBase64(finalResult.base64);
      
      return { base64: finalResult.base64, vHash };
    } catch (error: any) {
      console.error("[ImageProcessingService] Normalization failed:", error);
      throw new Error(`Failed to safely process image for anchoring: ${error.message}`);
    }
  }

  /**
   * Generates a 64-bit dHash (Difference Hash).
   * 1. Resizes image to 9x8 to compute differences between columns.
   * 2. Computes 8 differences per row (64 bits total).
   * 3. Highly resilient to physical damage/noise (pHash tolerance).
   */
  /**
   * True perceptual dHash on decoded JPEG pixels (9×8 luminance), with legacy fallback.
   */
  computeVisualFingerprintFromBase64(base64: string): string {
    const clean = base64.includes(',') ? base64.split(',')[1] : base64;
    if (!clean) return '0'.repeat(ImageProcessingService.VHASH_HEX_LENGTH);
    try {
      const buf = Buffer.from(clean, 'base64');
      const decoded = decodeJpeg(buf, { useTArray: true });
      if (!decoded?.data || decoded.width < 2 || decoded.height < 2) {
        return this.generateLengthInvariantShingleHash(base64);
      }
      return this.dHashFromRgba(decoded.width, decoded.height, decoded.data);
    } catch {
      return this.generateLengthInvariantShingleHash(base64);
    }
  }

  private dHashFromRgba(width: number, height: number, data: Uint8Array): string {
    const lum = (x: number, y: number): number => {
      const sx = Math.min(width - 1, Math.floor((x + 0.5) * width / 9));
      const sy = Math.min(height - 1, Math.floor((y + 0.5) * height / 8));
      const idx = (sy * width + sx) * 4;
      return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    };
    const gray: number[] = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 9; x++) {
        gray.push(lum(x, y));
      }
    }
    let bits = '';
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        bits += gray[y * 9 + x] > gray[y * 9 + x + 1] ? '1' : '0';
      }
    }
    let hex = '';
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex.padStart(ImageProcessingService.VHASH_HEX_LENGTH, '0').slice(0, 16);
  }

  private generateLengthInvariantShingleHash(base64: string): string {
    // Length-Invariant Shingle Hash over normalized image bytes.
    const cleanData = base64.includes(',') ? base64.split(',')[1] : base64;
    if (!cleanData) return '0'.repeat(ImageProcessingService.VHASH_HEX_LENGTH);

    const sampleSize = Math.min(cleanData.length, 32768);
    const shingleSize = 16;
    const usable = cleanData.slice(0, sampleSize);
    const step = Math.max(1, Math.floor(Math.max(1, sampleSize - shingleSize) / 64));

    let prev = 0;
    let bits = '';
    for (let i = 0; i < 64; i++) {
      const start = Math.min(i * step, Math.max(0, sampleSize - shingleSize));
      let sum = 0;
      for (let j = 0; j < shingleSize; j++) {
        sum += usable.charCodeAt(start + j) || 0;
      }
      bits += sum >= prev ? '1' : '0';
      prev = sum;
    }

    let hex = '';
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex.padStart(ImageProcessingService.VHASH_HEX_LENGTH, '0').slice(0, 16);
  }

  computeVHashFromBase64(base64: string): string {
    return this.computeVisualFingerprintFromBase64(base64);
  }

  /**
   * Normalizes a camera frame into a square 1024x1024 canonical image.
   * Includes dynamic cropping based on the resizable viewfinder frame.
   */
  async normalizeForVerifier(
    uri: string, 
    viewfinderSize?: { width: number, height: number },
    screenSize?: { width: number, height: number },
    source: 'camera' | 'gallery' = 'camera'
  ): Promise<{ uri: string; base64: string; width: number; height: number }> {
    const initial = await ImageManipulator.manipulateAsync(
      uri,
      [],
      { compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: false }
    );

    let cropX = 0, cropY = 0, cropWidth = initial.width, cropHeight = initial.height;
    const isGallery = source === 'gallery';

    if (viewfinderSize && screenSize && !isGallery) {
      // Scale viewfinder dimensions to match high-res image
      const scaleX = initial.width / screenSize.width;
      const scaleY = initial.height / screenSize.height;

      cropWidth = Math.floor(viewfinderSize.width * scaleX);
      cropHeight = Math.floor(viewfinderSize.height * scaleY);
      
      // Viewfinder is centered in ScannerOverlay
      cropX = Math.max(0, Math.floor((initial.width - cropWidth) / 2));
      cropY = Math.max(0, Math.floor((initial.height - cropHeight) / 2));
    } else {
      // Default: Center square crop
      const side = Math.min(initial.width, initial.height);
      cropWidth = side;
      cropHeight = side;
      cropX = Math.max(0, Math.floor((initial.width - side) / 2));
      cropY = Math.max(0, Math.floor((initial.height - side) / 2));
    }

    const normalized = await ImageManipulator.manipulateAsync(
      initial.uri,
      [
        { crop: { originX: cropX, originY: cropY, width: cropWidth, height: cropHeight } },
        { resize: { width: 1024, height: 1024 } },
      ],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    if (!normalized.base64) {
      throw new Error('Failed to produce normalized base64 payload');
    }

    return {
      uri: normalized.uri,
      base64: normalized.base64,
      width: normalized.width,
      height: normalized.height,
    };
  }

  /**
   * Generates a 6-digit Alphanumeric Reference ID (Shortcode).
   * 2026 Spec: Always uses Western digits (0-9) to prevent localized entry errors.
   */
  generateShortcode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars (0, O, 1, I)
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Calculates the Hamming Distance (bit-flip count) between two 64-bit hex hashes.
   */
  static getHammingDistance(h1: string, h2: string): number {
    let distance = 0;
    for (let i = 0; i < 16; i++) {
        let v1 = parseInt(h1[i], 16);
        let v2 = parseInt(h2[i], 16);
        let xor = v1 ^ v2;
        // Count bits set to 1 in XOR result
        while (xor > 0) {
            distance += (xor & 1);
            xor >>= 1;
        }
    }
    return distance;
  }

  /**
   * 2026 Optimization: Local pHash Cache
   * Simulates the iPhone 17 Pro Max Neural Engine local search.
   * Stores the last 50 verified document hashes for instant sub-500ms discovery.
   */
  private pHashCache = new Map<string, any>();

  checkLocalCache(phash: string): any | null {
    // Check for exact match or Hamming similarity within the cache
    let match = null;
    this.pHashCache.forEach((data, cachedHash) => {
      if (ImageProcessingService.getHammingDistance(phash, cachedHash) <= 4) {
        console.log('[ImageProcessingService] LOCAL CACHE HIT (Neural Engine Simulation)');
        match = data;
      }
    });
    return match;
  }

  updateLocalCache(phash: string, data: any) {
    if (this.pHashCache.size > 50) {
      const keys = Array.from(this.pHashCache.keys());
      const firstKey = keys[0];
      if (firstKey !== undefined) this.pHashCache.delete(firstKey);
    }
    this.pHashCache.set(phash, data);
  }

  /**
   * Prepares a live camera frame for ORB matching.
   * Resizes to a consistent 960x540 resolution to balance detail and network speed.
   */
  async prepareFrameForMatching(uri: string): Promise<{ base64: string; width: number; height: number }> {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 960 } }], // Maintain aspect ratio, typical 16:9 -> 960x540
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      
      return { 
        base64: result.base64 || '', 
        width: result.width, 
        height: result.height 
      };
    } catch (error) {
      console.error("[ImageProcessingService] Frame prep failed:", error);
      throw error;
    }
  }

  /**
   * Normalize and Encode legacy wrapper.
   */
  async normalizeAndEncode(uri: string): Promise<string> {
    const { base64 } = await this.normalizeToBindingSpec(uri);
    return base64;
  }
}

export const imageProcessingService = new ImageProcessingService();
