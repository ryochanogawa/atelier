/**
 * Google Slides Adapter
 * Google Slides API v1を使用してプレゼンテーションを作成する。
 *
 * 認証は共通 OAuth ヘルパーを使用（Sheets と同一トークン）。
 */

import type { PresentationPort, PresentationWriteResult } from "../../domain/ports/presentation.port.js";
import type { ClientRequirementsDto, BusinessFlow } from "../../application/dto/client-requirements.dto.js";
import { getGoogleAuthClient } from "../../infrastructure/google/oauth.js";

// ── 型定義 ──

type SlidesApi = {
  presentations: {
    create: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
    batchUpdate: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
    get: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
  };
};

type SlideRequest = Record<string, unknown>;

// ── NTTカラーパレット ──

const COLORS = {
  darkBlue: { red: 0, green: 0.2, blue: 0.4 },         // #003366
  mediumBlue: { red: 0.15, green: 0.35, blue: 0.6 },    // #265999
  lightBlue: { red: 0.81, green: 0.89, blue: 0.95 },    // #CFE2F3
  accentBlue: { red: 0.26, green: 0.52, blue: 0.96 },   // #4285F4
  white: { red: 1, green: 1, blue: 1 },
  black: { red: 0, green: 0, blue: 0 },
  lightGray: { red: 0.93, green: 0.93, blue: 0.93 },    // #EDEDED
  darkGray: { red: 0.3, green: 0.3, blue: 0.3 },
  headerBlue: { red: 0.81, green: 0.89, blue: 0.95 },   // #CFE2F3
  // アクターカラー（スイムレーン用）
  actor1: { red: 0.85, green: 0.92, blue: 0.98 },
  actor2: { red: 0.92, green: 0.85, blue: 0.98 },
  actor3: { red: 0.85, green: 0.98, blue: 0.88 },
  actor4: { red: 0.98, green: 0.92, blue: 0.85 },
  actor5: { red: 0.98, green: 0.85, blue: 0.85 },
} as const;

type RgbColor = { red: number; green: number; blue: number };

// ── スライドサイズ（EMU: 1pt = 12700 EMU） ──

const PT = 12700;
const SLIDE_WIDTH = 10_000_000;   // ~787pt (wide 16:9)
const SLIDE_HEIGHT = 5_625_000;   // ~443pt

/** ユニークID生成 */
let idCounter = 0;
function uid(prefix = "elem"): string {
  return `${prefix}_${Date.now()}_${++idCounter}`;
}

export class GoogleSlidesAdapter implements PresentationPort {
  private slidesApi: SlidesApi | null = null;

  async create(data: ClientRequirementsDto): Promise<PresentationWriteResult> {
    const slides = await this.getSlidesApi();

    // 1. プレゼンテーションを作成
    const title = `${data.projectInfo.projectName} - ${data.projectInfo.documentTitle}`;
    const createResponse = await slides.presentations.create({
      requestBody: {
        title,
        pageSize: {
          width: { magnitude: SLIDE_WIDTH, unit: "EMU" },
          height: { magnitude: SLIDE_HEIGHT, unit: "EMU" },
        },
      },
    });

    const presentationId = createResponse.data.presentationId as string;
    const presentationUrl = `https://docs.google.com/presentation/d/${presentationId}/edit`;

    // デフォルトスライドのIDを取得（後で削除）
    const defaultSlides = (createResponse.data.slides as Array<{ objectId: string }>) ?? [];
    const defaultSlideIds = defaultSlides.map((s) => s.objectId);

    // 2. 全スライドのリクエストを構築
    const requests: SlideRequest[] = [];

    // 表紙スライド
    this.buildCoverSlide(requests, data);

    // 処理概要スライド
    if (data.processOverview) {
      this.buildProcessOverviewSlide(requests, data.processOverview);
    }

    // 要件一覧スライド（8件ごとにページ分割）
    this.buildRequirementsSlides(requests, data);

    // 業務フロースライド
    for (const flow of data.businessFlows) {
      this.buildBusinessFlowSlide(requests, flow);
    }

    // 画面一覧スライド
    if (data.screens.length > 0) {
      this.buildScreenListSlides(requests, data);
    }

    // 入出力パラメータスライド
    if (data.inputParameters.length > 0 || data.outputParameters.length > 0) {
      this.buildParametersSlides(requests, data);
    }

    // 用語集スライド
    if (data.terminology.length > 0) {
      this.buildTerminologySlides(requests, data);
    }

    // デフォルトスライドの削除リクエスト
    for (const slideId of defaultSlideIds) {
      requests.push({ deleteObject: { objectId: slideId } });
    }

    // 3. バッチ更新
    if (requests.length > 0) {
      await slides.presentations.batchUpdate({
        presentationId,
        requestBody: { requests },
      });
    }

    return { presentationId, presentationUrl };
  }

  // ── Private: API 取得 ──

  private async getSlidesApi(): Promise<SlidesApi> {
    if (this.slidesApi) return this.slidesApi;

    const { google } = await import("googleapis");
    const auth = await getGoogleAuthClient();
    this.slidesApi = google.slides({ version: "v1", auth }) as unknown as SlidesApi;
    return this.slidesApi;
  }

  // ── Private: 表紙スライド ──

  private buildCoverSlide(requests: SlideRequest[], data: ClientRequirementsDto): void {
    const slideId = uid("cover");
    requests.push({ createSlide: { objectId: slideId, insertionIndex: "0" } });

    // 背景色（ダークブルー）
    requests.push({
      updatePageProperties: {
        objectId: slideId,
        pageProperties: {
          pageBackgroundFill: {
            solidFill: { color: { rgbColor: COLORS.darkBlue } },
          },
        },
        fields: "pageBackgroundFill",
      },
    });

    // プロジェクト名（大タイトル）
    const titleId = uid("cover_title");
    requests.push({
      createShape: {
        objectId: titleId,
        shapeType: "TEXT_BOX",
        elementProperties: {
          pageObjectId: slideId,
          size: { width: { magnitude: 8_000_000, unit: "EMU" }, height: { magnitude: 1_200_000, unit: "EMU" } },
          transform: { scaleX: 1, scaleY: 1, translateX: 1_000_000, translateY: 1_400_000, unit: "EMU" },
        },
      },
    });
    requests.push({
      insertText: { objectId: titleId, text: data.projectInfo.projectName, insertionIndex: 0 },
    });
    requests.push({
      updateTextStyle: {
        objectId: titleId,
        style: {
          fontSize: { magnitude: 36, unit: "PT" },
          foregroundColor: { opaqueColor: { rgbColor: COLORS.white } },
          bold: true,
          fontFamily: "Noto Sans JP",
        },
        textRange: { type: "ALL" },
        fields: "fontSize,foregroundColor,bold,fontFamily",
      },
    });
    requests.push({
      updateParagraphStyle: {
        objectId: titleId,
        style: { alignment: "CENTER" },
        textRange: { type: "ALL" },
        fields: "alignment",
      },
    });

    // ドキュメントタイトル（サブタイトル）
    const subtitleId = uid("cover_subtitle");
    requests.push({
      createShape: {
        objectId: subtitleId,
        shapeType: "TEXT_BOX",
        elementProperties: {
          pageObjectId: slideId,
          size: { width: { magnitude: 8_000_000, unit: "EMU" }, height: { magnitude: 600_000, unit: "EMU" } },
          transform: { scaleX: 1, scaleY: 1, translateX: 1_000_000, translateY: 2_700_000, unit: "EMU" },
        },
      },
    });
    requests.push({
      insertText: { objectId: subtitleId, text: data.projectInfo.documentTitle, insertionIndex: 0 },
    });
    requests.push({
      updateTextStyle: {
        objectId: subtitleId,
        style: {
          fontSize: { magnitude: 20, unit: "PT" },
          foregroundColor: { opaqueColor: { rgbColor: COLORS.lightBlue } },
          fontFamily: "Noto Sans JP",
        },
        textRange: { type: "ALL" },
        fields: "fontSize,foregroundColor,fontFamily",
      },
    });
    requests.push({
      updateParagraphStyle: {
        objectId: subtitleId,
        style: { alignment: "CENTER" },
        textRange: { type: "ALL" },
        fields: "alignment",
      },
    });

    // 区切り線
    const lineId = uid("cover_line");
    requests.push({
      createLine: {
        objectId: lineId,
        lineCategory: "STRAIGHT",
        elementProperties: {
          pageObjectId: slideId,
          size: { width: { magnitude: 6_000_000, unit: "EMU" }, height: { magnitude: 0, unit: "EMU" } },
          transform: { scaleX: 1, scaleY: 1, translateX: 2_000_000, translateY: 3_500_000, unit: "EMU" },
        },
      },
    });
    requests.push({
      updateLineProperties: {
        objectId: lineId,
        lineProperties: {
          lineFill: { solidFill: { color: { rgbColor: COLORS.lightBlue } } },
          weight: { magnitude: 1.5, unit: "PT" },
        },
        fields: "lineFill,weight",
      },
    });

    // メタ情報（バージョン、著者、日付）
    const metaText = [
      data.projectInfo.version ? `Version ${data.projectInfo.version}` : "",
      data.projectInfo.author ? `作成者: ${data.projectInfo.author}` : "",
      data.projectInfo.createdDate ? `作成日: ${data.projectInfo.createdDate}` : "",
      data.projectInfo.updatedDate ? `更新日: ${data.projectInfo.updatedDate}` : "",
    ]
      .filter(Boolean)
      .join("  |  ");

    if (metaText) {
      const metaId = uid("cover_meta");
      requests.push({
        createShape: {
          objectId: metaId,
          shapeType: "TEXT_BOX",
          elementProperties: {
            pageObjectId: slideId,
            size: { width: { magnitude: 8_000_000, unit: "EMU" }, height: { magnitude: 400_000, unit: "EMU" } },
            transform: { scaleX: 1, scaleY: 1, translateX: 1_000_000, translateY: 3_800_000, unit: "EMU" },
          },
        },
      });
      requests.push({
        insertText: { objectId: metaId, text: metaText, insertionIndex: 0 },
      });
      requests.push({
        updateTextStyle: {
          objectId: metaId,
          style: {
            fontSize: { magnitude: 11, unit: "PT" },
            foregroundColor: { opaqueColor: { rgbColor: COLORS.lightGray } },
            fontFamily: "Noto Sans JP",
          },
          textRange: { type: "ALL" },
          fields: "fontSize,foregroundColor,fontFamily",
        },
      });
      requests.push({
        updateParagraphStyle: {
          objectId: metaId,
          style: { alignment: "CENTER" },
          textRange: { type: "ALL" },
          fields: "alignment",
        },
      });
    }
  }

  // ── Private: 処理概要スライド ──

  private buildProcessOverviewSlide(requests: SlideRequest[], processOverview: string): void {
    const slideId = uid("overview");
    requests.push({ createSlide: { objectId: slideId } });

    // タイトル
    this.addSlideTitle(requests, slideId, "処理概要");

    // 本文
    const bodyId = uid("overview_body");
    requests.push({
      createShape: {
        objectId: bodyId,
        shapeType: "TEXT_BOX",
        elementProperties: {
          pageObjectId: slideId,
          size: { width: { magnitude: 8_400_000, unit: "EMU" }, height: { magnitude: 3_600_000, unit: "EMU" } },
          transform: { scaleX: 1, scaleY: 1, translateX: 800_000, translateY: 1_200_000, unit: "EMU" },
        },
      },
    });
    requests.push({
      insertText: { objectId: bodyId, text: processOverview, insertionIndex: 0 },
    });
    requests.push({
      updateTextStyle: {
        objectId: bodyId,
        style: {
          fontSize: { magnitude: 14, unit: "PT" },
          foregroundColor: { opaqueColor: { rgbColor: COLORS.darkGray } },
          fontFamily: "Noto Sans JP",
        },
        textRange: { type: "ALL" },
        fields: "fontSize,foregroundColor,fontFamily",
      },
    });
  }

  // ── Private: 要件一覧スライド ──

  private buildRequirementsSlides(requests: SlideRequest[], data: ClientRequirementsDto): void {
    const reqs = data.requirements;
    if (reqs.length === 0) return;

    const perPage = 8;
    const pages = Math.ceil(reqs.length / perPage);

    for (let page = 0; page < pages; page++) {
      const slideId = uid("req");
      requests.push({ createSlide: { objectId: slideId } });

      const suffix = pages > 1 ? ` (${page + 1}/${pages})` : "";
      this.addSlideTitle(requests, slideId, `要件一覧${suffix}`);

      const pageReqs = reqs.slice(page * perPage, (page + 1) * perPage);
      const rows = pageReqs.length + 1; // +1 for header
      const cols = 5;
      const tableId = uid("req_table");

      requests.push({
        createTable: {
          objectId: tableId,
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: 8_400_000, unit: "EMU" },
              height: { magnitude: Math.min(rows * 400_000, 3_600_000), unit: "EMU" },
            },
            transform: { scaleX: 1, scaleY: 1, translateX: 800_000, translateY: 1_200_000, unit: "EMU" },
          },
          rows,
          columns: cols,
        },
      });

      // ヘッダー行
      const headers = ["No", "要件ID", "カテゴリ", "要件名", "優先度"];
      for (let c = 0; c < cols; c++) {
        requests.push({
          insertText: {
            objectId: tableId,
            cellLocation: { rowIndex: 0, columnIndex: c },
            text: headers[c],
            insertionIndex: 0,
          },
        });
      }

      // ヘッダー行スタイル
      requests.push({
        updateTableCellProperties: {
          objectId: tableId,
          tableRange: { location: { rowIndex: 0, columnIndex: 0 }, rowSpan: 1, columnSpan: cols },
          tableCellProperties: {
            tableCellBackgroundFill: {
              solidFill: { color: { rgbColor: COLORS.headerBlue } },
            },
          },
          fields: "tableCellBackgroundFill",
        },
      });

      // データ行
      for (let i = 0; i < pageReqs.length; i++) {
        const req = pageReqs[i];
        const rowData = [
          String(page * perPage + i + 1),
          req.id,
          req.category,
          req.name,
          req.priority,
        ];
        for (let c = 0; c < cols; c++) {
          requests.push({
            insertText: {
              objectId: tableId,
              cellLocation: { rowIndex: i + 1, columnIndex: c },
              text: rowData[c],
              insertionIndex: 0,
            },
          });
        }
      }

      // テーブル全体のテキストスタイル
      requests.push({
        updateTextStyle: {
          objectId: tableId,
          style: {
            fontSize: { magnitude: 10, unit: "PT" },
            fontFamily: "Noto Sans JP",
          },
          textRange: { type: "ALL" },
          fields: "fontSize,fontFamily",
        },
      });
    }
  }

  // ── Private: 業務フロースライド（スイムレーン図） ──

  private buildBusinessFlowSlide(requests: SlideRequest[], flow: BusinessFlow): void {
    const slideId = uid("flow");
    requests.push({ createSlide: { objectId: slideId } });

    this.addSlideTitle(requests, slideId, `業務フロー: ${flow.flowName}`);

    // フロー説明
    if (flow.description) {
      const descId = uid("flow_desc");
      requests.push({
        createShape: {
          objectId: descId,
          shapeType: "TEXT_BOX",
          elementProperties: {
            pageObjectId: slideId,
            size: { width: { magnitude: 8_400_000, unit: "EMU" }, height: { magnitude: 400_000, unit: "EMU" } },
            transform: { scaleX: 1, scaleY: 1, translateX: 800_000, translateY: 1_000_000, unit: "EMU" },
          },
        },
      });
      requests.push({
        insertText: { objectId: descId, text: flow.description, insertionIndex: 0 },
      });
      requests.push({
        updateTextStyle: {
          objectId: descId,
          style: {
            fontSize: { magnitude: 10, unit: "PT" },
            foregroundColor: { opaqueColor: { rgbColor: COLORS.darkGray } },
            fontFamily: "Noto Sans JP",
          },
          textRange: { type: "ALL" },
          fields: "fontSize,foregroundColor,fontFamily",
        },
      });
    }

    const actors = flow.actors;
    if (actors.length === 0) return;

    const actorColors: RgbColor[] = [
      COLORS.actor1, COLORS.actor2, COLORS.actor3, COLORS.actor4, COLORS.actor5,
    ];

    // スイムレーンレイアウト計算
    const laneWidth = Math.min(Math.floor(7_600_000 / actors.length), 2_500_000);
    const laneStartX = 800_000 + Math.floor((8_400_000 - laneWidth * actors.length) / 2);
    const headerY = 1_500_000;
    const headerHeight = 350_000;
    const stepStartY = headerY + headerHeight + 100_000;
    const stepHeight = 300_000;
    const stepGap = 80_000;

    // アクター名マップ
    const actorIndex = new Map<string, number>();
    actors.forEach((a, i) => actorIndex.set(a, i));

    // アクターヘッダー
    for (let i = 0; i < actors.length; i++) {
      const headerId = uid("actor_header");
      const color = actorColors[i % actorColors.length];

      requests.push({
        createShape: {
          objectId: headerId,
          shapeType: "RECTANGLE",
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: laneWidth - 20_000, unit: "EMU" },
              height: { magnitude: headerHeight, unit: "EMU" },
            },
            transform: {
              scaleX: 1, scaleY: 1,
              translateX: laneStartX + i * laneWidth + 10_000,
              translateY: headerY,
              unit: "EMU",
            },
          },
        },
      });
      requests.push({
        updateShapeProperties: {
          objectId: headerId,
          shapeProperties: {
            shapeBackgroundFill: { solidFill: { color: { rgbColor: color } } },
            outline: { outlineFill: { solidFill: { color: { rgbColor: COLORS.mediumBlue } } }, weight: { magnitude: 1, unit: "PT" } },
          },
          fields: "shapeBackgroundFill,outline",
        },
      });
      requests.push({
        insertText: { objectId: headerId, text: actors[i], insertionIndex: 0 },
      });
      requests.push({
        updateTextStyle: {
          objectId: headerId,
          style: {
            fontSize: { magnitude: 10, unit: "PT" },
            bold: true,
            fontFamily: "Noto Sans JP",
          },
          textRange: { type: "ALL" },
          fields: "fontSize,bold,fontFamily",
        },
      });
      requests.push({
        updateParagraphStyle: {
          objectId: headerId,
          style: { alignment: "CENTER" },
          textRange: { type: "ALL" },
          fields: "alignment",
        },
      });
    }

    // ステップ配置
    const stepIds: string[] = [];
    const stepCenterPositions: Array<{ x: number; y: number }> = [];

    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      const aIdx = actorIndex.get(step.actor) ?? 0;
      const y = stepStartY + i * (stepHeight + stepGap);
      const x = laneStartX + aIdx * laneWidth + 10_000;

      const isBranch = step.branchCondition !== "";
      const shapeType = isBranch ? "DIAMOND" : "ROUND_RECTANGLE";
      const shapeId = uid("step");

      const shapeWidth = laneWidth - 40_000;
      const shapeHeight = isBranch ? stepHeight + 60_000 : stepHeight;

      requests.push({
        createShape: {
          objectId: shapeId,
          shapeType,
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: shapeWidth, unit: "EMU" },
              height: { magnitude: shapeHeight, unit: "EMU" },
            },
            transform: {
              scaleX: 1, scaleY: 1,
              translateX: x + 10_000,
              translateY: y,
              unit: "EMU",
            },
          },
        },
      });

      const bgColor = isBranch ? COLORS.lightBlue : COLORS.white;
      requests.push({
        updateShapeProperties: {
          objectId: shapeId,
          shapeProperties: {
            shapeBackgroundFill: { solidFill: { color: { rgbColor: bgColor } } },
            outline: {
              outlineFill: { solidFill: { color: { rgbColor: COLORS.mediumBlue } } },
              weight: { magnitude: 1, unit: "PT" },
            },
          },
          fields: "shapeBackgroundFill,outline",
        },
      });

      const labelText = isBranch
        ? `${step.stepNumber}. ${step.branchCondition}`
        : `${step.stepNumber}. ${step.action}`;

      requests.push({
        insertText: { objectId: shapeId, text: labelText, insertionIndex: 0 },
      });
      requests.push({
        updateTextStyle: {
          objectId: shapeId,
          style: {
            fontSize: { magnitude: 8, unit: "PT" },
            fontFamily: "Noto Sans JP",
          },
          textRange: { type: "ALL" },
          fields: "fontSize,fontFamily",
        },
      });
      requests.push({
        updateParagraphStyle: {
          objectId: shapeId,
          style: { alignment: "CENTER" },
          textRange: { type: "ALL" },
          fields: "alignment",
        },
      });

      stepIds.push(shapeId);
      stepCenterPositions.push({
        x: x + 10_000 + Math.floor(shapeWidth / 2),
        y: y + Math.floor(shapeHeight / 2),
      });
    }

    // ステップ間の矢印（コネクター）
    for (let i = 0; i < stepIds.length - 1; i++) {
      const lineId = uid("connector");
      requests.push({
        createLine: {
          objectId: lineId,
          lineCategory: "STRAIGHT",
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: Math.abs(stepCenterPositions[i + 1].x - stepCenterPositions[i].x) || 1, unit: "EMU" },
              height: { magnitude: stepGap + 20_000, unit: "EMU" },
            },
            transform: {
              scaleX: 1, scaleY: 1,
              translateX: Math.min(stepCenterPositions[i].x, stepCenterPositions[i + 1].x),
              translateY: stepCenterPositions[i].y + Math.floor(stepHeight / 2),
              unit: "EMU",
            },
          },
        },
      });
      requests.push({
        updateLineProperties: {
          objectId: lineId,
          lineProperties: {
            lineFill: { solidFill: { color: { rgbColor: COLORS.mediumBlue } } },
            weight: { magnitude: 1.5, unit: "PT" },
            endArrow: "OPEN_ARROW",
          },
          fields: "lineFill,weight,endArrow",
        },
      });
    }
  }

  // ── Private: 画面一覧スライド ──

  private buildScreenListSlides(requests: SlideRequest[], data: ClientRequirementsDto): void {
    const screens = data.screens;
    const perPage = 8;
    const pages = Math.ceil(screens.length / perPage);

    for (let page = 0; page < pages; page++) {
      const slideId = uid("screen");
      requests.push({ createSlide: { objectId: slideId } });

      const suffix = pages > 1 ? ` (${page + 1}/${pages})` : "";
      this.addSlideTitle(requests, slideId, `画面一覧${suffix}`);

      const pageScreens = screens.slice(page * perPage, (page + 1) * perPage);
      const rows = pageScreens.length + 1;
      const cols = 4;
      const tableId = uid("screen_table");

      requests.push({
        createTable: {
          objectId: tableId,
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: 8_400_000, unit: "EMU" },
              height: { magnitude: Math.min(rows * 400_000, 3_600_000), unit: "EMU" },
            },
            transform: { scaleX: 1, scaleY: 1, translateX: 800_000, translateY: 1_200_000, unit: "EMU" },
          },
          rows,
          columns: cols,
        },
      });

      // ヘッダー
      const headers = ["No", "画面ID", "画面名", "目的・概要"];
      for (let c = 0; c < cols; c++) {
        requests.push({
          insertText: {
            objectId: tableId,
            cellLocation: { rowIndex: 0, columnIndex: c },
            text: headers[c],
            insertionIndex: 0,
          },
        });
      }
      requests.push({
        updateTableCellProperties: {
          objectId: tableId,
          tableRange: { location: { rowIndex: 0, columnIndex: 0 }, rowSpan: 1, columnSpan: cols },
          tableCellProperties: {
            tableCellBackgroundFill: {
              solidFill: { color: { rgbColor: COLORS.headerBlue } },
            },
          },
          fields: "tableCellBackgroundFill",
        },
      });

      // データ
      for (let i = 0; i < pageScreens.length; i++) {
        const scr = pageScreens[i];
        const rowData = [
          String(page * perPage + i + 1),
          scr.screenId,
          scr.screenName,
          scr.description,
        ];
        for (let c = 0; c < cols; c++) {
          requests.push({
            insertText: {
              objectId: tableId,
              cellLocation: { rowIndex: i + 1, columnIndex: c },
              text: rowData[c],
              insertionIndex: 0,
            },
          });
        }
      }

      requests.push({
        updateTextStyle: {
          objectId: tableId,
          style: { fontSize: { magnitude: 10, unit: "PT" }, fontFamily: "Noto Sans JP" },
          textRange: { type: "ALL" },
          fields: "fontSize,fontFamily",
        },
      });
    }
  }

  // ── Private: パラメータスライド ──

  private buildParametersSlides(requests: SlideRequest[], data: ClientRequirementsDto): void {
    // 入力パラメータ
    if (data.inputParameters.length > 0) {
      this.buildParameterTable(requests, "入力パラメータ", data.inputParameters);
    }

    // 出力パラメータ
    if (data.outputParameters.length > 0) {
      this.buildParameterTable(requests, "出力パラメータ", data.outputParameters);
    }
  }

  private buildParameterTable(
    requests: SlideRequest[],
    title: string,
    params: ClientRequirementsDto["inputParameters"],
  ): void {
    const perPage = 8;
    const pages = Math.ceil(params.length / perPage);

    for (let page = 0; page < pages; page++) {
      const slideId = uid("param");
      requests.push({ createSlide: { objectId: slideId } });

      const suffix = pages > 1 ? ` (${page + 1}/${pages})` : "";
      this.addSlideTitle(requests, slideId, `${title}${suffix}`);

      const pageParams = params.slice(page * perPage, (page + 1) * perPage);
      const rows = pageParams.length + 1;
      const cols = 5;
      const tableId = uid("param_table");

      requests.push({
        createTable: {
          objectId: tableId,
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: 8_400_000, unit: "EMU" },
              height: { magnitude: Math.min(rows * 400_000, 3_600_000), unit: "EMU" },
            },
            transform: { scaleX: 1, scaleY: 1, translateX: 800_000, translateY: 1_200_000, unit: "EMU" },
          },
          rows,
          columns: cols,
        },
      });

      // ヘッダー
      const headers = ["No", "データID", "項目名", "型", "備考"];
      for (let c = 0; c < cols; c++) {
        requests.push({
          insertText: {
            objectId: tableId,
            cellLocation: { rowIndex: 0, columnIndex: c },
            text: headers[c],
            insertionIndex: 0,
          },
        });
      }
      requests.push({
        updateTableCellProperties: {
          objectId: tableId,
          tableRange: { location: { rowIndex: 0, columnIndex: 0 }, rowSpan: 1, columnSpan: cols },
          tableCellProperties: {
            tableCellBackgroundFill: {
              solidFill: { color: { rgbColor: COLORS.headerBlue } },
            },
          },
          fields: "tableCellBackgroundFill",
        },
      });

      // データ
      for (let i = 0; i < pageParams.length; i++) {
        const p = pageParams[i];
        const rowData = [String(p.no), p.dataId, p.itemName, p.type, p.remarks];
        for (let c = 0; c < cols; c++) {
          requests.push({
            insertText: {
              objectId: tableId,
              cellLocation: { rowIndex: i + 1, columnIndex: c },
              text: rowData[c],
              insertionIndex: 0,
            },
          });
        }
      }

      requests.push({
        updateTextStyle: {
          objectId: tableId,
          style: { fontSize: { magnitude: 10, unit: "PT" }, fontFamily: "Noto Sans JP" },
          textRange: { type: "ALL" },
          fields: "fontSize,fontFamily",
        },
      });
    }
  }

  // ── Private: 用語集スライド ──

  private buildTerminologySlides(requests: SlideRequest[], data: ClientRequirementsDto): void {
    const terms = data.terminology;
    const perPage = 10;
    const pages = Math.ceil(terms.length / perPage);

    for (let page = 0; page < pages; page++) {
      const slideId = uid("term");
      requests.push({ createSlide: { objectId: slideId } });

      const suffix = pages > 1 ? ` (${page + 1}/${pages})` : "";
      this.addSlideTitle(requests, slideId, `用語集${suffix}`);

      const pageTerms = terms.slice(page * perPage, (page + 1) * perPage);
      const rows = pageTerms.length + 1;
      const cols = 2;
      const tableId = uid("term_table");

      requests.push({
        createTable: {
          objectId: tableId,
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: 8_400_000, unit: "EMU" },
              height: { magnitude: Math.min(rows * 350_000, 3_600_000), unit: "EMU" },
            },
            transform: { scaleX: 1, scaleY: 1, translateX: 800_000, translateY: 1_200_000, unit: "EMU" },
          },
          rows,
          columns: cols,
        },
      });

      // ヘッダー
      const headers = ["用語", "定義"];
      for (let c = 0; c < cols; c++) {
        requests.push({
          insertText: {
            objectId: tableId,
            cellLocation: { rowIndex: 0, columnIndex: c },
            text: headers[c],
            insertionIndex: 0,
          },
        });
      }
      requests.push({
        updateTableCellProperties: {
          objectId: tableId,
          tableRange: { location: { rowIndex: 0, columnIndex: 0 }, rowSpan: 1, columnSpan: cols },
          tableCellProperties: {
            tableCellBackgroundFill: {
              solidFill: { color: { rgbColor: COLORS.headerBlue } },
            },
          },
          fields: "tableCellBackgroundFill",
        },
      });

      // データ
      for (let i = 0; i < pageTerms.length; i++) {
        const t = pageTerms[i];
        const rowData = [t.term, t.definition];
        for (let c = 0; c < cols; c++) {
          requests.push({
            insertText: {
              objectId: tableId,
              cellLocation: { rowIndex: i + 1, columnIndex: c },
              text: rowData[c],
              insertionIndex: 0,
            },
          });
        }
      }

      requests.push({
        updateTextStyle: {
          objectId: tableId,
          style: { fontSize: { magnitude: 10, unit: "PT" }, fontFamily: "Noto Sans JP" },
          textRange: { type: "ALL" },
          fields: "fontSize,fontFamily",
        },
      });
    }
  }

  // ── Private: 共通ヘルパー ──

  /**
   * スライドにタイトルを追加する。
   */
  private addSlideTitle(requests: SlideRequest[], slideId: string, title: string): void {
    const titleId = uid("slide_title");
    requests.push({
      createShape: {
        objectId: titleId,
        shapeType: "TEXT_BOX",
        elementProperties: {
          pageObjectId: slideId,
          size: { width: { magnitude: 8_400_000, unit: "EMU" }, height: { magnitude: 600_000, unit: "EMU" } },
          transform: { scaleX: 1, scaleY: 1, translateX: 800_000, translateY: 300_000, unit: "EMU" },
        },
      },
    });
    requests.push({
      insertText: { objectId: titleId, text: title, insertionIndex: 0 },
    });
    requests.push({
      updateTextStyle: {
        objectId: titleId,
        style: {
          fontSize: { magnitude: 24, unit: "PT" },
          foregroundColor: { opaqueColor: { rgbColor: COLORS.darkBlue } },
          bold: true,
          fontFamily: "Noto Sans JP",
        },
        textRange: { type: "ALL" },
        fields: "fontSize,foregroundColor,bold,fontFamily",
      },
    });

    // タイトル下線
    const underlineId = uid("title_underline");
    requests.push({
      createLine: {
        objectId: underlineId,
        lineCategory: "STRAIGHT",
        elementProperties: {
          pageObjectId: slideId,
          size: { width: { magnitude: 8_400_000, unit: "EMU" }, height: { magnitude: 0, unit: "EMU" } },
          transform: { scaleX: 1, scaleY: 1, translateX: 800_000, translateY: 900_000, unit: "EMU" },
        },
      },
    });
    requests.push({
      updateLineProperties: {
        objectId: underlineId,
        lineProperties: {
          lineFill: { solidFill: { color: { rgbColor: COLORS.accentBlue } } },
          weight: { magnitude: 2, unit: "PT" },
        },
        fields: "lineFill,weight",
      },
    });
  }
}
