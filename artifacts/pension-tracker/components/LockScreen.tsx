import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBiometricLock } from "@/context/BiometricLockContext";
import { useColors } from "@/hooks/useColors";

export function LockScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { unlock, biometricType } = useBiometricLock();
  const [authenticating, setAuthenticating] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleUnlock() {
    if (authenticating) return;
    setAuthenticating(true);
    setFailed(false);
    const success = await unlock();
    if (!success) setFailed(true);
    setAuthenticating(false);
  }

  const isFace = biometricType === "face";
  const biometricIcon = isFace ? "scan-outline" : "finger-print-outline";
  const biometricLabel = isFace ? "Face ID" : "Touch ID";

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 80,
          paddingBottom: insets.bottom + 48,
        },
      ]}
    >
      {/* Branding */}
      <View style={styles.brand}>
        <View
          style={[
            styles.logoRing,
            { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" },
          ]}
        >
          <View style={[styles.logoInner, { backgroundColor: colors.primary }]}>
            <Ionicons name="wallet" size={32} color="#fff" />
          </View>
        </View>
        <Text style={[styles.appName, { color: colors.foreground }]}>Pension Tracker</Text>
        <Text style={[styles.lockedLabel, { color: colors.mutedForeground }]}>
          Your data is protected
        </Text>
      </View>

      {/* Unlock area */}
      <View style={styles.actions}>
        {failed && (
          <View style={[styles.errorBanner, { backgroundColor: colors.negative + "18", borderColor: colors.negative + "30" }]}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.negative} />
            <Text style={[styles.errorText, { color: colors.negative }]}>
              Authentication failed — try again
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.unlockBtn,
            { backgroundColor: colors.primary, opacity: authenticating ? 0.75 : 1 },
          ]}
          onPress={handleUnlock}
          disabled={authenticating}
          activeOpacity={0.85}
        >
          {authenticating ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name={biometricIcon} size={22} color="#fff" />
              <Text style={styles.unlockBtnText}>Unlock with {biometricLabel}</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          You can also use your device passcode
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    alignItems: "center",
    gap: 14,
  },
  logoRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginTop: 8,
  },
  lockedLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  actions: {
    width: "100%",
    paddingHorizontal: 32,
    gap: 14,
    alignItems: "center",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: "stretch",
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  unlockBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 16,
    alignSelf: "stretch",
  },
  unlockBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    opacity: 0.6,
  },
});
