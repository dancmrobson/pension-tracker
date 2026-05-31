import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";

import { ColorTokens, defaultThemeId, radius, themes } from "@/constants/colors";

export type ColorMode = "auto" | "light" | "dark";

const STORAGE_KEY_THEME = "@pension_theme";
const STORAGE_KEY_MODE = "@pension_color_mode";

type ThemeContextValue = {
  themeId: string;
  colorMode: ColorMode;
  resolvedScheme: "light" | "dark";
  colors: ColorTokens & { radius: number };
  setThemeId: (id: string) => void;
  setColorMode: (mode: ColorMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const deviceScheme = useColorScheme();
  const [themeId, setThemeIdState] = useState(defaultThemeId);
  const [colorMode, setColorModeState] = useState<ColorMode>("auto");

  useEffect(() => {
    AsyncStorage.multiGet([STORAGE_KEY_THEME, STORAGE_KEY_MODE]).then(
      (pairs) => {
        const savedTheme = pairs[0][1];
        const savedMode = pairs[1][1];
        if (savedTheme) setThemeIdState(savedTheme);
        if (savedMode) setColorModeState(savedMode as ColorMode);
      }
    );
  }, []);

  const setThemeId = useCallback((id: string) => {
    setThemeIdState(id);
    AsyncStorage.setItem(STORAGE_KEY_THEME, id);
  }, []);

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY_MODE, mode);
  }, []);

  const resolvedScheme: "light" | "dark" = useMemo(() => {
    if (colorMode === "light") return "light";
    if (colorMode === "dark") return "dark";
    return deviceScheme === "dark" ? "dark" : "light";
  }, [colorMode, deviceScheme]);

  const colors = useMemo(() => {
    const theme = themes.find((t) => t.id === themeId) ?? themes[0];
    const palette = resolvedScheme === "dark" ? theme.dark : theme.light;
    return { ...palette, radius };
  }, [themeId, resolvedScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ themeId, colorMode, resolvedScheme, colors, setThemeId, setColorMode }),
    [themeId, colorMode, resolvedScheme, colors, setThemeId, setColorMode]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
