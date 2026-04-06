import type { CardGridSlide } from "../../../application/dto/slide-plan.dto.js";
import { type SlideRequest, type SlideRenderer, C, CW, MX, CONTENT_Y, CONTENT_H, uid, addPageTitle, createRoundRect, styleText } from "./base.renderer.js";

export class CardGridRenderer implements SlideRenderer<CardGridSlide> {
  render(r: SlideRequest[], d: CardGridSlide): void {
    const s = uid("cg");
    r.push({ createSlide: { objectId: s } });
    addPageTitle(r, s, d.title);

    const cards = d.cards.slice(0, 6);
    const cols = Math.min(cards.length, 3);
    const rows = Math.ceil(cards.length / cols);
    const cardW = Math.floor((CW - 200_000 * (cols - 1)) / cols);
    const cardH = Math.floor((CONTENT_H - 150_000 * (rows - 1)) / rows);

    for (let i = 0; i < cards.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = MX + col * (cardW + 200_000);
      const y = CONTENT_Y + row * (cardH + 150_000);
      const card = cards[i];

      const cid = createRoundRect(r, s, { x, y, w: cardW, h: cardH, bg: C.white, border: C.lightGray });

      const cardText = `${card.icon}  ${card.heading}${card.subtext ? `\n${card.subtext}` : ""}`;
      r.push({ insertText: { objectId: cid, text: cardText, insertionIndex: 0 } });

      const titleLen = `${card.icon}  ${card.heading}`.length;
      r.push({
        updateTextStyle: {
          objectId: cid,
          style: { fontSize: { magnitude: 14, unit: "PT" }, bold: true, fontFamily: "Noto Sans JP", foregroundColor: { opaqueColor: { rgbColor: C.navy } } },
          textRange: { type: "FIXED_RANGE", startIndex: 0, endIndex: titleLen },
          fields: "fontSize,bold,fontFamily,foregroundColor",
        },
      });
      if (card.subtext) {
        r.push({
          updateTextStyle: {
            objectId: cid,
            style: { fontSize: { magnitude: 11, unit: "PT" }, fontFamily: "Noto Sans JP", foregroundColor: { opaqueColor: { rgbColor: C.gray } } },
            textRange: { type: "FIXED_RANGE", startIndex: titleLen, endIndex: cardText.length },
            fields: "fontSize,fontFamily,foregroundColor",
          },
        });
      }
      r.push({
        updateParagraphStyle: {
          objectId: cid,
          style: { alignment: "CENTER", spaceAbove: { magnitude: Math.floor(cardH / 12700 / 4), unit: "PT" } },
          textRange: { type: "ALL" },
          fields: "alignment,spaceAbove",
        },
      });
    }
  }
}
