/**
 * Builtin Resources
 * ビルトインの Commission, Palette, Policy, Contract を提供する。
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BUILTIN_COMMISSIONS = ["default", "frontend", "backend", "fullstack"] as const;
const BUILTIN_PALETTES = [
  "planner",
  "coder",
  "tester",
  "reviewer",
  "security-reviewer",
  "designer",
] as const;
const BUILTIN_POLICIES = [
  "default-policy",
  "security-policy",
  "test-policy",
] as const;
const BUILTIN_CONTRACTS = ["review-output"] as const;

export type BuiltinCommissionName = (typeof BUILTIN_COMMISSIONS)[number];
export type BuiltinPaletteName = (typeof BUILTIN_PALETTES)[number];
export type BuiltinPolicyName = (typeof BUILTIN_POLICIES)[number];
export type BuiltinContractName = (typeof BUILTIN_CONTRACTS)[number];

async function loadYaml(subdir: string, name: string): Promise<unknown> {
  const filePath = join(__dirname, subdir, `${name}.yaml`);
  const content = await readFile(filePath, "utf-8");
  return parseYaml(content);
}

/**
 * ビルトイン Commission を名前で取得する。
 */
export async function getBuiltinCommission(
  name: string,
): Promise<unknown> {
  if (!BUILTIN_COMMISSIONS.includes(name as BuiltinCommissionName)) {
    throw new Error(
      `ビルトイン Commission '${name}' が見つかりません。利用可能: ${BUILTIN_COMMISSIONS.join(", ")}`,
    );
  }
  return loadYaml("commissions", name);
}

/**
 * 利用可能なビルトイン Commission の一覧を返す。
 */
export function listBuiltinCommissions(): readonly string[] {
  return [...BUILTIN_COMMISSIONS];
}

/**
 * ビルトイン Palette を名前で取得する。
 */
export async function getBuiltinPalette(
  name: string,
): Promise<unknown> {
  if (!BUILTIN_PALETTES.includes(name as BuiltinPaletteName)) {
    throw new Error(
      `ビルトイン Palette '${name}' が見つかりません。利用可能: ${BUILTIN_PALETTES.join(", ")}`,
    );
  }
  return loadYaml("palettes", name);
}

/**
 * 利用可能なビルトイン Palette の一覧を返す。
 */
export function listBuiltinPalettes(): readonly string[] {
  return [...BUILTIN_PALETTES];
}

/**
 * ビルトイン Policy を名前で取得する。
 */
export async function getBuiltinPolicy(
  name: string,
): Promise<unknown> {
  if (!BUILTIN_POLICIES.includes(name as BuiltinPolicyName)) {
    throw new Error(
      `ビルトイン Policy '${name}' が見つかりません。利用可能: ${BUILTIN_POLICIES.join(", ")}`,
    );
  }
  return loadYaml("policies", name);
}

/**
 * 利用可能なビルトイン Policy の一覧を返す。
 */
export function listBuiltinPolicies(): readonly string[] {
  return [...BUILTIN_POLICIES];
}

/**
 * ビルトイン Contract を名前で取得する。
 */
export async function getBuiltinContract(
  name: string,
): Promise<unknown> {
  if (!BUILTIN_CONTRACTS.includes(name as BuiltinContractName)) {
    throw new Error(
      `ビルトイン Contract '${name}' が見つかりません。利用可能: ${BUILTIN_CONTRACTS.join(", ")}`,
    );
  }
  return loadYaml("contracts", name);
}

/**
 * ビルトイン Commission の YAML ファイルパスを返す。
 */
export function getBuiltinCommissionPath(name: string): string {
  return join(__dirname, "commissions", `${name}.yaml`);
}

/**
 * ビルトイン Palette の YAML ファイルパスを返す。
 */
export function getBuiltinPalettePath(name: string): string {
  return join(__dirname, "palettes", `${name}.yaml`);
}

/**
 * ビルトイン Policy の YAML ファイルパスを返す。
 */
export function getBuiltinPolicyPath(name: string): string {
  return join(__dirname, "policies", `${name}.yaml`);
}

/**
 * ビルトイン Contract の YAML ファイルパスを返す。
 */
export function getBuiltinContractPath(name: string): string {
  return join(__dirname, "contracts", `${name}.yaml`);
}
