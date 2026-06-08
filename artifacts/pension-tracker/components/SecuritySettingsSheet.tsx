import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBiometricLock } from "@/context/BiometricLockContext";
import { useColors } from "@/hooks/useColors";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SecuritySettingsSheet({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isEnabled, isAvailable, biometricType, setEnabled } = useBiometricLock();

  const isFace = biometricType === "face";
  const biometricLabel = isFace ? "Face ID" : "Touch ID";
  const biometricIcon = isFace ? "scan-outline" : "finger-print-outline";

  async function handleToggle(val: boolean) {
    await setEnabled(val);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>Security</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.closeBtn, { backgroundColor: colors.secondary }]}
          >
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Biometric lock row */}
        <View style={[styles.section, { borderColor: colors.border }]}>
          <View
            style={[
              styles.row,
              { borderBottomColor: colors.border, borderBottomWidth: 0 },
            ]}
          >
            <View
              style={[
                styles.rowIcon,
                { backgroundColor: isAvailable ? colors.primary + "18" : colors.secondary },
              ]}
            >
              <Ionicons
                name={biometricIcon}
                size={20}
                color={isAvailable ? colors.primary : colors.mutedForeground}
              />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>
                {isAvailable ? `${biometricLabel} Lock` : "Biometric Lock"}
              </Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                {!isAvailable
                  ? "Not available on this device"
                  : isEnabled
                  ? `App locks after 3 s in background`
                  : `Protect your data with ${biometricLabel}`}
              </Text>
            </View>
            <Switch
              value={isEnabled}
              onValueChange={handleToggle}
              disabled={!isAvailable}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={Platform.OS === "android" ? (isEnabled ? "#fff" : colors.mutedForeground) : undefined}
            />
          </View>
        </View>

        {/* Info box when enabled */}
        {isEnabled && isAvailable && (
          <View
            style={[
              styles.infoBox,
              { backgroundColor: colors.primary + "10", borderColor: colors.primary + "25" },
            ]}
          >
            <Ionicons name="lock-closed" size={14} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.primary }]}>
              The app will lock automatically when you leave it. Use{" "}
              {biometricLabel} or your device passcode to re-open.
            </Text>
          </View>
        )}

        {/* Note if unavailable */}
        {!isAvailable && (
          <View
            style={[
              styles.infoBox,
              { backgroundColor: colors.secondary, borderColor: colors.border },
            ]}
          >
            <Ionicons name="information-circle-outline" size={14} color={colors.mutedForeground} />
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              Set up Face ID or Touch ID in your device Settings to enable this feature.
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingHorizontal: 20,
    gap: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  rowSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
});
