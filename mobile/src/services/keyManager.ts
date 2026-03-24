/**
 * SignVerify Mobile – Key Manager (Hardware-Backed)
 *
 * Generates and stores ECDSA (secp256r1) key pairs strongly bound to the
 * device's Secure Enclave (iOS) or Keystore (Android) using react-native-biometrics.
 *
 * The private key NEVER leaves the secure hardware. All signing operations
 * must be performed within the TEE (via `createSignature` method later).
 */

// @ts-ignore - Types may not be perfectly resolved in this environment
import ReactNativeBiometrics from 'react-native-biometrics';
import * as SecureStore from 'expo-secure-store';

const rnBiometrics = new ReactNativeBiometrics({ allowDeviceCredentials: true });
const PUB_KEY_SECURE_KEY = 'signverify_public_key';
const SIMULATOR_KEY_ID = 'SIMULATOR_VIRTUAL_DEVICE_ID';

export const keyManager = {
  /**
   * Detects if the current environment supports Hardware-Backed TEE (Secure Enclave/Keystore).
   * Returns false on Simulators or rooted/unsupported older devices.
   */
  isHardwareAvailable: async (): Promise<boolean> => {
    try {
      const { available } = await rnBiometrics.isSensorAvailable();
      return !!available;
    } catch (e) {
      return false;
    }
  },

  /**
   * Generates a new hardware-backed key pair, or a persistent software mock if on a simulator.
   */
  generateKeyPair: async (): Promise<string> => {
    try {
      const hardware = await keyManager.isHardwareAvailable();
      
      if (!hardware) {
        console.warn('[KeyManager] Simulator detected. Using virtual software key.');
        const mockKey = `MOCK_PUB_KEY_${Math.random().toString(36).substring(7)}`;
        await SecureStore.setItemAsync(PUB_KEY_SECURE_KEY, mockKey);
        return mockKey;
      }

      // @ts-ignore - Configurations for 2026-standard hardware isolation
      const { publicKey } = await rnBiometrics.createKeys({
        allowDeviceCredentials: true,
        invalidateOnNewBiometric: true, 
      });
      if (!publicKey) {
        throw new Error("Hardware key generation failed: no public key returned");
      }
      await SecureStore.setItemAsync(PUB_KEY_SECURE_KEY, publicKey);
      return publicKey;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Checks if a key pair already exists (hardware or software mock).
   */
  hasKeyPair: async (): Promise<boolean> => {
    try {
      const stored = await SecureStore.getItemAsync(PUB_KEY_SECURE_KEY);
      if (stored) return true;

      const { keysExist } = await rnBiometrics.biometricKeysExist();
      return keysExist;
    } catch (error) {
      return false;
    }
  },

  /**
   * Deletes the key pair and clears the local mapping.
   */
  deleteKeys: async (): Promise<boolean> => {
    try {
      await rnBiometrics.deleteKeys();
      await SecureStore.deleteItemAsync(PUB_KEY_SECURE_KEY);
      return true;
    } catch (error) {
      return false;
    }
  },

  /**
   * Retrieves the current Public Key (Hardware or Mock).
   */
  getPublicKey: async (): Promise<string | null> => {
    return await SecureStore.getItemAsync(PUB_KEY_SECURE_KEY);
  },

  /**
   * Signs a given hash. 
   * On Simulators: Returns a deterministic but valid-looking Base64 mock signature.
   * On Real Devices: Prompts for hardware-backed Biometric signature.
   */
  signHash: async (hash: string): Promise<string> => {
    try {
      const hardware = await keyManager.isHardwareAvailable();
      
      if (!hardware) {
        console.warn('[KeyManager] Simulated sign for hash:', hash.substring(0, 8));
        // Return a mock Base64 signature that the backend (in Dev mode) can anticipate
        return Buffer.from(`SIMULATOR_SIG_OF_${hash}`).toString('base64');
      }

      const { success, signature } = await rnBiometrics.createSignature({
        promptMessage: 'Authorize SignVerify to use your cryptographic key',
        payload: hash,
      });

      if (!success || !signature) {
        throw new Error("Biometric authentication failed or cancelled.");
      }

      return signature;
    } catch (error) {
      throw error;
    }
  }
};
