import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Theme, themes } from "@/constants/colors";
import { type ColorMode, useTheme } from "@/context/ThemeContext";

// Snap points (translateY of sheet):
//   SNAP_E = 0   → expanded, both theme rows visible
//   SNAP_C = 125 → collapsed/peek, second row hidden below screen
const SNAP_E = 0;
const SNAP_C = 125;

const SPRING = {
  useNativeDriver: true,
  damping: 22,
  stiffness: 280,
  mass: 0.75,
};

const MODES: {
  id: ColorMode;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}[] = [
  { id: "auto", label: "Auto", icon: "phone-portrait-outline" },
  { id: "light", label: "Light", icon: "sunny-outline" },
  { id: "dark", label: "Dark", icon: "moon-outline" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ThemePicker({ visible, onClose }: Props) {
  const { colors, themeId, colorMode, setThemeId, setColorMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  // ── Animation state (all via refs so PanResponder closures stay valid) ──
  const animY = useRef(new Animated.Value(700)).current;
  const trackedY = useRef(700); // mirrors animY, updated by listener
  const gestureStartY = useRef(SNAP_C); // animY value at the start of each gesture
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Keep trackedY in sync
  useEffect(() => {
    const id = animY.addListener(({ value }) => { trackedY.current = value; });
    return () => animY.removeListener(id);
  }, [animY]);

  // onShow is called once the Modal is actually painted on screen — safer than
  // useEffect([visible]) which fires before the Modal is visible, causing the
  // spring to complete before the sheet appears on re-opens.
  const onShow = () => {
    animY.stopAnimation();
    animY.setValue(700);
    Animated.spring(animY, { toValue: SNAP_C, ...SPRING }).start();
  };

  // ── Gesture actions (only access refs → safe for PanResponder closures) ──
  const snapTo = (toValue: number) => {
    Animated.spring(animY, { toValue, ...SPRING }).start();
  };

  const dismiss = () => {
    Animated.timing(animY, {
      toValue: 700,
      duration: 220,
      useNativeDriver: true,
    }).start(() => onCloseRef.current());
  };

  const onGrant = () => {
    animY.stopAnimation();
    gestureStartY.current = trackedY.current;
  };

  const onMove = (_: unknown, { dy }: { dy: number }) => {
    // Allow a little overscroll past expanded, but clamp above expanded
    animY.setValue(Math.max(SNAP_E - 20, gestureStartY.current + dy));
  };

  const onRelease = (_: unknown, { dy, vy }: { dy: number; vy: number }) => {
    const pos = gestureStartY.current + dy;

    // Fast flick down, or dragged far below collapsed → dismiss
    if (vy > 1.2 || pos > SNAP_C + 80) {
      dismiss();
      return;
    }

    // Snap to nearest point (bias toward collapsed if no strong intent)
    const mid = (SNAP_E + SNAP_C) / 2;
    snapTo(vy < -0.5 || pos < mid ? SNAP_E : SNAP_C);
  };

  // Handle bar: captures drags from the very first touch event
  const handlePR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: onGrant,
      onPanResponderMove: onMove,
      onPanResponderRelease: onRelease,
    })
  ).current;

  // Content area: only steals vertical drags (preserves child taps)
  const contentPR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dy, dx }) =>
        Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5,
      onPanResponderGrant: onGrant,
      onPanResponderMove: onMove,
      onPanResponderRelease: onRelease,
    })
  ).current;

  // ── Layout ──
  const bottomPad = Math.max(insets.bottom, 16);
  // 5 swatches per row, separated by 8px gaps
  const swatchW = (screenW - 40 - 4 * 8) / 5; // 40 = 20px padding each side

  const row1 = themes.slice(0, 5);
  const row2 = themes.slice(5);

  const renderSwatch = (theme: Theme) => {
    const active = themeId === theme.id;
    const s = theme.light; // always use light palette for swatch preview
    return (
      <TouchableOpacity
        key={theme.id}
        style={[
          styles.swatch,
          {
            width: swatchW,
            borderColor: active ? s.primary : colors.border,
            borderWidth: active ? 2.5 : 1.5,
            borderRadius: colors.radius - 2,
            backgroundColor: colors.background,
          },
        ]}
        onPress={() => setThemeId(theme.id)}
        activeOpacity={0.75}
      >
        {active && (
          <View style={[styles.swatchCheck, { backgroundColor: s.primary }]}>
            <Ionicons name="checkmark" size={9} color="#fff" />
          </View>
        )}
        <View style={styles.swatchCircles}>
          <View style={[styles.swatchPrimary, { backgroundColor: s.primary }]} />
          <View
            style={[
              styles.swatchAccent,
              { backgroundColor: s.accent, borderColor: colors.card },
            ]}
          />
        </View>
        <Text
          style={[
            styles.swatchName,
            {
              color: active ? colors.primary : colors.mutedForeground,
              fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {theme.name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={dismiss}
      onShow={onShow}
    >
      {/* Dimmed backdrop — tap to dismiss */}
      <Pressable style={styles.overlay} onPress={dismiss} />

      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            paddingBottom: bottomPad,
            transform: [{ translateY: animY }],
          },
        ]}
      >
        {/* ── Handle (steals drag from first touch) ── */}
        <View {...handlePR.panHandlers} style={styles.handleArea}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.swipeHint, { color: colors.mutedForeground }]}>
            swipe up for more themes
          </Text>
        </View>

        {/* ── Main content (steals vertical drags, lets taps through) ── */}
        <View {...contentPR.panHandlers}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Appearance
            </Text>
            <TouchableOpacity
              onPress={dismiss}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Mode */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            MODE
          </Text>
          <View
            style={[
              styles.segmented,
              { backgroundColor: colors.secondary, borderRadius: colors.radius },
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
                      shadowOpacity: 0.1,
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

          {/* Color theme label */}
          <Text
            style={[
              styles.sectionLabel,
              { color: colors.mutedForeground, marginTop: 20 },
            ]}
          >
            COLOR THEME
          </Text>

          {/* Row 1 — classic themes (always visible) */}
          <View style={styles.themeRow}>{row1.map(renderSwatch)}</View>

          {/* Row 2 — fun themes (revealed by swiping up) */}
          <View style={[styles.themeRow, { marginTop: 8 }]}>
            {row2.map(renderSwatch)}
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  handleArea: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 6,
    gap: 5,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  swipeHint: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.2,
    opacity: 0.55,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 4,
    marginBottom: 18,
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
    paddingHorizontal: 20,
  },
  segmented: {
    flexDirection: "row",
    padding: 4,
    gap: 3,
    marginHorizontal: 20,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  segmentText: {
    fontSize: 13,
  },
  themeRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
  },
  swatch: {
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 2,
    gap: 6,
    position: "relative",
  },
  swatchCircles: {
    width: 38,
    height: 38,
    position: "relative",
  },
  swatchPrimary: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  swatchAccent: {
    width: 18,
    height: 18,
    borderRadius: 9,
    position: "absolute",
    bottom: -3,
    right: -3,
    borderWidth: 2,
  },
  swatchName: {
    fontSize: 10,
    textAlign: "center",
    lineHeight: 13,
  },
  swatchCheck: {
    position: "absolute",
    top: 6,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
});
