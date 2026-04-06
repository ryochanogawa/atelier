import type { DetailCardsSlide } from "../../../application/dto/slide-plan.dto.js";
import { type SlideRequest, type SlideRenderer, C, CW, MX, CONTENT_Y, CONTENT_H, uid, addPageTitle, addTextBox, styleText, createRoundRect } from "./base.renderer.js";

const BADGE_COLORS: Record<string, { bg: import("./base.renderer.js").RgbColor }> = {
  orange: { bg: { red: 1, green: 0.94, blue: 0.85 } },
  green: { bg: { red: 0.88, green: 0.96, blue: 0.91 } },
  gray: { bg: { red: 0.95, green: 0.95, blue: 0.96 } },
};

export class DetailCardsRenderer implements SlideRenderer<DetailCardsSlide> {
  render(r: SlideRequest[], d: DetailCardsSlide): void {
    const s = uid("dc");
    r.push({ createSlide: { objectId: s } });
    addPageTitle(r, s, d.title);

    const cards = d.cards.slice(0, 3);
    const gap = 150_000;
    const cardH = Math.floor((CONTENT_H - gap * (cards.length - 1)) / cards.length);

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const y = CONTENT_Y + i * (cardH + gap);
      const h = Math.min(cardH, 1_200_000);

      // カード背景
      createRoundRect(r, s, { x: MX, y, w: CW, h, bg: C.white, border: C.lightGray });

      // バッジ
      if (card.badge) {
        const bc = BADGE_COLORS[card.badgeColor] || BADGE_COLORS.gray;
        const badgeId = createRoundRect(r, s, {
          x: MX + CW - 700_000, y: y + 100_000, w: 550_000, h: 250_000,
          bg: bc.bg,
        });
        r.push({ insertText: { objectId: badgeId, text: card.badge, insertionIndex: 0 } });
        styleText(r, badgeId, { fontSize: 9, bold: true, color: C.darkGray, align: "CENTER" });
      }

      // ID + 名前
      const heading = card.id ? `${card.id}  ${card.name}` : card.name;
      addTextBox(r, s, heading, {
        x: MX + 150_000, y: y + 80_000, w: CW - 1_000_000, h: 300_000,
        fontSize: 13, bold: true, color: C.navy,
      });

      // 説明
      addTextBox(r, s, card.description, {
        x: MX + 150_000, y: y + 400_000, w: CW - 300_000, h: h - 500_000,
        fontSize: 11, color: C.darkGray, lineSpacing: 160,
      });
    }
  }
}
