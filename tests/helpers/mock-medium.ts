import type { MediumRegistry } from "../../src/application/services/commission-runner.service.js";

export function createMockMediumRegistry(
  responses?: Map<string, string>,
): MediumRegistry {
  const defaultResponses = responses ?? new Map([["claude-code", "mock response"]]);
  return {
    getCommand: (name: string) => {
      const response = defaultResponses.get(name) ?? "mock response";
      return { command: "echo", args: [response] };
    },
    listMedia: () => [...defaultResponses.keys()],
  };
}
