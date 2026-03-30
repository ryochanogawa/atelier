import { describe, it, expect } from "vitest";
import { parseStatusTag } from "../../../src/domain/services/conductor-parser.js";

describe("parseStatusTag", () => {
  it("[STATUS: approved] → 'approved'", () => {
    expect(parseStatusTag("[STATUS: approved]")).toBe("approved");
  });

  it("[STATUS: needs_fix] → 'needs_fix'", () => {
    expect(parseStatusTag("[STATUS: needs_fix]")).toBe("needs_fix");
  });

  it("[STATUS: rejected] → 'rejected'", () => {
    expect(parseStatusTag("[STATUS: rejected]")).toBe("rejected");
  });

  it("大文字 [STATUS: APPROVED] → 'approved'（小文字化）", () => {
    expect(parseStatusTag("[STATUS: APPROVED]")).toBe("approved");
  });

  it("スペース [STATUS:  approved ] → 'approved'", () => {
    // \w+ は空白を含まないため、余分なスペースがあっても単語部分のみキャプチャされる
    expect(parseStatusTag("[STATUS:  approved ]")).toBe("approved");
  });

  it("タグなしの通常テキスト → null", () => {
    expect(parseStatusTag("This is a normal response without any tags.")).toBeNull();
  });

  it("空文字列 → null", () => {
    expect(parseStatusTag("")).toBeNull();
  });

  it("複数タグがある場合 → 最初のタグを返す", () => {
    const response = "First [STATUS: approved] then [STATUS: rejected] later";
    expect(parseStatusTag(response)).toBe("approved");
  });

  it("タグが文章の途中にある場合 → 正しくパース", () => {
    const response =
      "The review is complete and the result is [STATUS: approved] so we can proceed.";
    expect(parseStatusTag(response)).toBe("approved");
  });
});
