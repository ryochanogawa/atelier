import { describe, it, expect } from "vitest";
import { parseClientRequirements } from "../../../src/application/dto/client-requirements.dto.js";

const VALID_JSON = {
  projectInfo: {
    projectName: "テストプロジェクト",
    documentTitle: "要件定義書",
    version: "1.0",
    author: "テスト太郎",
    createdDate: "2026-04-01",
    updatedDate: "2026-04-02",
  },
  processOverview: "テストシステムの処理概要",
  requirements: [
    {
      id: "REQ-001",
      category: "認証",
      name: "ログイン機能",
      description: "ユーザーがログインできる",
      priority: "Must" as const,
      acceptanceCriteria: "認証成功時にダッシュボードが表示される",
    },
  ],
  inputParameters: [
    { no: 1, dataId: "IN-001", itemName: "ユーザーID", digits: "20", type: "文字列", remarks: "" },
  ],
  outputParameters: [
    { no: 1, dataId: "OUT-001", itemName: "アクセストークン", digits: "256", type: "文字列", remarks: "" },
  ],
  businessFlows: [
    {
      flowName: "ログインフロー",
      description: "ユーザー認証の流れ",
      actors: ["ユーザー", "システム"],
      steps: [
        { stepNumber: 1, actor: "ユーザー", action: "IDとパスワードを入力", details: "", branchCondition: "", branchYes: "", branchNo: "" },
        { stepNumber: 2, actor: "システム", action: "認証処理", details: "DBと照合", branchCondition: "認証成功？", branchYes: 3, branchNo: 4 },
        { stepNumber: 3, actor: "システム", action: "ダッシュボード表示", details: "", branchCondition: "", branchYes: "", branchNo: "" },
        { stepNumber: 4, actor: "システム", action: "エラー表示", details: "", branchCondition: "", branchYes: "", branchNo: "" },
      ],
    },
  ],
  screens: [
    {
      screenId: "SCR-001",
      screenName: "ログイン画面",
      description: "認証画面",
      mainItems: ["ユーザーID", "パスワード"],
      relatedFlows: ["ログインフロー"],
      transitions: ["SCR-002"],
    },
  ],
  terminology: [
    { term: "アクセストークン", definition: "認証済みユーザーの識別子", relatedDomain: "認証" },
  ],
  relatedSettings: [],
};

describe("parseClientRequirements", () => {
  it("正常なJSONをパースできる", () => {
    const result = parseClientRequirements(JSON.stringify(VALID_JSON));
    expect(result.projectInfo.projectName).toBe("テストプロジェクト");
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].id).toBe("REQ-001");
    expect(result.businessFlows).toHaveLength(1);
    expect(result.businessFlows[0].steps).toHaveLength(4);
  });

  it("コードブロック付きJSONをパースできる", () => {
    const wrapped = "以下が要件定義です：\n```json\n" + JSON.stringify(VALID_JSON) + "\n```\n追加のコメント";
    const result = parseClientRequirements(wrapped);
    expect(result.projectInfo.projectName).toBe("テストプロジェクト");
    expect(result.requirements).toHaveLength(1);
  });

  it("前後にテキストがある生JSONをパースできる", () => {
    const wrapped = "結果は以下の通りです:\n" + JSON.stringify(VALID_JSON) + "\n以上です。";
    const result = parseClientRequirements(wrapped);
    expect(result.projectInfo.projectName).toBe("テストプロジェクト");
  });

  it("不正なJSONでエラーをスローする", () => {
    expect(() => parseClientRequirements("{invalid json}")).toThrow();
  });

  it("必須フィールド欠損でバリデーションエラーをスローする", () => {
    const incomplete = { projectInfo: { projectName: "テスト" } };
    expect(() => parseClientRequirements(JSON.stringify(incomplete))).toThrow(
      "バリデーションに失敗しました",
    );
  });

  it("デフォルト値が適用される", () => {
    const minimal = {
      projectInfo: { projectName: "最小", documentTitle: "テスト" },
      requirements: [
        { id: "R-1", category: "機能", name: "テスト", description: "テスト", priority: "Must" },
      ],
      businessFlows: [
        { flowName: "フロー1", actors: ["ユーザー"], steps: [{ stepNumber: 1, actor: "ユーザー", action: "操作" }] },
      ],
    };
    const result = parseClientRequirements(JSON.stringify(minimal));
    expect(result.projectInfo.version).toBe("1.0");
    expect(result.projectInfo.author).toBe("");
    expect(result.inputParameters).toEqual([]);
    expect(result.outputParameters).toEqual([]);
    expect(result.screens).toEqual([]);
    expect(result.terminology).toEqual([]);
  });

  it("不正な優先度でバリデーションエラーをスローする", () => {
    const badPriority = {
      ...VALID_JSON,
      requirements: [
        { id: "R-1", category: "機能", name: "テスト", description: "テスト", priority: "Invalid" },
      ],
    };
    expect(() => parseClientRequirements(JSON.stringify(badPriority))).toThrow(
      "バリデーションに失敗しました",
    );
  });

  it("空文字列でJSON.parseエラーをスローする", () => {
    expect(() => parseClientRequirements("")).toThrow();
  });

  it("JSONが含まれないテキストでエラーをスローする", () => {
    expect(() => parseClientRequirements("これはJSONではありません")).toThrow();
  });

  it("言語指定なしのコードブロックからJSONを抽出できる", () => {
    const wrapped = "結果:\n```\n" + JSON.stringify(VALID_JSON) + "\n```";
    const result = parseClientRequirements(wrapped);
    expect(result.projectInfo.projectName).toBe("テストプロジェクト");
  });

  it("processOverview のデフォルト値が空文字列である", () => {
    const withoutOverview = {
      projectInfo: { projectName: "テスト", documentTitle: "テスト" },
      requirements: [
        { id: "R-1", category: "機能", name: "テスト", description: "テスト", priority: "Must" },
      ],
      businessFlows: [
        { flowName: "フロー", actors: ["A"], steps: [{ stepNumber: 1, actor: "A", action: "操作" }] },
      ],
    };
    const result = parseClientRequirements(JSON.stringify(withoutOverview));
    expect(result.processOverview).toBe("");
  });

  it("relatedSettings が正しくパースされる", () => {
    const withSettings = {
      ...VALID_JSON,
      relatedSettings: [
        { settingItem: "DB接続先", settingLocation: "環境変数", remarks: "本番用" },
        { settingItem: "ログレベル" },
      ],
    };
    const result = parseClientRequirements(JSON.stringify(withSettings));
    expect(result.relatedSettings).toHaveLength(2);
    expect(result.relatedSettings[0].settingItem).toBe("DB接続先");
    expect(result.relatedSettings[1].settingLocation).toBe("");
    expect(result.relatedSettings[1].remarks).toBe("");
  });

  it("複数の要件を持つデータを正しくパースできる", () => {
    const multiReqs = {
      ...VALID_JSON,
      requirements: [
        { id: "R-1", category: "機能", name: "機能A", description: "説明A", priority: "Must" },
        { id: "R-2", category: "性能", name: "機能B", description: "説明B", priority: "Should" },
        { id: "R-3", category: "UI", name: "機能C", description: "説明C", priority: "Could" },
      ],
    };
    const result = parseClientRequirements(JSON.stringify(multiReqs));
    expect(result.requirements).toHaveLength(3);
    expect(result.requirements[0].priority).toBe("Must");
    expect(result.requirements[1].priority).toBe("Should");
    expect(result.requirements[2].priority).toBe("Could");
  });

  it("branchYes/branchNo に数値と文字列の両方を受け入れる", () => {
    const result = parseClientRequirements(JSON.stringify(VALID_JSON));
    const step2 = result.businessFlows[0].steps[1];
    expect(step2.branchYes).toBe(3);
    expect(step2.branchNo).toBe(4);

    const withStringBranch = {
      ...VALID_JSON,
      businessFlows: [{
        ...VALID_JSON.businessFlows[0],
        steps: [
          { stepNumber: 1, actor: "ユーザー", action: "操作", branchCondition: "条件？", branchYes: "次へ", branchNo: "終了" },
        ],
      }],
    };
    const result2 = parseClientRequirements(JSON.stringify(withStringBranch));
    expect(result2.businessFlows[0].steps[0].branchYes).toBe("次へ");
  });
});
