import { describe, it, expect } from "vitest";
import { Stroke, type StrokeDefinition } from "../../../src/domain/models/stroke.model.js";
import { StrokeStatus } from "../../../src/domain/value-objects/stroke-status.vo.js";
import { StrokeError } from "../../../src/domain/errors/atelier-error.js";

function createStrokeDef(overrides: Partial<StrokeDefinition> = {}): StrokeDefinition {
  return {
    name: "test-stroke",
    palette: "default",
    medium: "claude",
    allowEdit: false,
    instruction: "テスト指示",
    inputs: ["input1"],
    outputs: ["output1"],
    transitions: [],
    contract: "markdown",
    ...overrides,
  };
}

describe("Stroke Model", () => {
  describe("コンストラクタ", () => {
    it("有効な定義でStrokeを生成する", () => {
      const stroke = new Stroke(createStrokeDef());

      expect(stroke.name).toBe("test-stroke");
      expect(stroke.palette).toBe("default");
      expect(stroke.medium).toBe("claude");
      expect(stroke.allowEdit).toBe(false);
      expect(stroke.instruction).toBe("テスト指示");
      expect(stroke.inputs).toEqual(["input1"]);
      expect(stroke.outputs).toEqual(["output1"]);
      expect(stroke.transitions).toEqual([]);
      expect(stroke.contract).toBe("markdown");
      expect(stroke.status).toBe(StrokeStatus.Pending);
    });

    it("空の名前でStrokeErrorをスローする", () => {
      expect(() => new Stroke(createStrokeDef({ name: "" }))).toThrow(StrokeError);
      expect(() => new Stroke(createStrokeDef({ name: "  " }))).toThrow(StrokeError);
    });

    it("dependsOnが未指定の場合は空配列", () => {
      const stroke = new Stroke(createStrokeDef({ dependsOn: undefined }));
      expect(stroke.dependsOn).toEqual([]);
    });

    it("dependsOnが指定された場合はfreezeされた配列", () => {
      const stroke = new Stroke(createStrokeDef({ dependsOn: ["step1", "step2"] }));
      expect(stroke.dependsOn).toEqual(["step1", "step2"]);
      expect(Object.isFrozen(stroke.dependsOn)).toBe(true);
    });

    it("knowledgeが未指定の場合は空配列", () => {
      const stroke = new Stroke(createStrokeDef({ knowledge: undefined }));
      expect(stroke.knowledge).toEqual([]);
    });

    it("inputs/outputsはfreezeされている", () => {
      const stroke = new Stroke(createStrokeDef());
      expect(Object.isFrozen(stroke.inputs)).toBe(true);
      expect(Object.isFrozen(stroke.outputs)).toBe(true);
    });

    it("オプショナルフィールドが設定される", () => {
      const stroke = new Stroke(createStrokeDef({
        policy: "strict",
        model: "gpt-4",
        allowedTools: ["read", "write"],
        permissionMode: "edit",
      }));

      expect(stroke.policy).toBe("strict");
      expect(stroke.model).toBe("gpt-4");
      expect(stroke.allowedTools).toEqual(["read", "write"]);
      expect(stroke.permissionMode).toBe("edit");
    });

    it("arpeggio設定がfreezeされる", () => {
      const stroke = new Stroke(createStrokeDef({
        arpeggio: {
          sourcePath: "/data.csv",
          batchSize: 10,
          concurrency: 3,
          merge: "concat",
          separator: "\n",
          maxRetries: 2,
          retryDelayMs: 1000,
        },
      }));

      expect(stroke.arpeggio).toBeDefined();
      expect(stroke.arpeggio!.batchSize).toBe(10);
      expect(Object.isFrozen(stroke.arpeggio)).toBe(true);
    });

    it("qualityGatesがfreezeされる", () => {
      const stroke = new Stroke(createStrokeDef({
        qualityGates: [{ name: "tests_pass", condition: "tests_pass" }],
      }));

      expect(stroke.qualityGates).toHaveLength(1);
      expect(Object.isFrozen(stroke.qualityGates)).toBe(true);
    });
  });

  describe("transitionTo", () => {
    it("有効な遷移を実行できる", () => {
      const stroke = new Stroke(createStrokeDef());

      stroke.transitionTo(StrokeStatus.Composing);
      expect(stroke.status).toBe(StrokeStatus.Composing);

      stroke.transitionTo(StrokeStatus.Executing);
      expect(stroke.status).toBe(StrokeStatus.Executing);

      stroke.transitionTo(StrokeStatus.Completed);
      expect(stroke.status).toBe(StrokeStatus.Completed);
    });

    it("無効な遷移でStrokeErrorをスローする", () => {
      const stroke = new Stroke(createStrokeDef());

      expect(() => stroke.transitionTo(StrokeStatus.Completed)).toThrow(StrokeError);
      expect(() => stroke.transitionTo(StrokeStatus.Completed)).toThrow(
        /Invalid stroke transition/,
      );
    });

    it("Critiquing → Retouching → Executing のリトライフロー", () => {
      const stroke = new Stroke(createStrokeDef());

      stroke.transitionTo(StrokeStatus.Composing);
      stroke.transitionTo(StrokeStatus.Executing);
      stroke.transitionTo(StrokeStatus.Critiquing);
      stroke.transitionTo(StrokeStatus.Retouching);
      stroke.transitionTo(StrokeStatus.Executing);
      stroke.transitionTo(StrokeStatus.Completed);

      expect(stroke.status).toBe(StrokeStatus.Completed);
    });
  });

  describe("isTerminal", () => {
    it("Pending は終端でない", () => {
      const stroke = new Stroke(createStrokeDef());
      expect(stroke.isTerminal).toBe(false);
    });

    it("Completed は終端", () => {
      const stroke = new Stroke(createStrokeDef());
      stroke.transitionTo(StrokeStatus.Composing);
      stroke.transitionTo(StrokeStatus.Executing);
      stroke.transitionTo(StrokeStatus.Completed);
      expect(stroke.isTerminal).toBe(true);
    });

    it("Failed は終端", () => {
      const stroke = new Stroke(createStrokeDef());
      stroke.transitionTo(StrokeStatus.Composing);
      stroke.transitionTo(StrokeStatus.Failed);
      expect(stroke.isTerminal).toBe(true);
    });

    it("Skipped は終端", () => {
      const stroke = new Stroke(createStrokeDef());
      stroke.transitionTo(StrokeStatus.Skipped);
      expect(stroke.isTerminal).toBe(true);
    });
  });
});
