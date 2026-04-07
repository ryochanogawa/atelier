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
          translateX: x1,
          translateY: y1,
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
    // タイトルが長い場合はフォントを縮小して収める
    const titleFontSize = d.title.length > 30 ? 18 : d.title.length > 20 ? 22 : 26;
    addPageTitle(r, s, d.title, undefined, titleFontSize);

    const actors = d.actors;
    const steps = d.steps; // 全ステップを1スライドに収める
    const n = actors.length;
    if (n === 0) return;

    // ── サイズをアクター数に応じて動的に計算 ──
    const usableW = SLIDE_W - MX * 2;
    // 各アクターに割り当てる列幅
    const colW = Math.floor(usableW / n);
    // アクターボックス幅: 列幅の88%（最大REF値）テキストが窮屈にならないよう広めに取る
    const actorW = Math.min(Math.floor(colW * 0.88), REF_ACTOR_W);
    // ライフレーン囲み幅: 列幅の95%（最大REF値）
    const laneW = Math.min(Math.floor(colW * 0.95), REF_LANE_W);
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

    // ── レーン高さをステップ数に応じて動的計算（先に計算してレーン描画に使う） ──
    const slideBottom = SLIDE_H - 80_000; // 下部マージン
    const availableLaneH = slideBottom - LANE_Y;
    const dynamicLaneH = Math.min(LANE_H, availableLaneH);

    // ── ライフレーン囲み枠（白背景 + 黒点線DASH） ──
    for (let i = 0; i < n; i++) {
      createRect(r, s, {
        x: laneLeftX[i],
        y: LANE_Y,
        w: laneW,
        h: dynamicLaneH,
        bg: C.white,
        borderColor: BORDER_COLOR,
        borderWeight: 1,
        dash: true,
      });
    }

    // ── アクターボックス（ROUND_RECTANGLE, 色付き + 白文字） ──
    // アクター名の最大文字数からベースフォントサイズを決定
    const maxActorNameLen = Math.max(...actors.map(a => a.name.length));
    // ボックス幅に対して文字が収まるようフォントを調整（EMU/文字 で判定）
    const emuPerChar = Math.floor(actorW / maxActorNameLen);
    const actorFontSize = emuPerChar < 150_000 ? 9
      : emuPerChar < 190_000 ? 10
      : emuPerChar < 230_000 ? 11
      : emuPerChar < 280_000 ? 12
      : 14;
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

    // ── ステップ配置（ステップ数に応じて動的スケーリング） ──

    const stepZoneTop = LANE_Y + 120_000;
    const stepZoneBot = LANE_Y + dynamicLaneH - 30_000;
    const stepZone = stepZoneBot - stepZoneTop;

    // ステップ数に応じてボックス高さ・ギャップ・フォントサイズを動的計算
    const stepCount = steps.length;
    // ギャップ比率: ステップ間の矢印が十分通れるよう全体の35%をギャップに割り当て
    const totalGapRatio = 0.35;
    const totalBoxRatio = 1 - totalGapRatio;
    const gapCount = Math.max(stepCount - 1, 1);
    const gapPerStep = Math.floor((stepZone * totalGapRatio) / gapCount);
    const baseStepH = Math.min(STEP_H, Math.floor((stepZone * totalBoxRatio) / Math.max(stepCount, 1)));
    // フォントサイズ: ボックス高さに応じて調整
    const baseFontSize = baseStepH < 200_000 ? 8 : baseStepH < 250_000 ? 9 : baseStepH < 300_000 ? 10 : 11;

    // 実際の行高さ（ボックス＋ギャップ）
    const rowH = baseStepH + gapPerStep;

    // ステップボックス情報を保存（矢印描画用）
    const dynamicHeights: number[] = [];
    const stepBoxes: Array<{
      actorIndex: number;
      fromActorIndex: number;
      leftX: number;
      rightX: number;
      centerX: number;
      topY: number;
      botY: number;
    }> = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const toIdx = actorIdx.get(step.toActor) ?? 0;
      const fromIdx = actorIdx.get(step.fromActor) ?? toIdx;
      const bg = STEP_COLORS[step.style] || STEP_COLORS.normal;

      const dynamicH = baseStepH;
      const fontSize = baseFontSize;
      const boxY = stepZoneTop + i * rowH;

      // ボックスはtoActor側に配置
      const boxCX = actorCenterX[toIdx];
      const boxX = boxCX - Math.floor(stepW / 2);
      const boxId = createRect(r, s, {
        x: boxX, y: boxY, w: stepW, h: dynamicH, bg,
        borderColor: BORDER_COLOR, borderWeight: 1,
      });
      r.push({ insertText: { objectId: boxId, text: step.label, insertionIndex: 0 } });
      styleText(r, boxId, { fontSize, bold: false, color: BORDER_COLOR, align: "CENTER" });

      dynamicHeights.push(dynamicH);
      stepBoxes.push({
        actorIndex: toIdx,
        fromActorIndex: fromIdx,
        leftX: boxX, rightX: boxX + stepW, centerX: boxCX,
        topY: boxY, botY: boxY + dynamicH,
      });
    }

    // ── 矢印描画（参考画像準拠: 縦＋横のみ） ──
    for (let i = 0; i < steps.length; i++) {
      const box = stepBoxes[i];

      // ① fromActor≠toActor: fromActorレーン中央→ボックスの端へ水平矢印
      if (box.fromActorIndex !== box.actorIndex) {
        const fromCX = actorCenterX[box.fromActorIndex];
        const boxMidY = Math.floor((box.topY + box.botY) / 2);
        if (box.fromActorIndex < box.actorIndex) {
          createArrow(r, s, fromCX, boxMidY, box.leftX, boxMidY);
        } else {
          createArrow(r, s, fromCX, boxMidY, box.rightX, boxMidY);
        }
      }

      // ② 次のステップへの縦接続
      if (i < steps.length - 1) {
        const next = stepBoxes[i + 1];

        if (box.actorIndex === next.actorIndex) {
          // 同じレーン: 縦矢印
          createArrow(r, s, box.centerX, box.botY, next.centerX, next.topY);
        } else if (box.actorIndex === next.fromActorIndex) {
          // 現toActor = 次fromActor: ボックス下端からnextのmidYまで縦線
          const nextMidY = Math.floor((next.topY + next.botY) / 2);
          createLine(r, s, {
            x1: box.centerX, y1: box.botY,
            x2: box.centerX, y2: nextMidY,
            color: BORDER_COLOR, weight: 1.5,
          });
        } else {
          // 異なるレーン: L字型
          const nextMidY = Math.floor((next.topY + next.botY) / 2);
          createLine(r, s, {
            x1: box.centerX, y1: box.botY,
            x2: box.centerX, y2: nextMidY,
            color: BORDER_COLOR, weight: 1.5,
          });
          if (box.actorIndex < next.fromActorIndex) {
            createArrow(r, s, box.centerX, nextMidY, actorCenterX[next.fromActorIndex], nextMidY);
          } else {
            createArrow(r, s, box.centerX, nextMidY, actorCenterX[next.fromActorIndex], nextMidY);
          }
        }
      }
    }
  }
}
