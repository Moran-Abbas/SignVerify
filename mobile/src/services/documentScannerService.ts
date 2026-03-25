import DocumentScanner from 'react-native-document-scanner-plugin';
import { Platform } from 'react-native';

export class DocumentScannerService {
  /**
   * Launches the native document scanner UI.
   * Handles perspective correction and cropping natively.
   * 
   * @returns Promise<string | null> The URI of the scanned document image.
   */
  async scanDocument(): Promise<string | null> {
    try {
      // Launch scanner
      const { scannedImages } = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
        letUserAdjustCrop: true,
      });

      // If a document was scanned, return the first one
      if (scannedImages && scannedImages.length > 0) {
        return scannedImages[0];
      }

      return null;
    } catch (error) {
      console.error('[DocumentScannerService] Scan failed:', error);
      throw error;
    }
  }
}

export const documentScannerService = new DocumentScannerService();
