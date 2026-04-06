/**
 * Google Slides Adapter
 * テンプレートベースのスライド生成。
 * AIが生成したスライドプラン（SlidePlanDto）に基づき、
 * 各スライドタイプのレンダラーにディスパッチして描画する。
 *
 * 認証は共通 OAuth ヘルパーを使用（Sheets と同一トークン）。
 */

import type { PresentationPort, PresentationWriteResult } from "../../domain/ports/presentation.port.js";
import type { ClientRequirementsDto } from "../../application/dto/client-requirements.dto.js";
import type { SlidePlanDto, SlideDescriptor } from "../../application/dto/slide-plan.dto.js";
import { getGoogleAuthClient } from "../../infrastructure/google/oauth.js";
import {
  type SlideRequest,
  SLIDE_W,
  SLIDE_H,
} from "./renderers/base.renderer.js";
import { CoverRenderer } from "./renderers/cover.renderer.js";
import { BenefitsRenderer } from "./renderers/benefits.renderer.js";
import { OverviewRenderer } from "./renderers/overview.renderer.js";
import { CardGridRenderer } from "./renderers/card-grid.renderer.js";
import { DetailCardsRenderer } from "./renderers/detail-cards.renderer.js";
import { SequenceDiagramRenderer } from "./renderers/sequence-diagram.renderer.js";
import { DataTableRenderer } from "./renderers/data-table.renderer.js";
import { ScreenListRenderer } from "./renderers/screen-list.renderer.js";
import { ArchitectureRenderer } from "./renderers/architecture.renderer.js";

// ── 型定義 ──

type SlidesApi = {
  presentations: {
    create: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
    batchUpdate: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
  };
};

// ── レンダラーインスタンス ──

const RENDERERS: Record<string, { render: (r: SlideRequest[], d: never) => void }> = {
  cover: new CoverRenderer(),
  benefits: new BenefitsRenderer(),
  overview: new OverviewRenderer(),
  "card-grid": new CardGridRenderer(),
  "detail-cards": new DetailCardsRenderer(),
  "sequence-diagram": new SequenceDiagramRenderer(),
  "data-table": new DataTableRenderer(),
  "screen-list": new ScreenListRenderer(),
  "architecture": new ArchitectureRenderer(),
};

export class GoogleSlidesAdapter implements PresentationPort {
  private slidesApi: SlidesApi | null = null;

  /**
   * スライドプランからプレゼンテーションを作成する。
   * AIが計画したスライド構成に基づき、各テンプレートレンダラーで描画。
   */
  async createFromPlan(plan: SlidePlanDto): Promise<PresentationWriteResult> {
    const slides = await this.getSlidesApi();

    // タイトルを最初のcoverスライドから取得
    const coverSlide = plan.slides.find((s) => s.slideType === "cover");
    const title = coverSlide ? (coverSlide as { projectName: string }).projectName : "プレゼンテーション";

    const createResponse = await slides.presentations.create({
      requestBody: {
        title,
        pageSize: {
          width: { magnitude: SLIDE_W, unit: "EMU" },
          height: { magnitude: SLIDE_H, unit: "EMU" },
        },
      },
    });

    const presentationId = createResponse.data.presentationId as string;
    const presentationUrl = `https://docs.google.com/presentation/d/${presentationId}/edit`;

    // デフォルトスライドを削除するためIDを取得
    const defaultSlides = (createResponse.data.slides as Array<{ objectId: string }>) ?? [];
    const defaultSlideIds = defaultSlides.map((s) => s.objectId);

    // 全スライドのリクエストを構築
    const requests: SlideRequest[] = [];

    for (const descriptor of plan.slides) {
      const renderer = RENDERERS[descriptor.slideType];
      if (renderer) {
        try {
          renderer.render(requests, descriptor as never);
        } catch (e) {
          console.error(`[WARN] スライド "${descriptor.slideType}" の描画でエラー: ${(e as Error).message}`);
        }
      }
    }

    // デフォルトスライド削除
    for (const id of defaultSlideIds) {
      requests.push({ deleteObject: { objectId: id } });
    }

    // バッチ更新
    if (requests.length > 0) {
      await slides.presentations.batchUpdate({
        presentationId,
        requestBody: { requests },
      });
    }

    return { presentationId, presentationUrl };
  }

  /**
   * 後方互換: ClientRequirementsDtoからデフォルトのスライドプランを構築して描画。
   * slide-compositionコミッションが使えない場合のフォールバック。
   */
  async create(data: ClientRequirementsDto): Promise<PresentationWriteResult> {
    const plan = this.buildDefaultPlan(data);
    return this.createFromPlan(plan);
  }

  // ── Private ──

  private async getSlidesApi(): Promise<SlidesApi> {
    if (this.slidesApi) return this.slidesApi;
    const { google } = await import("googleapis");
    const auth = await getGoogleAuthClient();
    this.slidesApi = google.slides({ version: "v1", auth }) as unknown as SlidesApi;
    return this.slidesApi;
  }

  /**
   * ClientRequirementsDtoからデフォルトのスライドプランを生成する。
   * AI による構成計画がない場合の決定的なフォールバック。
   */
  private buildDefaultPlan(data: ClientRequirementsDto): SlidePlanDto {
    const slides: SlideDescriptor[] = [];

    // 表紙
    slides.push({
      slideType: "cover",
      projectName: data.projectInfo.projectName,
      subtitle: data.projectInfo.subtitle || data.projectInfo.documentTitle,
      version: data.projectInfo.version,
      author: data.projectInfo.author,
      date: data.projectInfo.createdDate,
    });

    // 導入効果
    if (data.projectInfo.keyBenefits.length > 0) {
      slides.push({
        slideType: "benefits",
        title: "導入効果",
        benefits: data.projectInfo.keyBenefits.map((text, i) => ({
          icon: ["✓", "✓", "✓", "✓"][i] || "✓",
          text,
        })),
      });
    }

    // 処理概要
    if (data.processOverview) {
      slides.push({
        slideType: "overview",
        title: "プロジェクト概要",
        icon: "📋",
        body: data.processOverview,
      });
    }

    // 要件カテゴリ全体像
    const grouped = new Map<string, typeof data.requirements>();
    for (const req of data.requirements) {
      const list = grouped.get(req.category) || [];
      list.push(req);
      grouped.set(req.category, list);
    }

    if (grouped.size > 1) {
      slides.push({
        slideType: "card-grid",
        title: "機能要件の全体像",
        cards: [...grouped.entries()].map(([cat, items]) => ({
          icon: "📋",
          heading: cat,
          subtext: `${items.length}件の要件`,
        })),
      });
    }

    // カテゴリ別要件詳細
    for (const [cat, items] of grouped) {
      const perPage = 3;
      const pages = Math.ceil(items.length / perPage);
      for (let page = 0; page < pages; page++) {
        const suffix = pages > 1 ? ` (${page + 1}/${pages})` : "";
        slides.push({
          slideType: "detail-cards",
          title: `${cat}${suffix}`,
          cards: items.slice(page * perPage, (page + 1) * perPage).map((req) => ({
            id: req.id,
            name: req.name,
            description: req.description,
            badge: req.priority === "Must" ? "必須" : req.priority === "Should" ? "推奨" : "任意",
            badgeColor: req.priority === "Must" ? "orange" as const : req.priority === "Should" ? "green" as const : "gray" as const,
          })),
        });
      }
    }

    // 業務フロー → シーケンス図
    for (const flow of data.businessFlows) {
      const stepsPerPage = 6;
      const totalPages = Math.ceil(flow.steps.length / stepsPerPage);

      for (let page = 0; page < totalPages; page++) {
        const suffix = totalPages > 1 ? ` (${page + 1}/${totalPages})` : "";
        const pageSteps = flow.steps.slice(page * stepsPerPage, (page + 1) * stepsPerPage);

        slides.push({
          slideType: "sequence-diagram",
          title: `${flow.flowName}${suffix}`,
          summary: flow.flowSummary || flow.description,
          actors: flow.actors.map((name, i) => ({
            name,
            icon: ["👤", "🏢", "🖥️", "👥", "🏪"][i] || "👤",
            color: (["red", "green", "orange", "blue", "purple"] as const)[i % 5],
          })),
          steps: pageSteps.map((step) => ({
            stepNumber: step.stepNumber,
            fromActor: step.actor,
            toActor: step.actor,
            label: step.branchCondition || step.action,
            sublabel: step.details || "",
            style: step.branchCondition
              ? "branch" as const
              : step.stepNumber === 1 ? "start" as const
              : step.stepNumber === flow.steps.length ? "end" as const
              : "normal" as const,
          })),
        });
      }
    }

    // 画面一覧
    if (data.screens.length > 0) {
      const perPage = 4;
      const pages = Math.ceil(data.screens.length / perPage);
      for (let page = 0; page < pages; page++) {
        const suffix = pages > 1 ? ` (${page + 1}/${pages})` : "";
        slides.push({
          slideType: "screen-list",
          title: `画面一覧${suffix}`,
          screens: data.screens.slice(page * perPage, (page + 1) * perPage).map((scr) => ({
            icon: scr.icon || "📋",
            name: scr.screenName,
            description: scr.description,
          })),
        });
      }
    }

    // パラメータ
    const buildParamTable = (title: string, params: typeof data.inputParameters) => {
      const perPage = 6;
      const pages = Math.ceil(params.length / perPage);
      for (let page = 0; page < pages; page++) {
        const suffix = pages > 1 ? ` (${page + 1}/${pages})` : "";
        slides.push({
          slideType: "data-table",
          title: `${title}${suffix}`,
          columns: ["No", "項目名", "型", "説明"],
          rows: params.slice(page * perPage, (page + 1) * perPage).map((p) => [
            String(p.no), p.itemName, p.type, p.remarks,
          ]),
        });
      }
    };

    if (data.inputParameters.length > 0) buildParamTable("📥 入力データ項目", data.inputParameters);
    if (data.outputParameters.length > 0) buildParamTable("📤 出力データ項目", data.outputParameters);

    // 用語集
    if (data.terminology.length > 0) {
      const perPage = 6;
      const pages = Math.ceil(data.terminology.length / perPage);
      for (let page = 0; page < pages; page++) {
        const suffix = pages > 1 ? ` (${page + 1}/${pages})` : "";
        slides.push({
          slideType: "data-table",
          title: `📖 用語集${suffix}`,
          columns: ["用語", "意味"],
          rows: data.terminology.slice(page * perPage, (page + 1) * perPage).map((t) => [
            t.term, t.definition,
          ]),
        });
      }
    }

    return { slides };
  }
}
