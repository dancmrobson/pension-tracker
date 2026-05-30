import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { themes } from "@/constants/colors";
import { type ColorMode, useTheme } from "@/context/ThemeContext";

const MODES: { id: ColorMode; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { id: "auto", label: "Auto", icon: "phone-portrait-outline" },
  { id: "light", label: "Light", icon: "sunny-outline" },
  { id: "dark", label: "Dark", icon: "moon-outline" },
];

interface ThemePickerProps {
  visible: boolean;
  onClose: () => void;
}

export function ThemePicker({ visible, onClose }: ThemePickerProps) {
  const { colors, themeId, colorMode, setThemeId, setColorMode } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            paddingBottom: Math.max(insets.bottom, 20),
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Appearance
          </Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Mode selector */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          MODE
        </Text>
        <View
          style={[
            styles.segmented,
            {
              backgroundColor: colors.secondary,
              borderRadius: colors.radius,
            },
          ]}
        >
          {MODES.map((m) => {
            const active = colorMode === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[
                  styles.segment,
                  { borderRadius: colors.radius - 2 },
                  active && {
                    backgroundColor: colors.card,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.08,
                    shadowRadius: 3,
                    elevation: 2,
                  },
                ]}
                onPress={() => setColorMode(m.id)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={m.icon}
                  size={15}
                  color={active ? colors.primary : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.segmentText,
                    {
                      color: active ? colors.primary : colors.mutedForeground,
                      fontFamily: active
                        ? "Inter_600SemiBold"
                        : "Inter_400Regular",
                    },
                  ]}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Theme selector */}
        <Text
          style={[
            styles.sectionLabel,
            { color: colors.mutedForeground, marginTop: 24 },
          ]}
        >
          COLOR THEME
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.themeRow}
        >
          {themes.map((theme) => {
            const active = themeId === theme.id;
            const swatch = theme.light;
            return (
              <TouchableOpacity
                key={theme.id}
                style={[
                  styles.themeSwatch,
                  {
                    borderColor: active ? swatch.primary : colors.border,
                    borderWidth: active ? 2.5 : 1.5,
                    borderRadius: colors.radius,
                    backgroundColor: colors.background,
                  },
                ]}
                onPress={() => setThemeId(theme.id)}
                activeOpacity={0.75}
              >
                {active && (
                  <View
                    style={[
                      styles.swatchCheck,
                      { backgroundColor: swatch.primary },
                    ]}
                  >
                    <Ionicons name="checkmark" size={10} color="#fff" />
                  </View>
                )}
                <View style={styles.swatchCircles}>
                  <View
                    style={[
                      styles.swatchPrimary,
                      { backgroundColor: swatch.primary },
                    ]}
                  />
                  <View
                    style={[
                      styles.swatchAccent,
                      {
                        backgroundColor: swatch.accent,
                        borderColor: colors.card,
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.swatchName,
                    {
                      color: active ? colors.primary : colors.mutedForeground,
                      fontFamily: active
                        ? "Inter_600SemiBold"
                        : "Inter_400Regular",
                    },
                  ]}
                  numberOfLines={2}
                >
                  {theme.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.9,
    marginBottom: 10,
  },
  segmented: {
    flexDirection: "row",
    padding: 4,
    gap: 3,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 11,
    paddingHorizontal: 4,
  },
  segmentText: {
    fontSize: 13,
  },
  themeRow: {
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  themeSwatch: {
    width: 88,
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
    gap: 10,
    position: "relative",
  },
  swatchCircles: {
    width: 46,
    height: 46,
    position: "relative",
  },
  swatchPrimary: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  swatchAccent: {
    width: 22,
    height: 22,
    borderRadius: 11,
    position: "absolute",
    bottom: -4,
    right: -4,
    borderWidth: 2,
  },
  swatchName: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 15,
  },
  swatchCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
});
