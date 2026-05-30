import { useTheme } from "@/context/ThemeContext";

/**
 * Returns the resolved design tokens for the current color scheme + selected theme.
 * Theme and mode (auto / light / dark) are managed by ThemeContext and persisted.
 */
export function useColors() {
  return useTheme().colors;
}
