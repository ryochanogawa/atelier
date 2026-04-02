import { describe, it, expect } from "vitest";
import { CommissionSelectorService } from "../../../src/domain/services/commission-selector.service.js";

describe("CommissionSelectorService", () => {
  const service = new CommissionSelectorService();

  describe("select", () => {
    it("フロントエンド関連タスクでfrontendコミッションを選択する", () => {
      const result = service.select("UIコンポーネントのデザインを修正", [
        "frontend",
        "backend",
        "default",
      ]);

      expect(result.name).toBe("frontend");
      expect(result.score).toBeGreaterThan(0);
    });

    it("バックエンド関連タスクでbackendコミッションを選択する", () => {
      const result = service.select("APIエンドポイントの追加", [
        "frontend",
        "backend",
        "default",
      ]);

      expect(result.name).toBe("backend");
      expect(result.score).toBeGreaterThan(0);
    });

    it("マッチしないタスクでdefaultにフォールバックする", () => {
      const result = service.select("何か特殊な作業", [
        "frontend",
        "backend",
        "default",
      ]);

      expect(result.name).toBe("default");
    });

    it("空のコミッション一覧でデフォルト結果を返す", () => {
      const result = service.select("テスト", []);

      expect(result.name).toBe("default");
      expect(result.score).toBe(0);
      expect(result.reason).toBe("デフォルト");
    });

    it("複数キーワードがマッチすると高スコアになる", () => {
      const single = service.select("CSS修正", ["frontend", "default"]);
      const multiple = service.select("CSSとコンポーネントのレイアウト修正", [
        "frontend",
        "default",
      ]);

      expect(multiple.score).toBeGreaterThan(single.score);
    });

    it("reasonにマッチしたキーワードが含まれる", () => {
      const result = service.select("React UIコンポーネント", [
        "frontend",
        "default",
      ]);

      expect(result.reason).toContain("キーワードマッチ");
    });

    it("大文字小文字を区別しない", () => {
      const result = service.select("API endpoint", [
        "frontend",
        "backend",
        "default",
      ]);

      expect(result.name).toBe("backend");
    });

    it("defaultコミッションのキーワードもマッチする", () => {
      const result = service.select("バグ修正と実装", ["default"]);
      expect(result.score).toBeGreaterThan(1); // base score (1) + keyword matches
    });
  });
});
