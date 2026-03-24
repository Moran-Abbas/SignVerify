/**
 * SignVerify Mobile – OCR Service
 *
 * Interacts with the Google Cloud Vision API to extract raw text
 * from a base64-encoded image captured by the device camera.
 */

import { apiClient } from './apiClient';

export const ocrService = {
  /**
   * Translates a secure native Vision Camera photo into a FormData blob
   * and dispatches it to the JWT-protected Backend OCR proxy.
   */
  extractTextFromImage: async (photoPath: string): Promise<string> => {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: 'file://' + photoPath,
        name: 'document.jpg',
        type: 'image/jpeg',
      } as any);

      formData.append('languages', JSON.stringify(['en', 'ar', 'he']));

      // apiClient automatically handles the JWT bearer tokens via SecureStore
      const response = await apiClient.fetchWithAuth('/ocr/extract-text', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Backend failed to process OCR upload');
      }

      const data = await response.json();
      if (data && data.text) {
        return data.text.trim();
      }

      return '';
    } catch (error) {
      throw error;
    }
  },
};
