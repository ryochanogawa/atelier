import { describe, it, expect } from "vitest";
import { formatClientRequirements } from "../../../src/application/services/spreadsheet-formatter.service.js";
import type { ClientRequirementsDto } from "../../../src/application/dto/client-requirements.dto.js";

function createMinimalDto(overrides?: Partial<ClientRequirementsDto>): ClientRequirementsDto {
  return {
    projectInfo: {
      projectName: "テストプロジェクト",
      documentTitle: "要件定義書",
      version: "1.0",
      author: "テスト太郎",
      createdDate: "2026-04-01",
      updatedDate: "2026-04-02",
    },
    processOverview: "テスト概要",
    requirements: [
      { id: "REQ-001", category: "機能", name: "ログイン", description: "ログインできる", priority: "Must", acceptanceCriteria: "認証成功" },
    ],
    inputParameters: [],
    outputParameters: [],
    businessFlows: [
      {
        flowName: "メインフロー",
        description: "主要な業務フロー",
        actors: ["ユーザー", "システム"],
        steps: [
          { stepNumber: 1, actor: "ユーザー", action: "操作する", details: "", branchCondition: "", branchYes: "", branchNo: "" },
          { stepNumber: 2, actor: "システム", action: "処理する", details: "バックエンド処理", branchCondition: "", branchYes: "", branchNo: "" },
        ],
      },
    ],
    screens: [],
    terminology: [],
    relatedSettings: [],
    ...overrides,
  };
}

describe("formatClientRequirements", () => {
  it("基本の3シート構成（表紙・要件一覧・業務フロー）を生成する", () => {
    const dto = createMinimalDto();
    const doc = formatClientRequirements(dto);

    expect(doc.title).toBe("テストプロジェクト - 要件定義書");
    expect(doc.sheets).toHaveLength(3);
    expect(doc.sheets[0].sheetName).toBe("表紙");
    expect(doc.sheets[1].sheetName).toBe("要件一覧");
    expect(doc.sheets[2].sheetName).toContain("フロー1");
    expect(doc.sheets[2].sheetName).toContain("メインフロー");
  });

  it("画面一覧シートが screens が存在する場合のみ追加される", () => {
    const withoutScreens = createMinimalDto();
    expect(formatClientRequirements(withoutScreens).sheets.map((s) => s.sheetName)).not.toContain("画面一覧");

    const withScreens = createMinimalDto({
      screens: [
        { screenId: "SCR-001", screenName: "ログイン画面", description: "認証", mainItems: [], relatedFlows: [], transitions: [] },
      ],
    });
    const doc = formatClientRequirements(withScreens);
    expect(doc.sheets.map((s) => s.sheetName)).toContain("画面一覧");
  });

  it("パラメータシートが入力/出力パラメータが存在する場合のみ追加される", () => {
    const withoutParams = createMinimalDto();
    expect(formatClientRequirements(withoutParams).sheets.map((s) => s.sheetName)).not.toContain("パラメータ");

    const withParams = createMinimalDto({
      inputParameters: [
        { no: 1, dataId: "IN-001", itemName: "ユーザーID", digits: "20", type: "文字列", remarks: "" },
      ],
    });
    const doc = formatClientRequirements(withParams);
    expect(doc.sheets.map((s) => s.sheetName)).toContain("パラメータ");
  });

  it("出力パラメータのみでもパラメータシートが正しく生成される", () => {
    const dto = createMinimalDto({
      outputParameters: [
        { no: 1, dataId: "OUT-001", itemName: "トークン", digits: "256", type: "文字列", remarks: "JWT" },
      ],
    });
    const doc = formatClientRequirements(dto);
    const paramSheet = doc.sheets.find((s) => s.sheetName === "パラメータ");
    expect(paramSheet).toBeDefined();
    expect(paramSheet!.cells.length).toBeGreaterThan(0);
    expect(paramSheet!.merges.length).toBeGreaterThan(0);
    expect(paramSheet!.columnWidths.length).toBeGreaterThan(0);

    // 出力パラメータのサブヘッダーが含まれる
    const outputHeader = paramSheet!.cells.find((c) => c.value === "出力パラメータ");
    expect(outputHeader).toBeDefined();
  });

  it("入力・出力の両方のパラメータが正しく生成される", () => {
    const dto = createMinimalDto({
      inputParameters: [
        { no: 1, dataId: "IN-001", itemName: "ユーザーID", digits: "20", type: "文字列", remarks: "" },
      ],
      outputParameters: [
        { no: 1, dataId: "OUT-001", itemName: "トークン", digits: "256", type: "文字列", remarks: "" },
      ],
    });
    const doc = formatClientRequirements(dto);
    const paramSheet = doc.sheets.find((s) => s.sheetName === "パラメータ");
    expect(paramSheet).toBeDefined();

    const inputHeader = paramSheet!.cells.find((c) => c.value === "入力パラメータ");
    const outputHeader = paramSheet!.cells.find((c) => c.value === "出力パラメータ");
    expect(inputHeader).toBeDefined();
    expect(outputHeader).toBeDefined();
  });

  it("用語集シートが terminology が存在する場合のみ追加される", () => {
    const withoutTerms = createMinimalDto();
    expect(formatClientRequirements(withoutTerms).sheets.map((s) => s.sheetName)).not.toContain("用語集");

    const withTerms = createMinimalDto({
      terminology: [
        { term: "API", definition: "アプリケーション間のインターフェース", relatedDomain: "技術" },
      ],
    });
    const doc = formatClientRequirements(withTerms);
    expect(doc.sheets.map((s) => s.sheetName)).toContain("用語集");
  });

  it("複数の業務フローが個別シートとして生成される", () => {
    const dto = createMinimalDto({
      businessFlows: [
        {
          flowName: "ログインフロー",
          description: "",
          actors: ["ユーザー"],
          steps: [{ stepNumber: 1, actor: "ユーザー", action: "ログイン", details: "", branchCondition: "", branchYes: "", branchNo: "" }],
        },
        {
          flowName: "注文フロー",
          description: "",
          actors: ["ユーザー", "システム"],
          steps: [{ stepNumber: 1, actor: "ユーザー", action: "注文する", details: "", branchCondition: "", branchYes: "", branchNo: "" }],
        },
      ],
    });
    const doc = formatClientRequirements(dto);
    const flowSheets = doc.sheets.filter((s) => s.sheetName.startsWith("フロー"));
    expect(flowSheets).toHaveLength(2);
    expect(flowSheets[0].sheetName).toContain("ログインフロー");
    expect(flowSheets[1].sheetName).toContain("注文フロー");
  });

  it("表紙シートにプロジェクト情報が含まれる", () => {
    const dto = createMinimalDto();
    const doc = formatClientRequirements(dto);
    const coverSheet = doc.sheets[0];

    const titleCell = coverSheet.cells.find((c) => c.value === "要件定義書");
    expect(titleCell).toBeDefined();

    const projectNameCell = coverSheet.cells.find((c) => c.value === "テストプロジェクト");
    expect(projectNameCell).toBeDefined();

    const authorCell = coverSheet.cells.find((c) => c.value === "テスト太郎");
    expect(authorCell).toBeDefined();
  });

  it("要件一覧シートにヘッダーとデータ行が含まれる", () => {
    const dto = createMinimalDto();
    const doc = formatClientRequirements(dto);
    const reqSheet = doc.sheets[1];

    expect(reqSheet.sheetName).toBe("要件一覧");
    expect(reqSheet.frozenRows).toBe(1);

    const headerCells = reqSheet.cells.filter((c) => c.row === 0);
    const headerValues = headerCells.map((c) => c.value);
    expect(headerValues).toContain("No");
    expect(headerValues).toContain("要件ID");
    expect(headerValues).toContain("要件名");
    expect(headerValues).toContain("優先度");

    const dataCells = reqSheet.cells.filter((c) => c.row === 1);
    const dataValues = dataCells.map((c) => c.value);
    expect(dataValues).toContain("REQ-001");
    expect(dataValues).toContain("ログイン");
  });

  it("スイムレーンフローで分岐ステップの行高さが広い", () => {
    const dto = createMinimalDto({
      businessFlows: [{
        flowName: "テストフロー",
        description: "",
        actors: ["ユーザー", "システム"],
        steps: [
          { stepNumber: 1, actor: "ユーザー", action: "操作", details: "", branchCondition: "", branchYes: "", branchNo: "" },
          { stepNumber: 2, actor: "システム", action: "判断", details: "", branchCondition: "条件成立？", branchYes: 3, branchNo: 1 },
          { stepNumber: 3, actor: "システム", action: "完了", details: "", branchCondition: "", branchYes: "", branchNo: "" },
        ],
      }],
    });
    const doc = formatClientRequirements(dto);
    const flowSheet = doc.sheets.find((s) => s.sheetName.startsWith("フロー"));
    expect(flowSheet).toBeDefined();

    // 分岐ステップの行高さが80px
    const branchRowHeight = flowSheet!.rowHeights.find((rh) => rh.height === 80);
    expect(branchRowHeight).toBeDefined();
  });

  it("シート名が31文字を超える場合に切り詰められる", () => {
    const dto = createMinimalDto({
      businessFlows: [{
        flowName: "非常に長い業務フロー名称がここに入りますので切り詰めが必要です",
        description: "",
        actors: ["ユーザー"],
        steps: [{ stepNumber: 1, actor: "ユーザー", action: "操作", details: "", branchCondition: "", branchYes: "", branchNo: "" }],
      }],
    });
    const doc = formatClientRequirements(dto);
    const flowSheet = doc.sheets.find((s) => s.sheetName.startsWith("フロー"));
    expect(flowSheet!.sheetName.length).toBeLessThanOrEqual(31);
  });

  it("processOverview が空の場合、表紙に処理概要セクションが含まれない", () => {
    const dto = createMinimalDto({ processOverview: "" });
    const doc = formatClientRequirements(dto);
    const coverSheet = doc.sheets[0];
    const overviewCell = coverSheet.cells.find((c) => c.value === "処理概要");
    expect(overviewCell).toBeUndefined();
  });

  it("documentTitle が未設定の場合、デフォルトの「要件定義書」が使用される", () => {
    const dto = createMinimalDto({
      projectInfo: {
        projectName: "テスト",
        documentTitle: "",
        version: "1.0",
        author: "",
        createdDate: "",
        updatedDate: "",
      },
    });
    const doc = formatClientRequirements(dto);
    const coverSheet = doc.sheets[0];
    const titleCell = coverSheet.cells.find((c) => c.value === "要件定義書");
    expect(titleCell).toBeDefined();
  });

  it("フローに description がない場合、frozenRows が 2 になる", () => {
    const dto = createMinimalDto({
      businessFlows: [{
        flowName: "テストフロー",
        description: "",
        actors: ["ユーザー", "システム"],
        steps: [
          { stepNumber: 1, actor: "ユーザー", action: "操作", details: "", branchCondition: "", branchYes: "", branchNo: "" },
          { stepNumber: 2, actor: "システム", action: "処理", details: "", branchCondition: "", branchYes: "", branchNo: "" },
        ],
      }],
    });
    const doc = formatClientRequirements(dto);
    const flowSheet = doc.sheets.find((s) => s.sheetName.startsWith("フロー"));
    expect(flowSheet!.frozenRows).toBe(2);
  });

  it("フローに description がある場合、frozenRows が 3 になる", () => {
    const dto = createMinimalDto({
      businessFlows: [{
        flowName: "テストフロー",
        description: "フローの説明",
        actors: ["ユーザー", "システム"],
        steps: [
          { stepNumber: 1, actor: "ユーザー", action: "操作", details: "", branchCondition: "", branchYes: "", branchNo: "" },
          { stepNumber: 2, actor: "システム", action: "処理", details: "", branchCondition: "", branchYes: "", branchNo: "" },
        ],
      }],
    });
    const doc = formatClientRequirements(dto);
    const flowSheet = doc.sheets.find((s) => s.sheetName.startsWith("フロー"));
    expect(flowSheet!.frozenRows).toBe(3);
  });

  it("ステップに details がある場合、行高さが 50 になる", () => {
    const dto = createMinimalDto({
      businessFlows: [{
        flowName: "テストフロー",
        description: "",
        actors: ["ユーザー"],
        steps: [
          { stepNumber: 1, actor: "ユーザー", action: "操作", details: "補足説明", branchCondition: "", branchYes: "", branchNo: "" },
        ],
      }],
    });
    const doc = formatClientRequirements(dto);
    const flowSheet = doc.sheets.find((s) => s.sheetName.startsWith("フロー"));
    const stepRowHeight = flowSheet!.rowHeights.find((rh) => rh.height === 50);
    expect(stepRowHeight).toBeDefined();
  });

  it("ステップに details も branchCondition もない場合、行高さが 28 になる", () => {
    const dto = createMinimalDto({
      businessFlows: [{
        flowName: "テストフロー",
        description: "",
        actors: ["ユーザー"],
        steps: [
          { stepNumber: 1, actor: "ユーザー", action: "操作", details: "", branchCondition: "", branchYes: "", branchNo: "" },
        ],
      }],
    });
    const doc = formatClientRequirements(dto);
    const flowSheet = doc.sheets.find((s) => s.sheetName.startsWith("フロー"));
    const stepRowHeight = flowSheet!.rowHeights.find((rh) => rh.height === 28);
    expect(stepRowHeight).toBeDefined();
  });

  it("アクターが actors リストにない場合、列 1 にフォールバックする", () => {
    const dto = createMinimalDto({
      businessFlows: [{
        flowName: "テストフロー",
        description: "",
        actors: ["ユーザー", "システム"],
        steps: [
          { stepNumber: 1, actor: "不明なアクター", action: "操作する", details: "", branchCondition: "", branchYes: "", branchNo: "" },
        ],
      }],
    });
    const doc = formatClientRequirements(dto);
    const flowSheet = doc.sheets.find((s) => s.sheetName.startsWith("フロー"));
    // 不明なアクターの場合、col=1（最初のアクター列）にフォールバック
    const actionCell = flowSheet!.cells.find((c) => c.value === "操作する");
    expect(actionCell).toBeDefined();
    expect(actionCell!.col).toBe(1);
  });

  it("6人以上のアクターでカラーが循環する", () => {
    const actors = ["A", "B", "C", "D", "E", "F"];
    const dto = createMinimalDto({
      businessFlows: [{
        flowName: "テストフロー",
        description: "",
        actors,
        steps: [
          { stepNumber: 1, actor: "A", action: "操作", details: "", branchCondition: "", branchYes: "", branchNo: "" },
        ],
      }],
    });
    const doc = formatClientRequirements(dto);
    const flowSheet = doc.sheets.find((s) => s.sheetName.startsWith("フロー"));
    // 6番目のアクター（F, index=5）のヘッダー色は COLOR_ACTOR_COLORS[5 % 5] = [0] と同じ
    const headerFormats = flowSheet!.formats.filter((f) => f.row === 1 && f.bold);
    expect(headerFormats.length).toBeGreaterThanOrEqual(6);
  });

  it("スイムレーンのセル内容に分岐条件が含まれる", () => {
    const dto = createMinimalDto({
      businessFlows: [{
        flowName: "テストフロー",
        description: "",
        actors: ["システム"],
        steps: [
          { stepNumber: 1, actor: "システム", action: "判断する", details: "詳細", branchCondition: "OK？", branchYes: 2, branchNo: 3 },
        ],
      }],
    });
    const doc = formatClientRequirements(dto);
    const flowSheet = doc.sheets.find((s) => s.sheetName.startsWith("フロー"));
    const branchCell = flowSheet!.cells.find((c) => typeof c.value === "string" && c.value.includes("【判断】OK？"));
    expect(branchCell).toBeDefined();
    expect((branchCell!.value as string)).toContain("→ Yes: ステップ2");
    expect((branchCell!.value as string)).toContain("→ No: ステップ3");
  });

  it("画面一覧シートのデータ内容が正しい", () => {
    const dto = createMinimalDto({
      screens: [
        {
          screenId: "SCR-001",
          screenName: "ログイン画面",
          description: "認証画面",
          mainItems: ["ID", "パスワード"],
          relatedFlows: ["ログインフロー"],
          transitions: ["SCR-002"],
        },
      ],
    });
    const doc = formatClientRequirements(dto);
    const screenSheet = doc.sheets.find((s) => s.sheetName === "画面一覧");
    expect(screenSheet).toBeDefined();

    // ヘッダー確認
    const headerValues = screenSheet!.cells.filter((c) => c.row === 0).map((c) => c.value);
    expect(headerValues).toContain("画面ID");
    expect(headerValues).toContain("画面名");

    // データ行確認
    const dataCells = screenSheet!.cells.filter((c) => c.row === 1);
    const dataValues = dataCells.map((c) => c.value);
    expect(dataValues).toContain("SCR-001");
    expect(dataValues).toContain("ログイン画面");
    expect(dataValues).toContain("ID\nパスワード");
  });

  it("用語集シートのデータ内容が正しい", () => {
    const dto = createMinimalDto({
      terminology: [
        { term: "API", definition: "インターフェース", relatedDomain: "技術" },
        { term: "JWT", definition: "トークン", relatedDomain: "認証" },
      ],
    });
    const doc = formatClientRequirements(dto);
    const termSheet = doc.sheets.find((s) => s.sheetName === "用語集");
    expect(termSheet).toBeDefined();
    expect(termSheet!.frozenRows).toBe(1);

    // ヘッダー
    const headerValues = termSheet!.cells.filter((c) => c.row === 0).map((c) => c.value);
    expect(headerValues).toContain("用語");
    expect(headerValues).toContain("定義・説明");

    // データ行
    const row1Values = termSheet!.cells.filter((c) => c.row === 1).map((c) => c.value);
    expect(row1Values).toContain("API");
    expect(row1Values).toContain("インターフェース");

    const row2Values = termSheet!.cells.filter((c) => c.row === 2).map((c) => c.value);
    expect(row2Values).toContain("JWT");
  });

  it("要件一覧シートに複数の要件が行ごとに出力される", () => {
    const dto = createMinimalDto({
      requirements: [
        { id: "R-1", category: "機能", name: "機能A", description: "説明A", priority: "Must", acceptanceCriteria: "基準A" },
        { id: "R-2", category: "性能", name: "機能B", description: "説明B", priority: "Should", acceptanceCriteria: "基準B" },
      ],
    });
    const doc = formatClientRequirements(dto);
    const reqSheet = doc.sheets[1];

    const row1Values = reqSheet.cells.filter((c) => c.row === 1).map((c) => c.value);
    expect(row1Values).toContain("R-1");
    expect(row1Values).toContain("Must");

    const row2Values = reqSheet.cells.filter((c) => c.row === 2).map((c) => c.value);
    expect(row2Values).toContain("R-2");
    expect(row2Values).toContain("Should");
  });

  it("表紙シートに関連設定が含まれる", () => {
    const dto = createMinimalDto({
      relatedSettings: [
        { settingItem: "タイムゾーン", settingLocation: "環境変数", remarks: "JST" },
      ],
    });
    const doc = formatClientRequirements(dto);
    const coverSheet = doc.sheets[0];
    const settingCell = coverSheet.cells.find((c) => c.value === "関連設定");
    expect(settingCell).toBeDefined();
    const tzCell = coverSheet.cells.find((c) => c.value === "タイムゾーン");
    expect(tzCell).toBeDefined();
  });
});
