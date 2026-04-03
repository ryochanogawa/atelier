import type {
  MediumExecutor,
  MediumExecutionRequest,
  MediumExecutionResult,
} from "../../src/application/ports/medium-executor.port.js";

/**
 * InMemoryMediumExecutor
 * E2E テスト用の MediumExecutor。レスポンスキューを事前に登録し、
 * execute() が呼ばれるたびにキューから取り出して返す。
 */
export class InMemoryMediumExecutor implements MediumExecutor {
  private readonly responseQueue: Map<string, MediumExecutionResult[]> = new Map();
  readonly executedRequests: MediumExecutionRequest[] = [];
  private readonly registeredMedia: string[];

  constructor(media?: string[]) {
    this.registeredMedia = media ?? ["claude-code", "codex", "gemini"];
  }

  enqueue(medium: string, result: MediumExecutionResult): void {
    const queue = this.responseQueue.get(medium);
    if (queue) {
      queue.push(result);
    } else {
      this.responseQueue.set(medium, [result]);
    }
  }

  enqueueContent(medium: string, content: string): void {
    this.enqueue(medium, {
      content,
      exitCode: 0,
      durationMs: 50,
      rawStdout: content,
      rawStderr: "",
    });
  }

  async execute(request: MediumExecutionRequest): Promise<MediumExecutionResult> {
    this.executedRequests.push(request);
    const queue = this.responseQueue.get(request.medium);
    if (!queue || queue.length === 0) {
      throw new Error(`No response queued for medium "${request.medium}"`);
    }
    return queue.shift()!;
  }

  listMedia(): string[] {
    return this.registeredMedia;
  }
}
