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
  it("1シート帳票形式で出力される", () => {
    const dto = createMinimalDto();
    const doc = formatClientRequirements(dto);

    expect(doc.title).toBe("テストプロジェクト - 要件定義書");
    expect(doc.sheets).toHaveLength(1);
    expect(doc.sheets[0].sheetName).toBe("要件定義書");
  });

  it("46列分の列幅が設定される", () => {
    const dto = createMinimalDto();
    const doc = formatClientRequirements(dto);
    const sheet = doc.sheets[0];

    expect(sheet.columnWidths).toHaveLength(46);
  });

  it("プロジェクト情報が帳票ヘッダーに含まれる", () => {
    const dto = createMinimalDto();
    const doc = formatClientRequirements(dto);
    const sheet = doc.sheets[0];

    const titleCell = sheet.cells.find((c) => c.value === "要件定義書");
    expect(titleCell).toBeDefined();

    const projectNameCell = sheet.cells.find((c) => c.value === "テストプロジェクト");
    expect(projectNameCell).toBeDefined();
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
    const sheet = doc.sheets[0];
    const titleCell = sheet.cells.find((c) => c.value === "要件定義書");
    expect(titleCell).toBeDefined();
  });

  it("入力パラメータセクションが含まれる", () => {
    const dto = createMinimalDto({
      inputParameters: [
        { no: 1, dataId: "IN-001", itemName: "ユーザーID", digits: "20", type: "文字列", remarks: "" },
      ],
    });
    const doc = formatClientRequirements(dto);
    const sheet = doc.sheets[0];

    const sectionHeader = sheet.cells.find((c) => c.value === "入力パラメータ");
    expect(sectionHeader).toBeDefined();

    const dataIdCell = sheet.cells.find((c) => c.value === "IN-001");
    expect(dataIdCell).toBeDefined();

    const itemNameCell = sheet.cells.find((c) => c.value === "ユーザーID");
    expect(itemNameCell).toBeDefined();
  });

  it("入力パラメータが空でも10行分の枠が確保される", () => {
    const dto = createMinimalDto({ inputParameters: [] });
    const doc = formatClientRequirements(dto);
    const sheet = doc.sheets[0];

    // 10行分のNo値（1-10）が存在する
    const paramHeaderRow = sheet.cells.find((c) => c.value === "入力パラメータ");
    expect(paramHeaderRow).toBeDefined();

    // Noが1〜10まで入力パラメータセクションに存在
    const noValues = sheet.cells.filter((c) => typeof c.value === "number" && c.value >= 1 && c.value <= 10);
    expect(noValues.length).toBeGreaterThanOrEqual(10);
  });

  it("関連設定セクションが含まれる", () => {
    const dto = createMinimalDto({
      relatedSettings: [
        { settingItem: "タイムゾーン", settingLocation: "環境変数", remarks: "JST" },
      ],
    });
    const doc = formatClientRequirements(dto);
    const sheet = doc.sheets[0];

    const settingHeader = sheet.cells.find((c) => c.value === "関連設定");
    expect(settingHeader).toBeDefined();

    const tzCell = sheet.cells.find((c) => c.value === "タイムゾーン");
    expect(tzCell).toBeDefined();
  });

  it("要件用語セクションが含まれる", () => {
    const dto = createMinimalDto({
      terminology: [
        { term: "API", definition: "インターフェース", relatedDomain: "技術" },
      ],
    });
    const doc = formatClientRequirements(dto);
    const sheet = doc.sheets[0];

    const termHeader = sheet.cells.find((c) => c.value === "要件用語");
    expect(termHeader).toBeDefined();

    const termCell = sheet.cells.find((c) => c.value === "API");
    expect(termCell).toBeDefined();

    const defCell = sheet.cells.find((c) => c.value === "インターフェース");
    expect(defCell).toBeDefined();
  });

  it("備考セクションが含まれる", () => {
    const dto = createMinimalDto();
    const doc = formatClientRequirements(dto);
    const sheet = doc.sheets[0];

    const remarksHeader = sheet.cells.find((c) => c.value === "備考");
    expect(remarksHeader).toBeDefined();
  });

  it("スケジュール項目（設計〜受入テスト）が含まれる", () => {
    const dto = createMinimalDto();
    const doc = formatClientRequirements(dto);
    const sheet = doc.sheets[0];

    const scheduleItems = ["設計", "実装", "単体テスト", "結合テスト", "受入テスト"];
    for (const item of scheduleItems) {
      const cell = sheet.cells.find((c) => c.value === item);
      expect(cell).toBeDefined();
    }
  });

  it("processOverview が空の場合でも設定内容欄は存在する", () => {
    const dto = createMinimalDto({ processOverview: "" });
    const doc = formatClientRequirements(dto);
    const sheet = doc.sheets[0];

    // 概要ラベルは存在する
    const overviewLabel = sheet.cells.find((c) => c.value === "概要");
    expect(overviewLabel).toBeDefined();
  });

  it("セル結合が多数使用されている", () => {
    const dto = createMinimalDto();
    const doc = formatClientRequirements(dto);
    const sheet = doc.sheets[0];

    // 帳票形式のため結合が多い
    expect(sheet.merges.length).toBeGreaterThan(20);
  });

  it("ヘッダーラベルに水色背景(0.6, 0.8, 1.0)が適用される", () => {
    const dto = createMinimalDto();
    const doc = formatClientRequirements(dto);
    const sheet = doc.sheets[0];

    // Row 0のヘッダーフォーマットを確認
    const headerFmt = sheet.formats.find((f) => f.row === 0 && f.bgColor);
    expect(headerFmt).toBeDefined();
    expect(headerFmt!.bgColor).toEqual({ red: 0.6, green: 0.8, blue: 1.0 });
  });
});
