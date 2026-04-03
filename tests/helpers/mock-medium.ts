import type {
  MediumExecutor,
  MediumExecutionRequest,
  MediumExecutionResult,
} from "../../src/application/ports/medium-executor.port.js";

export function createMockMediumExecutor(
  responses?: Map<string, string>,
): MediumExecutor & { calls: MediumExecutionRequest[] } {
  const defaultResponses = responses ?? new Map([["claude-code", "mock response"]]);
  const calls: MediumExecutionRequest[] = [];

  return {
    calls,
    async execute(request: MediumExecutionRequest): Promise<MediumExecutionResult> {
      calls.push(request);
      const content = defaultResponses.get(request.medium) ?? "mock response";
      return {
        content,
        exitCode: 0,
        durationMs: 100,
        rawStdout: content,
        rawStderr: "",
      };
    },
    listMedia() {
      return [...defaultResponses.keys()];
    },
  };
}
