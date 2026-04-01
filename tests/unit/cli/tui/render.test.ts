import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import type { ThemePort } from "../../../../src/domain/ports/theme.port.js";
import { BIOHAZARD_THEME } from "../../../../src/adapters/theme/biohazard.adapter.js";

// ─── Mock Ink ────────────────────────────────────────────────
const mockUnmount = vi.fn();
const mockRerender = vi.fn();
const mockWaitUntilExit = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

const mockRender = vi.fn(() => ({
  unmount: mockUnmount,
  rerender: mockRerender,
  waitUntilExit: mockWaitUntilExit,
}));

vi.mock("ink", () => ({
  render: (...args: unknown[]) => mockRender(...args),
}));

// ─── Mock App ────────────────────────────────────────────────
vi.mock("../../../../src/cli/tui/app.js", () => ({
  App: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
}));

// ─── SUT ─────────────────────────────────────────────────────
// 各テストでモジュールの内部状態(inkHandle)をリセットするため resetModules を使う
async function loadModule() {
  const mod = await import("../../../../src/cli/tui/render.js");
  return mod;
}

describe("tui/render.tsx", () => {
  const theme: ThemePort = BIOHAZARD_THEME;

  beforeEach(() => {
    vi.clearAllMocks();
    // inkHandle をリセットするためモジュールキャッシュをクリア
    vi.resetModules();
  });

  describe("renderStatic()", () => {
    it("render を呼び出し直後に unmount する", async () => {
      // Arrange
      const { renderStatic } = await loadModule();
      const element = React.createElement("span", null, "hello");

      // Act
      renderStatic(element, theme);

      // Assert
      expect(mockRender).toHaveBeenCalledOnce();
      expect(mockUnmount).toHaveBeenCalledOnce();
    });

    it("exitOnCtrlC: false オプションで render を呼ぶ", async () => {
      // Arrange
      const { renderStatic } = await loadModule();
      const element = React.createElement("span", null, "test");

      // Act
      renderStatic(element, theme);

      // Assert
      const callArgs = mockRender.mock.calls[0];
      expect(callArgs[1]).toEqual({ exitOnCtrlC: false });
    });

    it("複数回呼んでも毎回 render → unmount する", async () => {
      // Arrange
      const { renderStatic } = await loadModule();

      // Act
      renderStatic(React.createElement("span", null, "a"), theme);
      renderStatic(React.createElement("span", null, "b"), theme);

      // Assert
      expect(mockRender).toHaveBeenCalledTimes(2);
      expect(mockUnmount).toHaveBeenCalledTimes(2);
    });
  });

  describe("renderPersistent()", () => {
    it("初回呼び出しで render を実行し inkHandle を保持する", async () => {
      // Arrange
      const { renderPersistent } = await loadModule();
      const element = React.createElement("span", null, "persistent");

      // Act
      renderPersistent(element, theme);

      // Assert
      expect(mockRender).toHaveBeenCalledOnce();
      expect(mockUnmount).not.toHaveBeenCalled();
    });

    it("2回目以降は rerender を呼ぶ（render は1回のみ）", async () => {
      // Arrange
      const { renderPersistent } = await loadModule();

      // Act
      renderPersistent(React.createElement("span", null, "first"), theme);
      renderPersistent(React.createElement("span", null, "second"), theme);

      // Assert
      expect(mockRender).toHaveBeenCalledOnce();
      expect(mockRerender).toHaveBeenCalledOnce();
    });

    it("3回目も rerender を呼ぶ", async () => {
      // Arrange
      const { renderPersistent } = await loadModule();

      // Act
      renderPersistent(React.createElement("span", null, "1"), theme);
      renderPersistent(React.createElement("span", null, "2"), theme);
      renderPersistent(React.createElement("span", null, "3"), theme);

      // Assert
      expect(mockRender).toHaveBeenCalledOnce();
      expect(mockRerender).toHaveBeenCalledTimes(2);
    });
  });

  describe("unmountInk()", () => {
    it("renderPersistent 後に unmount を呼ぶ", async () => {
      // Arrange
      const { renderPersistent, unmountInk } = await loadModule();
      renderPersistent(React.createElement("span", null, "x"), theme);

      // Act
      unmountInk();

      // Assert
      expect(mockUnmount).toHaveBeenCalledOnce();
    });

    it("inkHandle が無い場合でもエラーにならない", async () => {
      // Arrange
      const { unmountInk } = await loadModule();

      // Act & Assert
      expect(() => unmountInk()).not.toThrow();
      expect(mockUnmount).not.toHaveBeenCalled();
    });

    it("unmount 後に renderPersistent すると新しい render が走る", async () => {
      // Arrange
      const { renderPersistent, unmountInk } = await loadModule();
      renderPersistent(React.createElement("span", null, "a"), theme);
      unmountInk();
      mockRender.mockClear();

      // Act
      renderPersistent(React.createElement("span", null, "b"), theme);

      // Assert
      expect(mockRender).toHaveBeenCalledOnce();
      expect(mockRerender).not.toHaveBeenCalled();
    });
  });

  describe("waitForExit()", () => {
    it("renderPersistent 後に waitUntilExit を呼ぶ", async () => {
      // Arrange
      const { renderPersistent, waitForExit } = await loadModule();
      renderPersistent(React.createElement("span", null, "x"), theme);

      // Act
      await waitForExit();

      // Assert
      expect(mockWaitUntilExit).toHaveBeenCalledOnce();
    });

    it("inkHandle が無い場合でも正常に resolve する", async () => {
      // Arrange
      const { waitForExit } = await loadModule();

      // Act & Assert
      await expect(waitForExit()).resolves.toBeUndefined();
      expect(mockWaitUntilExit).not.toHaveBeenCalled();
    });
  });
});
