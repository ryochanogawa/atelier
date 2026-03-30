import { describe, it, expect } from "vitest";
import { extractTraceFromSpecs } from "../../../src/application/services/spec-trace-extractor.js";

describe("extractTraceFromSpecs", () => {
  describe("requirements抽出", () => {
    it("正常なテーブルから要件リストを抽出する", () => {
      const md = `
# 要件一覧

| # | 要件 | 優先度 | 完了条件 |
|---|------|--------|----------|
| 1 | ログインできる | Must | 認証成功 |
| 2 | パスワードリセット | Should | メール送信 |
`;
      const result = extractTraceFromSpecs(md, null, null);
      expect(result.requirements).toEqual([
        { id: "1", name: "ログインできる" },
        { id: "2", name: "パスワードリセット" },
      ]);
    });

    it("テーブルがない場合は空配列を返す", () => {
      const md = `
# 要件一覧

まだ要件はありません。
`;
      const result = extractTraceFromSpecs(md, null, null);
      expect(result.requirements).toEqual([]);
    });
  });

  describe("designマッピング抽出", () => {
    it("正常なテーブルからマッピングを抽出する", () => {
      const designMd = `
# 設計マッピング

| 要件# | 設計要素 | 変更ファイル |
|-------|---------|-------------|
| 1 | AuthService.login() | src/services/auth.ts |
| 2 | AuthService.resetPassword() | src/services/auth.ts |
`;
      const result = extractTraceFromSpecs("", designMd, null);
      expect(result.designMappings).toEqual([
        { reqId: "1", designElement: "AuthService.login()", file: "src/services/auth.ts" },
        { reqId: "2", designElement: "AuthService.resetPassword()", file: "src/services/auth.ts" },
      ]);
    });

    it("designがnullの場合は空配列を返す", () => {
      const result = extractTraceFromSpecs("", null, null);
      expect(result.designMappings).toEqual([]);
    });
  });

  describe("tasksマッピング抽出", () => {
    it("チェックボックスと要件参照からタスクマッピングを抽出する", () => {
      const tasksMd = `
# タスク一覧

- [ ] 1. ログイン機能を実装する
  _要件: 1_
- [ ] 2. パスワードリセット機能を実装する
  _要件: 2_
`;
      const result = extractTraceFromSpecs("", null, tasksMd);
      expect(result.taskMappings).toEqual([
        { taskId: "1", reqIds: ["1"] },
        { taskId: "2", reqIds: ["2"] },
      ]);
    });

    it("複数要件参照を正しくパースする", () => {
      const tasksMd = `
- [ ] 1. 認証基盤を構築する
  _要件: 1, 2, 3_
`;
      const result = extractTraceFromSpecs("", null, tasksMd);
      expect(result.taskMappings).toEqual([
        { taskId: "1", reqIds: ["1", "2", "3"] },
      ]);
    });

    it("tasksがnullの場合は空配列を返す", () => {
      const result = extractTraceFromSpecs("", null, null);
      expect(result.taskMappings).toEqual([]);
    });
  });

  describe("全組み合わせ", () => {
    it("3ファイル全てから正しくExtractedTraceが返る", () => {
      const requirementsMd = `
| # | 要件 | 優先度 | 完了条件 |
|---|------|--------|----------|
| 1 | ログインできる | Must | 認証成功 |
| 2 | データ取得 | Must | API応答 |
`;
      const designMd = `
| 要件# | 設計要素 | 変更ファイル |
|-------|---------|-------------|
| 1 | AuthService.login() | src/services/auth.ts |
| 2 | DataService.fetch() | src/services/data.ts |
`;
      const tasksMd = `
- [ ] 1. 認証基盤を構築する
  _要件: 1_
- [ ] 2. データ取得APIを実装する
  _要件: 1, 2_
`;
      const result = extractTraceFromSpecs(requirementsMd, designMd, tasksMd);

      expect(result.requirements).toEqual([
        { id: "1", name: "ログインできる" },
        { id: "2", name: "データ取得" },
      ]);
      expect(result.designMappings).toEqual([
        { reqId: "1", designElement: "AuthService.login()", file: "src/services/auth.ts" },
        { reqId: "2", designElement: "DataService.fetch()", file: "src/services/data.ts" },
      ]);
      expect(result.taskMappings).toEqual([
        { taskId: "1", reqIds: ["1"] },
        { taskId: "2", reqIds: ["1", "2"] },
      ]);
    });
  });
});
