import type { CoverSlide } from "../../../application/dto/slide-plan.dto.js";
import { type SlideRequest, type SlideRenderer, C, uid, addTextBox, SLIDE_W, MX } from "./base.renderer.js";

export class CoverRenderer implements SlideRenderer<CoverSlide> {
  render(r: SlideRequest[], d: CoverSlide): void {
    const s = uid("cover");
    r.push({ createSlide: { objectId: s, insertionIndex: "0" } });

    const textX = 1_100_000;
    const textW = SLIDE_W - MX - textX;

    // ダークネイビー背景
    r.push({
      updatePageProperties: {
        objectId: s,
        pageProperties: { pageBackgroundFill: { solidFill: { color: { rgbColor: C.navy } } } },
        fields: "pageBackgroundFill",
      },
    });

    // 左サイドのアクセントライン
    const accentLine = uid("cl");
    r.push({
      createLine: {
        objectId: accentLine, lineCategory: "STRAIGHT",
        elementProperties: {
          pageObjectId: s,
          size: { width: { magnitude: 0, unit: "EMU" }, height: { magnitude: 3_000_000, unit: "EMU" } },
          transform: { scaleX: 1, scaleY: 1, translateX: 800_000, translateY: 1_200_000, unit: "EMU" },
        },
      },
    });
    r.push({
      updateLineProperties: {
        objectId: accentLine,
        lineProperties: { lineFill: { solidFill: { color: { rgbColor: C.accent } } }, weight: { magnitude: 4, unit: "PT" } },
        fields: "lineFill,weight",
      },
    });

    // プロジェクト名
    addTextBox(r, s, d.projectName, {
      x: textX, y: 1_300_000, w: textW, h: 1_000_000,
      fontSize: 34, bold: true, color: C.white,
    });

    // サブタイトル
    if (d.subtitle) {
      addTextBox(r, s, d.subtitle, {
        x: textX, y: 2_400_000, w: textW, h: 600_000,
        fontSize: 16, color: C.sky,
      });
    }

    // 横線
    const divLine = uid("dl");
    r.push({
      createLine: {
        objectId: divLine, lineCategory: "STRAIGHT",
        elementProperties: {
          pageObjectId: s,
          size: { width: { magnitude: 4_000_000, unit: "EMU" }, height: { magnitude: 0, unit: "EMU" } },
          transform: { scaleX: 1, scaleY: 1, translateX: textX, translateY: 3_200_000, unit: "EMU" },
        },
      },
    });
    r.push({
      updateLineProperties: {
        objectId: divLine,
        lineProperties: { lineFill: { solidFill: { color: { rgbColor: C.accent } } }, weight: { magnitude: 1, unit: "PT" } },
        fields: "lineFill,weight",
      },
    });

    // メタ情報
    const meta = [d.version ? `Version ${d.version}` : "", d.author, d.date].filter(Boolean).join("  ·  ");
    if (meta) {
      addTextBox(r, s, meta, {
        x: textX, y: 3_400_000, w: textW, h: 300_000,
        fontSize: 10, color: C.lightGray,
      });
    }
  }
}
