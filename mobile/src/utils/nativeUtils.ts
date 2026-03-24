import { Alert, Share, Vibration } from 'react-native';

/**
 * SignVerify Native Utilities
 * Provides resilient wrappers for native modules that may be missing in old binaries.
 */

// Defensive lazy-loading of Expo modules. 
// We keep it quiet (no console warnings unless error) to reduce log noise.
let ExpoHaptics: any = null;
try {
  ExpoHaptics = require('expo-haptics');
} catch (e) {
  // Silent fallback - users on old builds will just get standard vibration
}

let ExpoClipboard: any = null;
try {
  ExpoClipboard = require('expo-clipboard');
} catch (e) {
  // Silent fallback
}

export enum ImpactFeedbackStyle {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
}

export enum NotificationFeedbackType {
  Success = 'success',
  Warning = 'warning',
  Error = 'error',
}

export const safeHaptics = {
  impact: async (style: ImpactFeedbackStyle = ImpactFeedbackStyle.Light) => {
    // Vibration disabled per user request
  },
  notification: async (type: NotificationFeedbackType = NotificationFeedbackType.Success) => {
    // Vibration disabled per user request
  },
  selection: async () => {
    // Selection silenced
  }
};

export const safeClipboard = {
  setString: async (text: string, label: string = 'Content') => {
    try {
      if (ExpoClipboard) {
        await ExpoClipboard.setStringAsync(text);
        // Subtle confirmation haptic only on real success
        safeHaptics.impact(ImpactFeedbackStyle.Light);
      } else {
        throw new Error('Missing');
      }
    } catch {
      try {
        await Share.share({
          message: text,
          title: `Copy ${label}`,
        });
      } catch (err) {
        Alert.alert('Error', `Could not copy ${label}.`);
      }
    }
  }
};
