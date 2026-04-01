/**
 * TUI App Root
 * Ink アプリケーションのルートコンポーネント。ThemeProvider でテーマを注入する。
 */

import React from "react";
import type { ThemePort } from "../../domain/ports/theme.port.js";
import { ThemeProvider } from "./theme-context.js";

interface AppProps {
  readonly theme: ThemePort;
  readonly children: React.ReactNode;
}

export function App({ theme, children }: AppProps): React.JSX.Element {
  return (
    <ThemeProvider value={theme}>
      {children}
    </ThemeProvider>
  );
}
