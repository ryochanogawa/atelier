/**
 * Base Renderer
 * 全スライドレンダラー共通のヘルパー・定数・型定義
 */

// ── 型定義 ──

export type SlideRequest = Record<string, unknown>;
export type RgbColor = { red: number; green: number; blue: number };

export interface SlideRenderer<T> {
  render(r: SlideRequest[], descriptor: T): void;
}

// ── カラーパレット ──

export const C = {
  navy: { red: 0.05, green: 0.12, blue: 0.25 },
  blue: { red: 0.15, green: 0.35, blue: 0.6 },
  accent: { red: 0.20, green: 0.47, blue: 0.85 },
  sky: { red: 0.85, green: 0.92, blue: 0.98 },
  white: { red: 1, green: 1, blue: 1 },
  offWhite: { red: 0.97, green: 0.97, blue: 0.98 },
  lightGray: { red: 0.92, green: 0.92, blue: 0.93 },
  gray: { red: 0.55, green: 0.55, blue: 0.58 },
  darkGray: { red: 0.25, green: 0.25, blue: 0.28 },
  black: { red: 0.1, green: 0.1, blue: 0.12 },
  green: { red: 0.18, green: 0.65, blue: 0.45 },
  greenLight: { red: 0.88, green: 0.96, blue: 0.91 },
  orange: { red: 0.95, green: 0.55, blue: 0.15 },
  orangeLight: { red: 1, green: 0.94, blue: 0.85 },
  red: { red: 0.82, green: 0.25, blue: 0.25 },
  purple: { red: 0.60, green: 0.35, blue: 0.65 },
  teal: { red: 0.15, green: 0.60, blue: 0.55 },
  branchBg: { red: 1, green: 0.96, blue: 0.88 },
  branchBorder: { red: 0.85, green: 0.6, blue: 0.15 },
  stepBg: { red: 0.95, green: 0.97, blue: 1 },
  stepBorder: { red: 0.6, green: 0.72, blue: 0.88 },
  startBg: { red: 0.88, green: 0.96, blue: 0.91 },
  startBorder: { red: 0.18, green: 0.65, blue: 0.45 },
  endBg: { red: 0.85, green: 0.92, blue: 0.98 },
  endBorder: { red: 0.15, green: 0.35, blue: 0.6 },
} as const;

/** 名前付きカラーマップ（シーケンス図アクター用） */
export const ACTOR_COLOR_MAP: Record<string, RgbColor> = {
  red: C.red,
  green: C.green,
  orange: C.orange,
  blue: C.blue,
  purple: C.purple,
  teal: C.teal,
};

// ── レイアウト定数（EMU） ──

export const SLIDE_W = 9_144_000;
export const SLIDE_H = 5_143_500;
export const MX = 350_000;
export const CW = SLIDE_W - MX * 2;
export const TITLE_Y = 100_000;
export const CONTENT_Y = 750_000;
export const CONTENT_H = SLIDE_H - CONTENT_Y - 150_000;

// ── UID生成 ──

let idCounter = 0;
export function uid(prefix = "e"): string {
  return `${prefix}_${Date.now()}_${++idCounter}`;
}

// ── 共通ヘルパー ──

export function addPageTitle(r: SlideRequest[], slideId: string, title: string, pageNumber?: number): void {
  // ピンク/モーブのヘッダーバー（参考画像準拠）
  const headerBg: RgbColor = { red: 0.93, green: 0.85, blue: 0.88 };
  const barId = uid("hb");
  r.push({
    createShape: {
      objectId: barId,
      shapeType: "RECTANGLE",
      elementProperties: {
        pageObjectId: slideId,
        size: { width: { magnitude: SLIDE_W, unit: "EMU" }, height: { magnitude: 650_000, unit: "EMU" } },
        transform: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0, unit: "EMU" },
      },
    },
  });
  r.push({
    updateShapeProperties: {
      objectId: barId,
      shapeProperties: {
        shapeBackgroundFill: { solidFill: { color: { rgbColor: headerBg } } },
        outline: { propertyState: "NOT_RENDERED" },
      },
      fields: "shapeBackgroundFill,outline",
    },
  });

  // タイトルテキスト（ヘッダーバー内、太字黒）
  addTextBox(r, slideId, title, {
    x: MX + 300_000, y: 80_000, w: CW - 600_000, h: 450_000,
    fontSize: 26, bold: true, color: { red: 0.1, green: 0.1, blue: 0.1 },
  });

  // カラーマーク（タイトル下の3色線：緑・橙・赤）
  const markY = 530_000;
  const markColors: RgbColor[] = [
    { red: 0.1, green: 0.6, blue: 0.55 },    // ティール
    { red: 0.9, green: 0.6, blue: 0.15 },    // オレンジ
    { red: 0.85, green: 0.3, blue: 0.2 },    // レッド
  ];
  for (let i = 0; i < 3; i++) {
    const mId = uid("cm");
    r.push({
      createShape: {
        objectId: mId,
        shapeType: "RECTANGLE",
        elementProperties: {
          pageObjectId: slideId,
          size: { width: { magnitude: 250_000, unit: "EMU" }, height: { magnitude: 50_000, unit: "EMU" } },
          transform: { scaleX: 1, scaleY: 1, translateX: MX + i * 270_000, translateY: markY, unit: "EMU" },
        },
      },
    });
    r.push({
      updateShapeProperties: {
        objectId: mId,
        shapeProperties: {
          shapeBackgroundFill: { solidFill: { color: { rgbColor: markColors[i] } } },
          outline: { propertyState: "NOT_RENDERED" },
        },
        fields: "shapeBackgroundFill,outline",
      },
    });
  }

  // ページ番号（右上）
  if (pageNumber !== undefined) {
    addTextBox(r, slideId, String(pageNumber), {
      x: SLIDE_W - MX - 300_000, y: 80_000, w: 300_000, h: 300_000,
      fontSize: 14, color: C.gray, align: "RIGHT",
    });
  }
}

export function addTextBox(
  r: SlideRequest[],
  slideId: string,
  text: string,
  opts: {
    x: number; y: number; w: number; h: number;
    fontSize?: number; bold?: boolean; italic?: boolean;
    color?: RgbColor; font?: string; align?: string;
    lineSpacing?: number;
  },
): void {
  const id = uid("tb");
  r.push({
    createShape: {
      objectId: id,
      shapeType: "TEXT_BOX",
      elementProperties: {
        pageObjectId: slideId,
        size: { width: { magnitude: opts.w, unit: "EMU" }, height: { magnitude: opts.h, unit: "EMU" } },
        transform: { scaleX: 1, scaleY: 1, translateX: opts.x, translateY: opts.y, unit: "EMU" },
      },
    },
  });
  r.push({ insertText: { objectId: id, text, insertionIndex: 0 } });

  const style: Record<string, unknown> = {
    fontSize: { magnitude: opts.fontSize || 12, unit: "PT" },
    fontFamily: opts.font || "Noto Sans JP",
  };
  let fields = "fontSize,fontFamily";

  if (opts.color) {
    style.foregroundColor = { opaqueColor: { rgbColor: opts.color } };
    fields += ",foregroundColor";
  }
  if (opts.bold) { style.bold = true; fields += ",bold"; }
  if (opts.italic) { style.italic = true; fields += ",italic"; }

  r.push({ updateTextStyle: { objectId: id, style, textRange: { type: "ALL" }, fields } });

  if (opts.align || opts.lineSpacing) {
    const pStyle: Record<string, unknown> = {};
    let pFields = "";
    if (opts.align) { pStyle.alignment = opts.align; pFields = "alignment"; }
    if (opts.lineSpacing) {
      pStyle.lineSpacing = opts.lineSpacing;
      pFields = pFields ? `${pFields},lineSpacing` : "lineSpacing";
    }
    r.push({ updateParagraphStyle: { objectId: id, style: pStyle, textRange: { type: "ALL" }, fields: pFields } });
  }
}

export function styleText(
  r: SlideRequest[],
  objectId: string,
  opts: { fontSize?: number; bold?: boolean; color?: RgbColor; align?: string },
): void {
  const style: Record<string, unknown> = {
    fontSize: { magnitude: opts.fontSize || 12, unit: "PT" },
    fontFamily: "Noto Sans JP",
  };
  let fields = "fontSize,fontFamily";
  if (opts.color) { style.foregroundColor = { opaqueColor: { rgbColor: opts.color } }; fields += ",foregroundColor"; }
  if (opts.bold) { style.bold = true; fields += ",bold"; }
  r.push({ updateTextStyle: { objectId, style, textRange: { type: "ALL" }, fields } });
  if (opts.align) {
    r.push({ updateParagraphStyle: { objectId, style: { alignment: opts.align }, textRange: { type: "ALL" }, fields: "alignment" } });
  }
}

export function createRoundRect(
  r: SlideRequest[],
  slideId: string,
  opts: { x: number; y: number; w: number; h: number; bg: RgbColor; border?: RgbColor; borderWeight?: number },
): string {
  const id = uid("rr");
  r.push({
    createShape: {
      objectId: id,
      shapeType: "ROUND_RECTANGLE",
      elementProperties: {
        pageObjectId: slideId,
        size: { width: { magnitude: opts.w, unit: "EMU" }, height: { magnitude: opts.h, unit: "EMU" } },
        transform: { scaleX: 1, scaleY: 1, translateX: opts.x, translateY: opts.y, unit: "EMU" },
      },
    },
  });

  const shapeProps: Record<string, unknown> = {
    shapeBackgroundFill: { solidFill: { color: { rgbColor: opts.bg } } },
  };
  let shapeFields = "shapeBackgroundFill";

  if (opts.border) {
    shapeProps.outline = {
      outlineFill: { solidFill: { color: { rgbColor: opts.border } } },
      weight: { magnitude: opts.borderWeight || 1, unit: "PT" },
    };
    shapeFields += ",outline";
  } else {
    shapeProps.outline = { propertyState: "NOT_RENDERED" };
    shapeFields += ",outline";
  }

  r.push({ updateShapeProperties: { objectId: id, shapeProperties: shapeProps, fields: shapeFields } });

  return id;
}

export function createLine(
  r: SlideRequest[],
  slideId: string,
  opts: { x1: number; y1: number; x2: number; y2: number; color: RgbColor; weight?: number; dash?: boolean; arrow?: boolean },
): void {
  const id = uid("ln");
  const w = Math.abs(opts.x2 - opts.x1) || 1;
  const h = Math.abs(opts.y2 - opts.y1) || 1;

  r.push({
    createLine: {
      objectId: id,
      lineCategory: "STRAIGHT",
      elementProperties: {
        pageObjectId: slideId,
        size: { width: { magnitude: w, unit: "EMU" }, height: { magnitude: h, unit: "EMU" } },
        transform: {
          scaleX: opts.x2 >= opts.x1 ? 1 : -1,
          scaleY: opts.y2 >= opts.y1 ? 1 : -1,
          translateX: Math.min(opts.x1, opts.x2),
          translateY: Math.min(opts.y1, opts.y2),
          unit: "EMU",
        },
      },
    },
  });

  const lineProps: Record<string, unknown> = {
    lineFill: { solidFill: { color: { rgbColor: opts.color } } },
    weight: { magnitude: opts.weight || 1.5, unit: "PT" },
  };
  let lineFields = "lineFill,weight";

  if (opts.dash) { lineProps.dashStyle = "DASH"; lineFields += ",dashStyle"; }
  if (opts.arrow) { lineProps.endArrow = "OPEN_ARROW"; lineFields += ",endArrow"; }

  r.push({ updateLineProperties: { objectId: id, lineProperties: lineProps, fields: lineFields } });
}

export function applyTableTextStyle(r: SlideRequest[], tableId: string, rows: number, cols: number, fontSize = 11): void {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      r.push({
        updateTextStyle: {
          objectId: tableId,
          cellLocation: { rowIndex: row, columnIndex: col },
          style: {
            fontSize: { magnitude: fontSize, unit: "PT" },
            fontFamily: "Noto Sans JP",
            foregroundColor: { opaqueColor: { rgbColor: row === 0 ? C.navy : C.darkGray } },
            bold: row === 0,
          },
          textRange: { type: "ALL" },
          fields: "fontSize,fontFamily,foregroundColor,bold",
        },
      });
    }
  }
}
