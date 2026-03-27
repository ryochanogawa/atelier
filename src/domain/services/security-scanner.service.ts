/**
 * SecurityScannerService Domain Service
 * セキュリティスキャン統合サービス。npm audit、ライセンスチェック、SBOM生成。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  type SecurityScanResult,
  type LicenseScanResult,
  type LicenseInfo,
  type SBOM,
  type SBOMComponent,
  type Vulnerability,
  createSecurityScanResult,
} from "../value-objects/security-scan.vo.js";

/** デフォルトの禁止ライセンス一覧 */
const DEFAULT_FORBIDDEN_LICENSES = [
  "GPL-2.0",
  "GPL-3.0",
  "AGPL-1.0",
  "AGPL-3.0",
  "SSPL-1.0",
  "EUPL-1.1",
  "EUPL-1.2",
];

export class SecurityScannerService {
  private readonly forbiddenLicenses: string[];

  constructor(forbiddenLicenses?: string[]) {
    this.forbiddenLicenses = forbiddenLicenses ?? DEFAULT_FORBIDDEN_LICENSES;
  }

  /**
   * npm audit を実行し、脆弱性情報を取得する。
   */
  async scanDependencies(workingDir: string): Promise<SecurityScanResult> {
    const vulnerabilities: Vulnerability[] = [];

    try {
      const { execa } = await import("execa");

      const result = await execa("npm", ["audit", "--json"], {
        cwd: workingDir,
        reject: false,
      });

      if (!result.stdout.trim()) {
        return createSecurityScanResult({ vulnerabilities: [] });
      }

      const auditData = JSON.parse(result.stdout) as {
        vulnerabilities?: Record<
          string,
          {
            name: string;
            severity: string;
            via: Array<
              | string
              | {
                  title?: string;
                  url?: string;
                  severity?: string;
                  name?: string;
                  range?: string;
                }
            >;
            fixAvailable: boolean | { name: string; version: string };
            range?: string;
            nodes?: string[];
          }
        >;
      };

      if (auditData.vulnerabilities) {
        for (const [pkgName, vuln] of Object.entries(
          auditData.vulnerabilities,
        )) {
          // via から実際の脆弱性情報を取得
          const descriptions: string[] = [];
          const urls: string[] = [];
          for (const v of vuln.via) {
            if (typeof v === "string") {
              descriptions.push(v);
            } else {
              if (v.title) descriptions.push(v.title);
              if (v.url) urls.push(v.url);
            }
          }

          vulnerabilities.push(
            Object.freeze({
              name: descriptions[0] ?? `Vulnerability in ${pkgName}`,
              severity: this.mapNpmSeverity(vuln.severity),
              description:
                descriptions.join("; ") ||
                `Security vulnerability found in ${pkgName}`,
              package: pkgName,
              version: vuln.range ?? "unknown",
              fixAvailable:
                typeof vuln.fixAvailable === "boolean"
                  ? vuln.fixAvailable
                  : !!vuln.fixAvailable,
              url: urls[0],
            }),
          );
        }
      }
    } catch {
      // npm audit が利用できない場合は空の結果を返す
    }

    return createSecurityScanResult({ vulnerabilities });
  }

  /**
   * package.json からライセンス情報を読み取り、禁止ライセンスをチェックする。
   */
  async scanLicenses(workingDir: string): Promise<LicenseScanResult> {
    const licenses: LicenseInfo[] = [];
    const violations: LicenseInfo[] = [];

    try {
      // node_modules の各パッケージから license 情報を読み取る
      const pkgJsonPath = path.join(workingDir, "package.json");
      const pkgContent = await readFile(pkgJsonPath, "utf-8");
      const pkg = JSON.parse(pkgContent) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      for (const [depName, depVersion] of Object.entries(allDeps)) {
        const depPkgPath = path.join(
          workingDir,
          "node_modules",
          depName,
          "package.json",
        );

        try {
          const depContent = await readFile(depPkgPath, "utf-8");
          const depPkg = JSON.parse(depContent) as {
            license?: string;
            version?: string;
          };

          const license = depPkg.license ?? "UNKNOWN";
          const version = depPkg.version ?? depVersion;
          const allowed = !this.isLicenseForbidden(license);

          const info: LicenseInfo = Object.freeze({
            package: depName,
            version,
            license,
            allowed,
          });

          licenses.push(info);
          if (!allowed) {
            violations.push(info);
          }
        } catch {
          // パッケージの package.json が読めない場合はスキップ
          licenses.push(
            Object.freeze({
              package: depName,
              version: depVersion,
              license: "UNKNOWN",
              allowed: true,
            }),
          );
        }
      }
    } catch {
      // package.json が読めない場合は空の結果を返す
    }

    return Object.freeze({
      licenses: Object.freeze([...licenses]) as LicenseInfo[],
      violations: Object.freeze([...violations]) as LicenseInfo[],
      scannedAt: new Date().toISOString(),
    });
  }

  /**
   * package.json + lockfile から SBOM (CycloneDX 形式) を生成する。
   */
  async generateSBOM(workingDir: string): Promise<SBOM> {
    const components: SBOMComponent[] = [];
    let projectName = "unknown";
    let projectVersion = "0.0.0";

    try {
      const pkgJsonPath = path.join(workingDir, "package.json");
      const pkgContent = await readFile(pkgJsonPath, "utf-8");
      const pkg = JSON.parse(pkgContent) as {
        name?: string;
        version?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      projectName = pkg.name ?? "unknown";
      projectVersion = pkg.version ?? "0.0.0";

      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      // lockfile からバージョン解決を試みる
      let lockData: Record<string, { version?: string; resolved?: string }> =
        {};
      try {
        const lockPath = path.join(workingDir, "package-lock.json");
        const lockContent = await readFile(lockPath, "utf-8");
        const lock = JSON.parse(lockContent) as {
          packages?: Record<string, { version?: string; resolved?: string }>;
          dependencies?: Record<string, { version?: string; resolved?: string }>;
        };
        // npm v7+ format
        if (lock.packages) {
          for (const [key, val] of Object.entries(lock.packages)) {
            const pkgName = key.replace(/^node_modules\//, "");
            if (pkgName) lockData[pkgName] = val;
          }
        } else if (lock.dependencies) {
          lockData = lock.dependencies;
        }
      } catch {
        // lockfile が無い場合は package.json のバージョン範囲を使用
      }

      for (const [depName, depRange] of Object.entries(allDeps)) {
        const lockEntry = lockData[depName];
        const resolvedVersion = lockEntry?.version ?? depRange;

        let license: string | undefined;
        try {
          const depPkgPath = path.join(
            workingDir,
            "node_modules",
            depName,
            "package.json",
          );
          const depContent = await readFile(depPkgPath, "utf-8");
          const depPkg = JSON.parse(depContent) as { license?: string };
          license = depPkg.license;
        } catch {
          // pass
        }

        components.push(
          Object.freeze({
            type: "library" as const,
            name: depName,
            version: resolvedVersion,
            purl: `pkg:npm/${depName}@${resolvedVersion}`,
            ...(license ? { license } : {}),
          }),
        );
      }
    } catch {
      // package.json が読めない場合
    }

    return Object.freeze({
      bomFormat: "CycloneDX" as const,
      specVersion: "1.4" as const,
      version: 1,
      metadata: Object.freeze({
        timestamp: new Date().toISOString(),
        component: Object.freeze({
          type: "application" as const,
          name: projectName,
          version: projectVersion,
        }),
      }),
      components: Object.freeze([...components]) as SBOMComponent[],
    });
  }

  /**
   * ライセンスが禁止リストに含まれているかチェックする。
   */
  private isLicenseForbidden(license: string): boolean {
    const normalized = license.toUpperCase().trim();
    return this.forbiddenLicenses.some(
      (forbidden) =>
        normalized === forbidden.toUpperCase() ||
        normalized.startsWith(forbidden.toUpperCase()),
    );
  }

  /**
   * npm audit の severity をマッピングする。
   */
  private mapNpmSeverity(
    severity: string,
  ): Vulnerability["severity"] {
    switch (severity) {
      case "critical":
        return "critical";
      case "high":
        return "high";
      case "moderate":
        return "moderate";
      case "low":
        return "low";
      default:
        return "info";
    }
  }
}
