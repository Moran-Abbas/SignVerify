import * as ImageManipulator from 'expo-image-manipulator';

export class ImageProcessingService {
  /**
   * Normalizes an image to a 1024x1024 JPEG (Universal Binding Specification).
   * 2026 Spec: High-fidelity version.
   * 
   * @param uri Local file URI to the raw image constraint
   * @returns Base64 string of the processed JPEG
   */
  async normalizeToBindingSpec(
    uri: string
  ): Promise<{ base64: string }> {
    try {
      console.log(`[ImageProcessingService] Normalizing for Binding: ${uri}`);
      
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024, height: 1024 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      
      if (!result.base64) {
        throw new Error("Target image encoder failed to return Base64 layout");
      }
      
      return { base64: result.base64 };
    } catch (error: any) {
      console.error("[ImageProcessingService] Normalization failed:", error);
      throw new Error(`Failed to safely process image for anchoring: ${error.message}`);
    }
  }

  /**
   * Crops an image based on provided rectangle.
   */
  async cropImage(
    uri: string,
    crop: { originX: number; originY: number; width: number; height: number }
  ): Promise<string> {
    try {
      console.log(`[ImageProcessingService] Cropping: ${JSON.stringify(crop)}`);
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ crop }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      return result.uri;
    } catch (error) {
      console.error("[ImageProcessingService] Crop failed:", error);
      throw error;
    }
  }

  /**
   * Generates a 6-digit Alphanumeric Reference ID (Shortcode).
   * 2026 Spec: Always uses Western digits (0-9).
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
   * Prepares the full camera frame for the high-frequency discovery loop.
   * Downscales to 640px to balance speed and basic feature presence.
   */
  async prepareFullFrameForDiscovery(uri: string): Promise<{ base64: string }> {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 640 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      return { base64: result.base64 || '' };
    } catch (error) {
      console.error('[ImageProcessingService] Discovery frame prep failed:', error);
      throw error;
    }
  }

  /**
   * Prepares the full camera frame for high-fidelity verification.
   * Resizes to 1024px for ORB matching and liveness checks.
   */
  async prepareFullFrameForVerification(uri: string): Promise<{ base64: string }> {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      return { base64: result.base64 || '' };
    } catch (error) {
      console.error('[ImageProcessingService] Verification frame prep failed:', error);
      throw error;
    }
  }

  /**
   * Legacy wrapper for backward compatibility.
   */
  async normalizeAndEncode(uri: string): Promise<string> {
    const { base64 } = await this.normalizeToBindingSpec(uri);
    return base64;
  }
}

export const imageProcessingService = new ImageProcessingService();
