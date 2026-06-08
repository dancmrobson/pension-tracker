import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";
import {
  checkBiometricAvailability,
  getBiometricLockEnabled,
  persistBiometricLockEnabled,
  triggerAuthentication,
  type BiometricType,
} from "@/hooks/useBiometricLock";

interface BiometricLockContextValue {
  isLocked: boolean;
  isEnabled: boolean;
  isAvailable: boolean;
  biometricType: BiometricType;
  unlock: () => Promise<boolean>;
  setEnabled: (val: boolean) => Promise<void>;
}

const BiometricLockContext = createContext<BiometricLockContextValue>({
  isLocked: false,
  isEnabled: false,
  isAvailable: false,
  biometricType: "none",
  unlock: async () => true,
  setEnabled: async () => {},
});

export function useBiometricLock() {
  return useContext(BiometricLockContext);
}

// Lock after app is backgrounded for more than 3 seconds
const LOCK_AFTER_MS = 3_000;

export function BiometricLockProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isEnabled, setIsEnabledState] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>("none");

  const backgroundedAt = useRef<number | null>(null);
  const hasAutoAttempted = useRef(false);

  // Load preference + check hardware on mount
  useEffect(() => {
    async function init() {
      const [enabled, { available, type }] = await Promise.all([
        getBiometricLockEnabled(),
        checkBiometricAvailability(),
      ]);
      setIsEnabledState(enabled);
      setIsAvailable(available);
      setBiometricType(type);
      if (enabled && available) {
        setIsLocked(true);
      }
      setReady(true);
    }
    init();
  }, []);

  // Auto-attempt authentication whenever the lock screen first appears
  useEffect(() => {
    if (!isLocked || hasAutoAttempted.current) return;
    hasAutoAttempted.current = true;
    triggerAuthentication().then((success) => {
      if (success) setIsLocked(false);
    });
  }, [isLocked]);

  // Re-lock when app returns from background (after LOCK_AFTER_MS)
  useEffect(() => {
    if (Platform.OS === "web") return;

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") {
        backgroundedAt.current = Date.now();
      } else if (state === "active" && backgroundedAt.current !== null) {
        const elapsed = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (elapsed >= LOCK_AFTER_MS && isEnabled && isAvailable) {
          hasAutoAttempted.current = false;
          setIsLocked(true);
        }
      }
    });

    return () => sub.remove();
  }, [isEnabled, isAvailable]);

  const unlock = useCallback(async (): Promise<boolean> => {
    const success = await triggerAuthentication();
    if (success) setIsLocked(false);
    return success;
  }, []);

  const setEnabled = useCallback(
    async (val: boolean) => {
      if (val && !isAvailable) return;
      await persistBiometricLockEnabled(val);
      setIsEnabledState(val);
      if (!val) setIsLocked(false);
    },
    [isAvailable]
  );

  // Don't render children until we know the lock state (avoids flash)
  if (!ready) return null;

  return (
    <BiometricLockContext.Provider
      value={{ isLocked, isEnabled, isAvailable, biometricType, unlock, setEnabled }}
    >
      {children}
    </BiometricLockContext.Provider>
  );
}
