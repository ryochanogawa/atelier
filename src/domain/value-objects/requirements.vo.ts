/**
 * Requirements Value Objects
 * 構造化要件定義に関する型定義。
 */

export interface RequirementsDocument {
  readonly title: string;
  readonly functional: Requirement[];
  readonly nonFunctional: Requirement[];
  readonly assumptions: string[];
  readonly openQuestions: string[];
}

export interface Requirement {
  readonly id: string;
  readonly description: string;
  readonly priority: "must" | "should" | "could" | "wont";
  readonly category:
    | "feature"
    | "security"
    | "performance"
    | "usability"
    | "reliability";
  readonly acceptanceCriteria: string[];
}

export interface Contradiction {
  readonly requirementIds: [string, string];
  readonly reason: string;
  readonly severity: "error" | "warning";
}

export interface Gap {
  readonly category: string;
  readonly description: string;
  readonly suggestion: string;
}

export interface Checklist {
  readonly items: ChecklistItem[];
}

export interface ChecklistItem {
  readonly question: string;
  readonly category: string;
  readonly required: boolean;
}
