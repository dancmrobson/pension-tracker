import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LOCK_ENABLED_KEY = "@pension_tracker/biometric_lock_enabled";

export type BiometricType = "face" | "fingerprint" | "none";

export async function checkBiometricAvailability(): Promise<{
  available: boolean;
  type: BiometricType;
}> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return { available: false, type: "none" };
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return { available: false, type: "none" };
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const type: BiometricType = types.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
    )
      ? "face"
      : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
      ? "fingerprint"
      : "none";
    return { available: type !== "none", type };
  } catch {
    return { available: false, type: "none" };
  }
}

export async function triggerAuthentication(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock Pension Tracker",
      fallbackLabel: "Use Passcode",
      disableDeviceFallback: false,
      cancelLabel: "Cancel",
    });
    return result.success;
  } catch {
    return false;
  }
}

export async function getBiometricLockEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(LOCK_ENABLED_KEY);
    return val === "true";
  } catch {
    return false;
  }
}

export async function persistBiometricLockEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCK_ENABLED_KEY, enabled ? "true" : "false");
  } catch {}
}
