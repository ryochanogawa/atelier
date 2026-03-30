export interface ExtractedRequirement {
  id: string;
  name: string;
}

export interface DesignMapping {
  reqId: string;
  designElement: string;
  file: string;
}

export interface TaskMapping {
  taskId: string;
  reqIds: string[];
}

export interface ExtractedTrace {
  requirements: ExtractedRequirement[];
  designMappings: DesignMapping[];
  taskMappings: TaskMapping[];
}

/**
 * requirements.md / design.md / tasks.md のMarkdown構造から
 * トレーサビリティ情報を抽出する。
 */
export function extractTraceFromSpecs(
  requirementsMd: string,
  designMd: string | null,
  tasksMd: string | null,
): ExtractedTrace {
  return {
    requirements: extractRequirements(requirementsMd),
    designMappings: extractDesignMappings(designMd),
    taskMappings: extractTaskMappings(tasksMd),
  };
}

/**
 * requirements.md のテーブルから要件を抽出する。
 * 形式: | # | 要件 | 優先度 | 完了条件 |
 */
function extractRequirements(md: string): ExtractedRequirement[] {
  const results: ExtractedRequirement[] = [];
  const lines = md.split("\n");

  let inTable = false;
  let headerPassed = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // テーブルヘッダー検出
    if (trimmed.match(/^\|.*#.*\|.*要件.*\|.*優先度.*\|.*完了条件.*\|$/)) {
      inTable = true;
      headerPassed = false;
      continue;
    }

    // セパレータ行をスキップ
    if (inTable && !headerPassed && trimmed.match(/^\|[\s\-:]+\|/)) {
      headerPassed = true;
      continue;
    }

    // データ行
    if (inTable && headerPassed && trimmed.startsWith("|")) {
      const cells = trimmed
        .split("|")
        .filter((_, i, arr) => i > 0 && i < arr.length - 1)
        .map((c) => c.trim());

      if (cells.length >= 2 && cells[0] && cells[1]) {
        results.push({ id: cells[0], name: cells[1] });
      }
    }

    // テーブル終了検出
    if (inTable && headerPassed && !trimmed.startsWith("|") && trimmed !== "") {
      inTable = false;
      headerPassed = false;
    }
  }

  return results;
}

/**
 * design.md のテーブルからマッピングを抽出する。
 * 形式: | 要件# | 設計要素 | 変更ファイル |
 */
function extractDesignMappings(md: string | null): DesignMapping[] {
  if (md === null) return [];

  const results: DesignMapping[] = [];
  const lines = md.split("\n");

  let inTable = false;
  let headerPassed = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.match(/^\|.*要件#.*\|.*設計要素.*\|.*変更ファイル.*\|$/)) {
      inTable = true;
      headerPassed = false;
      continue;
    }

    if (inTable && !headerPassed && trimmed.match(/^\|[\s\-:]+\|/)) {
      headerPassed = true;
      continue;
    }

    if (inTable && headerPassed && trimmed.startsWith("|")) {
      const cells = trimmed
        .split("|")
        .filter((_, i, arr) => i > 0 && i < arr.length - 1)
        .map((c) => c.trim());

      if (cells.length >= 3 && cells[0] && cells[1] && cells[2]) {
        results.push({
          reqId: cells[0],
          designElement: cells[1],
          file: cells[2],
        });
      }
    }

    if (inTable && headerPassed && !trimmed.startsWith("|") && trimmed !== "") {
      inTable = false;
      headerPassed = false;
    }
  }

  return results;
}

/**
 * tasks.md からタスク→要件紐付けを抽出する。
 * - [ ] 1. タスク名 の行からタスクIDを取得
 * _要件: 1, 2_ パターンから要件参照を抽出
 */
function extractTaskMappings(md: string | null): TaskMapping[] {
  if (md === null) return [];

  const results: TaskMapping[] = [];
  const lines = md.split("\n");

  let currentTaskId: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // タスク行: - [ ] 1. タスク名 or - [x] 1. タスク名
    const taskMatch = trimmed.match(/^- \[[ x]\] (\d+)\.\s/);
    if (taskMatch) {
      currentTaskId = taskMatch[1];
      continue;
    }

    // 要件参照行: _要件: 1, 2, 3_
    if (currentTaskId !== null) {
      const reqMatch = trimmed.match(/^_要件:\s*(.+?)_$/);
      if (reqMatch) {
        const reqIds = reqMatch[1]
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== "");
        results.push({ taskId: currentTaskId, reqIds });
        currentTaskId = null;
      }
    }
  }

  return results;
}
