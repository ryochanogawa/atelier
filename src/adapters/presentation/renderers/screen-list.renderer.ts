import type { ScreenListSlide } from "../../../application/dto/slide-plan.dto.js";
import { type SlideRequest, type SlideRenderer, C, CW, MX, CONTENT_Y, CONTENT_H, uid, addPageTitle, createRoundRect, styleText } from "./base.renderer.js";

export class ScreenListRenderer implements SlideRenderer<ScreenListSlide> {
  render(r: SlideRequest[], d: ScreenListSlide): void {
    const s = uid("sl");
    r.push({ createSlide: { objectId: s } });
    addPageTitle(r, s, d.title);

    const screens = d.screens.slice(0, 4);
    const cols = Math.min(screens.length, 2);
    const rows = Math.ceil(screens.length / cols);
    const cardW = Math.floor((CW - 200_000) / cols);
    const cardH = Math.floor((CONTENT_H - 150_000 * (rows - 1)) / rows);

    for (let i = 0; i < screens.length; i++) {
      const scr = screens[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = MX + col * (cardW + 200_000);
      const y = CONTENT_Y + row * (cardH + 150_000);

      const cid = createRoundRect(r, s, { x, y, w: cardW, h: cardH, bg: C.white, border: C.lightGray });

      const cardText = `${scr.icon}  ${scr.name}\n${scr.description}`;
      r.push({ insertText: { objectId: cid, text: cardText, insertionIndex: 0 } });

      const titleLen = `${scr.icon}  ${scr.name}`.length;
      r.push({
        updateTextStyle: {
          objectId: cid,
          style: { fontSize: { magnitude: 14, unit: "PT" }, bold: true, fontFamily: "Noto Sans JP", foregroundColor: { opaqueColor: { rgbColor: C.navy } } },
          textRange: { type: "FIXED_RANGE", startIndex: 0, endIndex: titleLen },
          fields: "fontSize,bold,fontFamily,foregroundColor",
        },
      });
      r.push({
        updateTextStyle: {
          objectId: cid,
          style: { fontSize: { magnitude: 11, unit: "PT" }, fontFamily: "Noto Sans JP", foregroundColor: { opaqueColor: { rgbColor: C.darkGray } } },
          textRange: { type: "FIXED_RANGE", startIndex: titleLen, endIndex: cardText.length },
          fields: "fontSize,fontFamily,foregroundColor",
        },
      });
      r.push({
        updateParagraphStyle: {
          objectId: cid,
          style: { spaceAbove: { magnitude: 12, unit: "PT" } },
          textRange: { type: "ALL" },
          fields: "spaceAbove",
        },
      });
    }
  }
}
