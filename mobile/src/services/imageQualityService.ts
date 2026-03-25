import * as ImageManipulator from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';
import { Buffer } from 'buffer';

export interface QualityHint {
  passed: boolean;
  message?: string;
  type: 'resolution' | 'brightness' | 'blur';
}

export class ImageQualityService {
  private static readonly MIN_RESOLUTION = 1000; // 1k min for binding
  private static readonly MIN_BRIGHTNESS = 40;   // 0-255 scale

  /**
   * Performs a lightweight local assessment of the captured document.
   * Provides immediate feedback to the user before the expensive signing process.
   */
  async checkQualityHints(uri: string): Promise<QualityHint[]> {
    const hints: QualityHint[] = [];
    
    try {
      // 1. Check Resolution
      const image = await ImageManipulator.manipulateAsync(uri, [], { base64: true });
      if (image.width < ImageQualityService.MIN_RESOLUTION || image.height < ImageQualityService.MIN_RESOLUTION) {
        hints.push({ 
          passed: false, 
          message: 'Low resolution. Please move closer.', 
          type: 'resolution' 
        });
      }

      // 2. Rough Brightness check
      if (image.base64) {
        const avgBrightness = this.calculateBrightness(image.base64);
        if (avgBrightness < ImageQualityService.MIN_BRIGHTNESS) {
          hints.push({ 
            passed: false, 
            message: 'Too dark. Please find better lighting.', 
            type: 'brightness' 
          });
        }
      }

      return hints;
    } catch (error) {
      console.error('[ImageQualityService] Assessment failed:', error);
      return [];
    }
  }

  private calculateBrightness(base64: string): number {
    try {
      const buf = Buffer.from(base64, 'base64');
      const decoded = decodeJpeg(buf, { useTArray: true });
      if (!decoded?.data) return 128; // fallback

      let total = 0;
      const data = decoded.data;
      const step = 4 * 10; // sample every 10th pixel for speed
      
      for (let i = 0; i < data.length; i += step) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        total += (0.299 * r + 0.587 * g + 0.114 * b);
      }
      
      return total / (data.length / step);
    } catch {
      return 128;
    }
  }
}

export const imageQualityService = new ImageQualityService();
