import type { OverviewSlide } from "../../../application/dto/slide-plan.dto.js";
import { type SlideRequest, type SlideRenderer, C, CW, MX, CONTENT_Y, CONTENT_H, uid, addPageTitle, addTextBox } from "./base.renderer.js";

export class OverviewRenderer implements SlideRenderer<OverviewSlide> {
  render(r: SlideRequest[], d: OverviewSlide): void {
    const s = uid("ov");
    r.push({ createSlide: { objectId: s } });
    addPageTitle(r, s, d.title);

    // アイコン
    addTextBox(r, s, d.icon, {
      x: MX, y: CONTENT_Y, w: 500_000, h: 500_000, fontSize: 28,
    });

    // 本文
    addTextBox(r, s, d.body, {
      x: MX + 600_000, y: CONTENT_Y, w: CW - 600_000, h: CONTENT_H,
      fontSize: 14, color: C.darkGray, lineSpacing: 180,
    });
  }
}
