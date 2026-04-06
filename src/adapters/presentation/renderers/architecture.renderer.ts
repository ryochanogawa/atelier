import type { ArchitectureSlide } from "../../../application/dto/slide-plan.dto.js";
import {
  type SlideRequest,
  type SlideRenderer,
  type RgbColor,
  C,
  CW,
  MX,
  SLIDE_W,
  SLIDE_H,
  uid,
  addPageTitle,
  addTextBox,
  styleText,
  createRoundRect,
  createLine,
  ACTOR_COLOR_MAP,
} from "./base.renderer.js";

// アクターカラー
const ARCH_ACTOR_COLORS: Record<string, RgbColor> = {
  red: { red: 0.88, green: 0.4, blue: 0.4 },
  green: { red: 0.42, green: 0.66, blue: 0.31 },
  orange: { red: 0.9, green: 0.57, blue: 0.22 },
  blue: { red: 0.15, green: 0.35, blue: 0.6 },
  purple: { red: 0.6, green: 0.35, blue: 0.65 },
  teal: { red: 0.1, green: 0.6, blue: 0.53 },
};

// 関係性ブロックのグラデーション風ヘッダー色
const REL_HEADER_COLORS: RgbColor[] = [
  { red: 0.6, green: 0.78, blue: 0.45 },   // 緑系グラデ
  { red: 0.9, green: 0.5, blue: 0.3 },      // 赤橙系グラデ
  { red: 0.4, green: 0.65, blue: 0.85 },    // 青系
  { red: 0.75, green: 0.56, blue: 0.0 },    // オリーブ
];

const CONTENT_BG: RgbColor = { red: 1, green: 0.95, blue: 0.8 };  // 薄黄色
const BORDER_COLOR: RgbColor = { red: 0.1, green: 0.1, blue: 0.1 };

export class ArchitectureRenderer implements SlideRenderer<ArchitectureSlide> {
  render(r: SlideRequest[], d: ArchitectureSlide): void {
    const s = uid("arch");
    r.push({ createSlide: { objectId: s } });
    addPageTitle(r, s, d.title);

    const n = d.actors.length;
    if (n === 0) return;

    // 説明テキスト
    if (d.description) {
      addTextBox(r, s, d.description, {
        x: MX, y: 720_000, w: CW, h: 350_000,
        fontSize: 14, color: { red: 0.35, green: 0.35, blue: 0.35 },
      });
    }

    const descOffset = d.description ? 400_000 : 0;
    const actorY = 750_000 + descOffset;

    // アクター配置
    const colW = Math.floor(CW / n);
    const actorW = Math.min(Math.floor(colW * 0.7), 1_800_000);
    const actorH = 350_000;
    const actorCenterX: number[] = [];

    for (let i = 0; i < n; i++) {
      const cx = MX + Math.floor(colW * i) + Math.floor(colW / 2);
      actorCenterX.push(cx);
      const ax = cx - Math.floor(actorW / 2);
      const ac = ARCH_ACTOR_COLORS[d.actors[i].color] || ARCH_ACTOR_COLORS.blue;

      // 白い囲み枠（RECTANGLE + 実線）
      const frameId = uid("af");
      r.push({
        createShape: {
          objectId: frameId,
          shapeType: "RECTANGLE",
          elementProperties: {
            pageObjectId: s,
            size: { width: { magnitude: actorW + 80_000, unit: "EMU" }, height: { magnitude: actorH + 80_000, unit: "EMU" } },
            transform: { scaleX: 1, scaleY: 1, translateX: ax - 40_000, translateY: actorY - 40_000, unit: "EMU" },
          },
        },
      });
      r.push({
        updateShapeProperties: {
          objectId: frameId,
          shapeProperties: {
            shapeBackgroundFill: { solidFill: { color: { rgbColor: C.white } } },
            outline: { outlineFill: { solidFill: { color: { rgbColor: BORDER_COLOR } } }, weight: { magnitude: 1, unit: "PT" } },
          },
          fields: "shapeBackgroundFill,outline",
        },
      });

      // 色付きアクターボックス
      const boxId = createRoundRect(r, s, { x: ax, y: actorY, w: actorW, h: actorH, bg: ac });
      r.push({ insertText: { objectId: boxId, text: d.actors[i].name, insertionIndex: 0 } });
      styleText(r, boxId, { fontSize: 14, bold: true, color: C.white, align: "CENTER" });
    }

    // ライフライン（縦線）
    const lifelineTop = actorY + actorH + 40_000;
    const lifelineBot = SLIDE_H - 150_000;
    for (let i = 0; i < n; i++) {
      createLine(r, s, {
        x1: actorCenterX[i], y1: lifelineTop,
        x2: actorCenterX[i], y2: lifelineBot,
        color: BORDER_COLOR, weight: 1,
      });
    }

    // 関係性ブロック
    const relZone = lifelineBot - lifelineTop - 50_000;
    const rels = d.relationships.slice(0, 4);
    const relGap = 80_000;
    const relH = Math.floor((relZone - relGap * (rels.length - 1)) / Math.max(rels.length, 1));
    const clampedRelH = Math.min(relH, 1_200_000);
    const headerH = 250_000;

    const actorIdx = new Map<string, number>();
    d.actors.forEach((a, i) => actorIdx.set(a.name, i));

    for (let i = 0; i < rels.length; i++) {
      const rel = rels[i];
      const y = lifelineTop + 25_000 + i * (clampedRelH + relGap);
      const headerColor = REL_HEADER_COLORS[i % REL_HEADER_COLORS.length];

      // fromActors と toActors から左端・右端を決定
      const allActors = [...rel.fromActors, ...rel.toActors];
      const indices = allActors.map(name => actorIdx.get(name) ?? 0);
      const minIdx = Math.min(...indices);
      const maxIdx = Math.max(...indices);

      const leftX = actorCenterX[minIdx] - Math.floor(colW * 0.45);
      const rightX = actorCenterX[maxIdx] + Math.floor(colW * 0.45);
      const blockW = rightX - leftX;

      // ヘッダーバー（色付き）
      const hId = uid("rh");
      r.push({
        createShape: {
          objectId: hId,
          shapeType: "ROUND_RECTANGLE",
          elementProperties: {
            pageObjectId: s,
            size: { width: { magnitude: blockW, unit: "EMU" }, height: { magnitude: headerH, unit: "EMU" } },
            transform: { scaleX: 1, scaleY: 1, translateX: leftX, translateY: y, unit: "EMU" },
          },
        },
      });
      r.push({
        updateShapeProperties: {
          objectId: hId,
          shapeProperties: {
            shapeBackgroundFill: { solidFill: { color: { rgbColor: headerColor } } },
            outline: { propertyState: "NOT_RENDERED" },
          },
          fields: "shapeBackgroundFill,outline",
        },
      });
      r.push({ insertText: { objectId: hId, text: rel.label, insertionIndex: 0 } });
      styleText(r, hId, { fontSize: 14, bold: false, color: C.white, align: "CENTER" });

      // 説明エリア（薄黄色背景）
      if (rel.description) {
        const descH = clampedRelH - headerH - 20_000;
        const descId = uid("rd");
        r.push({
          createShape: {
            objectId: descId,
            shapeType: "ROUND_RECTANGLE",
            elementProperties: {
              pageObjectId: s,
              size: { width: { magnitude: blockW, unit: "EMU" }, height: { magnitude: descH, unit: "EMU" } },
              transform: { scaleX: 1, scaleY: 1, translateX: leftX, translateY: y + headerH + 10_000, unit: "EMU" },
            },
          },
        });
        r.push({
          updateShapeProperties: {
            objectId: descId,
            shapeProperties: {
              shapeBackgroundFill: { solidFill: { color: { rgbColor: CONTENT_BG } } },
              outline: { outlineFill: { solidFill: { color: { rgbColor: BORDER_COLOR } } }, weight: { magnitude: 1, unit: "PT" } },
            },
            fields: "shapeBackgroundFill,outline",
          },
        });
        r.push({ insertText: { objectId: descId, text: rel.description, insertionIndex: 0 } });
        styleText(r, descId, { fontSize: 12, bold: false, color: BORDER_COLOR, align: "CENTER" });
      }
    }
  }
}
