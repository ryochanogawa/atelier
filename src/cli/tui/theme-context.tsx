/**
 * Theme Context
 * React Context で ThemePort をコンポーネントツリーに注入する。
 */

import { createContext, useContext } from "react";
import type { ThemePort } from "../../domain/ports/theme.port.js";

const ThemeContext = createContext<ThemePort | null>(null);

export function useTheme(): ThemePort {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return theme;
}

export const ThemeProvider = ThemeContext.Provider;
