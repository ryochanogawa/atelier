/**
 * Sequence Diagram Renderer
 * 参考画像のAPI構造データに完全一致するシーケンス図を描画する。
 *
 * - アクターボックス: ROUND_RECTANGLE, 色付き + 白文字14pt
 * - ライフレーン囲み: RECTANGLE, 白背景 + 黒点線(DASH)
 * - ステップボックス: RECTANGLE(角丸なし), 色分け(start=薄緑, normal/branch=薄ピンク, end=薄青)
 * - 矢印: FILL_ARROW, 黒実線
 */

import type { SequenceDiagramSlide } from "../../../application/dto/slide-plan.dto.js";
import {
  type SlideRequest,
  type SlideRenderer,
  type RgbColor,
  C,
  MX,
  SLIDE_W,
  SLIDE_H,
  uid,
  addPageTitle,
  styleText,
  createRoundRect,
  createLine,
  ACTOR_COLOR_MAP,
} from "./base.renderer.js";

// ── レイアウト定数（参考画像のAPI構造データ準拠, EMU） ──

// 参考値（4アクター基準）。アクター数に応じて動的に縮小する。
const REF_ACTOR_W = 1_712_400;
const ACTOR_H = 304_800;
const ACTOR_Y = 793_000;

const REF_LANE_W = 2_091_600;
const LANE_H = 4_086_900;
const LANE_Y = 918_498;

const REF_STEP_W = 1_893_300;
const STEP_H = 318_000;

const BORDER_COLOR: RgbColor = { red: 0.1, green: 0.1, blue: 0.1 };

// ── ステップの色（参考画像準拠） ──

const STEP_COLORS: Record<string, RgbColor> = {
  start:  { red: 0.85, green: 0.92, blue: 0.83 },  // 薄緑
  normal: { red: 0.96, green: 0.8,  blue: 0.8  },  // 薄ピンク
  branch: { red: 0.96, green: 0.8,  blue: 0.8  },  // 薄ピンク
  end:    { red: 0.79, green: 0.85, blue: 0.97 },  // 薄青
};

// ── アクターカラー（参考画像のrgb値準拠） ──

const ACTOR_COLORS: Record<string, RgbColor> = {
  orange: { red: 1,    green: 0.6,  blue: 0    },  // 橙
  green:  { red: 0.42, green: 0.66, blue: 0.31 },  // 緑
  teal:   { red: 0.1,  green: 0.6,  blue: 0.53 },  // ティール
  blue:   { red: 0.15, green: 0.35, blue: 0.6  },  // 青（フォールバック）
  red:    { red: 0.82, green: 0.25, blue: 0.25 },  // 赤
  purple: { red: 0.6,  green: 0.35, blue: 0.65 },  // 紫
};

// オリーブ色（加盟店システム）：名前に「システム」が含まれる場合等に使用
const OLIVE: RgbColor = { red: 0.75, green: 0.56, blue: 0 };

// ── ヘルパー: RECTANGLE（角丸なし）を作成 ──

function createRect(
  r: SlideRequest[],
  slideId: string,
  opts: {
    x: number; y: number; w: number; h: number;
    bg: RgbColor;
    borderColor?: RgbColor;
    borderWeight?: number;
    dash?: boolean;
  },
): string {
  const id = uid("rc");
  r.push({
    createShape: {
      objectId: id,
      shapeType: "RECTANGLE",
      elementProperties: {
        pageObjectId: slideId,
        size: {
          width:  { magnitude: opts.w, unit: "EMU" },
          height: { magnitude: opts.h, unit: "EMU" },
        },
        transform: {
          scaleX: 1, scaleY: 1,
          translateX: opts.x, translateY: opts.y,
          unit: "EMU",
        },
      },
    },
  });

  const shapeProps: Record<string, unknown> = {
    shapeBackgroundFill: { solidFill: { color: { rgbColor: opts.bg } } },
  };
  let fields = "shapeBackgroundFill";

  if (opts.borderColor) {
    shapeProps.outline = {
      outlineFill: { solidFill: { color: { rgbColor: opts.borderColor } } },
      weight: { magnitude: opts.borderWeight || 1, unit: "PT" },
      ...(opts.dash ? { dashStyle: "DASH" } : {}),
    };
    fields += ",outline";
  } else {
    shapeProps.outline = { propertyState: "NOT_RENDERED" };
    fields += ",outline";
  }

  r.push({
    updateShapeProperties: {
      objectId: id,
      shapeProperties: shapeProps,
      fields,
    },
  });

  return id;
}

// ── ヘルパー: FILL_ARROW付き線を作成 ──

function createArrow(
  r: SlideRequest[],
  slideId: string,
  x1: number, y1: number,
  x2: number, y2: number,
): void {
  const id = uid("ar");
  const w = Math.abs(x2 - x1) || 1;
  const h = Math.abs(y2 - y1) || 1;

  r.push({
    createLine: {
      objectId: id,
      lineCategory: "STRAIGHT",
      elementProperties: {
        pageObjectId: slideId,
        size: {
          width:  { magnitude: w, unit: "EMU" },
          height: { magnitude: h, unit: "EMU" },
        },
        transform: {
          scaleX: x2 >= x1 ? 1 : -1,
          scaleY: y2 >= y1 ? 1 : -1,
          translateX: Math.min(x1, x2),
          translateY: Math.min(y1, y2),
          unit: "EMU",
        },
      },
    },
  });

  r.push({
    updateLineProperties: {
      objectId: id,
      lineProperties: {
        lineFill: { solidFill: { color: { rgbColor: BORDER_COLOR } } },
        weight: { magnitude: 1.5, unit: "PT" },
        endArrow: "FILL_ARROW",
      },
      fields: "lineFill,weight,endArrow",
    },
  });
}

// ── メインレンダラー ──

export class SequenceDiagramRenderer implements SlideRenderer<SequenceDiagramSlide> {
  render(r: SlideRequest[], d: SequenceDiagramSlide): void {
    const s = uid("seq");
    r.push({ createSlide: { objectId: s } });
    addPageTitle(r, s, d.title);

    const actors = d.actors;
    const steps = d.steps.slice(0, 8);
    const n = actors.length;
    if (n === 0) return;

    // ── サイズをアクター数に応じて動的に計算 ──
    const usableW = SLIDE_W - MX * 2;
    // 各アクターに割り当てる列幅
    const colW = Math.floor(usableW / n);
    // アクターボックス幅: 列幅の75%（最大REF値）
    const actorW = Math.min(Math.floor(colW * 0.75), REF_ACTOR_W);
    // ライフレーン囲み幅: 列幅の92%（最大REF値）
    const laneW = Math.min(Math.floor(colW * 0.92), REF_LANE_W);
    // ステップボックス幅: 列幅の83%（最大REF値）
    const stepW = Math.min(Math.floor(colW * 0.83), REF_STEP_W);

    // 各アクターの中心X座標 = 列の中央
    const actorCenterX: number[] = [];
    for (let i = 0; i < n; i++) {
      actorCenterX.push(MX + Math.floor(colW * i) + Math.floor(colW / 2));
    }

    const actorLeftX: number[] = actorCenterX.map(cx => cx - Math.floor(actorW / 2));
    const laneLeftX: number[] = actorCenterX.map(cx => cx - Math.floor(laneW / 2));

    const actorIdx = new Map<string, number>();
    actors.forEach((a, i) => actorIdx.set(a.name, i));

    // ── ライフレーン囲み枠（白背景 + 黒点線DASH） ──
    for (let i = 0; i < n; i++) {
      createRect(r, s, {
        x: laneLeftX[i],
        y: LANE_Y,
        w: laneW,
        h: LANE_H,
        bg: C.white,
        borderColor: BORDER_COLOR,
        borderWeight: 1,
        dash: true,
      });
    }

    // ── アクターボックス（ROUND_RECTANGLE, 色付き + 白文字） ──
    const actorFontSize = actorW < 1_200_000 ? 11 : 14;
    for (let i = 0; i < n; i++) {
      const colorKey = actors[i].color;
      const ac = ACTOR_COLORS[colorKey] || ACTOR_COLOR_MAP[colorKey] || C.blue;

      const boxId = createRoundRect(r, s, {
        x: actorLeftX[i],
        y: ACTOR_Y,
        w: actorW,
        h: ACTOR_H,
        bg: ac,
      });
      r.push({ insertText: { objectId: boxId, text: actors[i].name, insertionIndex: 0 } });
      styleText(r, boxId, { fontSize: actorFontSize, bold: true, color: C.white, align: "CENTER" });
    }

    // ── ステップ配置 ──
    const stepZoneTop = LANE_Y + 40_000;
    const stepZoneBot = LANE_Y + LANE_H - 40_000;
    const stepZone = stepZoneBot - stepZoneTop;
    const stepRowH = Math.floor(stepZone / Math.max(steps.length, 1));
    const clampedRowH = Math.min(Math.max(stepRowH, STEP_H + 60_000), 700_000);

    // ステップボックス情報を保存（矢印描画用）
    const stepBoxes: Array<{
      actorIndex: number;
      leftX: number;
      rightX: number;
      centerX: number;
      topY: number;
      botY: number;
    }> = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const toIdx = actorIdx.get(step.toActor) ?? 0;
      const bg = STEP_COLORS[step.style] || STEP_COLORS.normal;

      // Y位置: ステップゾーン内に等間隔配置
      const boxY = stepZoneTop + i * clampedRowH + Math.floor((clampedRowH - STEP_H) / 2);

      // X位置: toActorのライフレーン中央にステップボックスを配置
      const boxCX = actorCenterX[toIdx];
      const boxX = boxCX - Math.floor(stepW / 2);

      // ステップボックス描画（RECTANGLE、角丸なし）
      const boxId = createRect(r, s, {
        x: boxX,
        y: boxY,
        w: stepW,
        h: STEP_H,
        bg,
        borderColor: BORDER_COLOR,
        borderWeight: 1,
      });
      r.push({ insertText: { objectId: boxId, text: step.label, insertionIndex: 0 } });
      styleText(r, boxId, { fontSize: 11, bold: false, color: BORDER_COLOR, align: "CENTER" });

      stepBoxes.push({
        actorIndex: toIdx,
        leftX: boxX,
        rightX: boxX + stepW,
        centerX: boxCX,
        topY: boxY,
        botY: boxY + STEP_H,
      });
    }

    // ── 矢印描画 ──
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const fromIdx = actorIdx.get(step.fromActor) ?? 0;
      const toIdx = actorIdx.get(step.toActor) ?? 0;
      const box = stepBoxes[i];

      // 横矢印: 異なるアクター間
      if (fromIdx !== toIdx) {
        const arrowY = box.topY + Math.floor(STEP_H / 2);
        if (fromIdx < toIdx) {
          // 左→右: fromアクター中心 → ステップボックス左端
          createArrow(r, s, actorCenterX[fromIdx], arrowY, box.leftX, arrowY);
        } else {
          // 右→左: fromアクター中心 → ステップボックス右端
          createArrow(r, s, actorCenterX[fromIdx], arrowY, box.rightX, arrowY);
        }
      }
    }

    // 縦矢印: 同一アクター内の連続ステップ間
    for (let i = 0; i < stepBoxes.length - 1; i++) {
      const curr = stepBoxes[i];
      const next = stepBoxes[i + 1];
      if (curr.actorIndex === next.actorIndex) {
        createArrow(r, s, curr.centerX, curr.botY, next.centerX, next.topY);
      }
    }
  }
}
