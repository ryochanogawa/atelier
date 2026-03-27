/**
 * Repertoire Model
 * テンプレートパッケージの定義。GitHubからインストールされる再利用可能なリソース集。
 */

export interface Repertoire {
  readonly name: string;
  readonly source: string;
  readonly version: string;
  readonly installedAt: string;
}

export function createRepertoire(params: {
  name: string;
  source: string;
  version?: string;
  installedAt?: string;
}): Repertoire {
  if (!params.name.trim()) {
    throw new Error("Repertoire name must not be empty");
  }
  if (!params.source.trim()) {
    throw new Error("Repertoire source must not be empty");
  }
  return Object.freeze({
    name: params.name,
    source: params.source,
    version: params.version ?? "latest",
    installedAt: params.installedAt ?? new Date().toISOString(),
  });
}
