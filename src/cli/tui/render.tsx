/**
 * TUI Render Manager
 * Ink の render() / unmount() ライフサイクルを管理する。
 * 短命出力（ヘッダー、テーブル等）は Static モードで即描画・unmount。
 * 長命プロセス（watch, interactive）は rerender パターンを使う。
 */

import React from "react";
import { render } from "ink";
import type { ThemePort } from "../../domain/ports/theme.port.js";
import { App } from "./app.js";

interface InkHandle {
  readonly unmount: () => void;
  readonly rerender: (element: React.ReactElement) => void;
  readonly waitUntilExit: () => Promise<void>;
}

let inkHandle: InkHandle | null = null;

/**
 * 短命な Ink 描画を行う（ヘッダー、テーブル、結果パネル等）。
 * render → 即 unmount で静的テキストとして出力する。
 */
export function renderStatic(element: React.ReactElement, theme: ThemePort): void {
  const handle = render(<App theme={theme}>{element}</App>, {
    exitOnCtrlC: false,
  });
  handle.unmount();
}

/**
 * 長命な Ink インスタンスを開始する（watch, interactive 等）。
 * 既存インスタンスがあれば rerender する。
 */
export function renderPersistent(element: React.ReactElement, theme: ThemePort): void {
  if (inkHandle) {
    inkHandle.rerender(<App theme={theme}>{element}</App>);
    return;
  }
  inkHandle = render(<App theme={theme}>{element}</App>);
}

/** 長命な Ink インスタンスを破棄する */
export function unmountInk(): void {
  inkHandle?.unmount();
  inkHandle = null;
}

/** 長命な Ink インスタンスの終了を待つ */
export async function waitForExit(): Promise<void> {
  await inkHandle?.waitUntilExit();
}
