import { describe, it, expect } from "vitest";
import { FacetKind, createFacet } from "../../../src/domain/value-objects/facet.vo.js";

describe("Facet Value Object", () => {
  describe("FacetKind", () => {
    it("すべてのファセット種別が定義されている", () => {
      expect(FacetKind.Persona).toBe("persona");
      expect(FacetKind.Policy).toBe("policy");
      expect(FacetKind.Instruction).toBe("instruction");
      expect(FacetKind.Knowledge).toBe("knowledge");
      expect(FacetKind.Contract).toBe("contract");
    });
  });

  describe("createFacet", () => {
    it("有効なパラメータでFacetを生成する", () => {
      const facet = createFacet(FacetKind.Persona, "あなたはエンジニアです", 10);

      expect(facet.kind).toBe(FacetKind.Persona);
      expect(facet.content).toBe("あなたはエンジニアです");
      expect(facet.priority).toBe(10);
    });

    it("priorityのデフォルト値は0", () => {
      const facet = createFacet(FacetKind.Policy, "コーディング規約");

      expect(facet.priority).toBe(0);
    });

    it("生成されたFacetはfreezeされている", () => {
      const facet = createFacet(FacetKind.Knowledge, "ドメイン知識");

      expect(Object.isFrozen(facet)).toBe(true);
    });

    it("空のcontentでエラーをスローする", () => {
      expect(() => createFacet(FacetKind.Instruction, "")).toThrow(
        'Facet content must not be empty for kind "instruction"',
      );
    });

    it("空白のみのcontentでエラーをスローする", () => {
      expect(() => createFacet(FacetKind.Contract, "   ")).toThrow(
        'Facet content must not be empty for kind "contract"',
      );
    });
  });
});
