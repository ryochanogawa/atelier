import type { BenefitsSlide } from "../../../application/dto/slide-plan.dto.js";
import { type SlideRequest, type SlideRenderer, C, CW, MX, CONTENT_Y, uid, addPageTitle, addTextBox, styleText, createRoundRect } from "./base.renderer.js";

export class BenefitsRenderer implements SlideRenderer<BenefitsSlide> {
  render(r: SlideRequest[], d: BenefitsSlide): void {
    const s = uid("bene");
    r.push({ createSlide: { objectId: s } });
    addPageTitle(r, s, d.title);

    const benefits = d.benefits.slice(0, 4);
    const cardW = Math.floor((CW - 200_000 * (benefits.length - 1)) / benefits.length);

    for (let i = 0; i < benefits.length; i++) {
      const x = MX + i * (cardW + 200_000);
      const y = CONTENT_Y + 200_000;

      // カード背景
      createRoundRect(r, s, { x, y, w: cardW, h: 2_800_000, bg: C.offWhite, border: C.lightGray });

      // アイコン
      addTextBox(r, s, benefits[i].icon, {
        x: x + Math.floor(cardW / 2) - 300_000, y: y + 200_000, w: 600_000, h: 500_000,
        fontSize: 32, align: "CENTER",
      });

      // 番号バッジ
      const badgeId = uid("badge");
      r.push({
        createShape: {
          objectId: badgeId, shapeType: "ELLIPSE",
          elementProperties: {
            pageObjectId: s,
            size: { width: { magnitude: 350_000, unit: "EMU" }, height: { magnitude: 350_000, unit: "EMU" } },
            transform: { scaleX: 1, scaleY: 1, translateX: x + Math.floor(cardW / 2) - 175_000, translateY: y + 750_000, unit: "EMU" },
          },
        },
      });
      r.push({
        updateShapeProperties: {
          objectId: badgeId,
          shapeProperties: { shapeBackgroundFill: { solidFill: { color: { rgbColor: C.accent } } }, outline: { propertyState: "NOT_RENDERED" } },
          fields: "shapeBackgroundFill,outline",
        },
      });
      r.push({ insertText: { objectId: badgeId, text: String(i + 1), insertionIndex: 0 } });
      styleText(r, badgeId, { fontSize: 14, bold: true, color: C.white, align: "CENTER" });

      // テキスト
      addTextBox(r, s, benefits[i].text, {
        x: x + 150_000, y: y + 1_250_000, w: cardW - 300_000, h: 1_400_000,
        fontSize: 12, color: C.darkGray, align: "CENTER",
      });
    }
  }
}
