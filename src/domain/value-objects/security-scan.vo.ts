/**
 * SecurityScan Value Objects
 * セキュリティスキャン結果に関する値オブジェクト。
 */

export interface Vulnerability {
  readonly name: string;
  readonly severity: "critical" | "high" | "moderate" | "low" | "info";
  readonly description: string;
  readonly package: string;
  readonly version: string;
  readonly fixAvailable: boolean;
  readonly url?: string;
}

export interface SecurityScanResult {
  readonly vulnerabilities: Vulnerability[];
  readonly summary: {
    readonly critical: number;
    readonly high: number;
    readonly moderate: number;
    readonly low: number;
    readonly info: number;
    readonly total: number;
  };
  readonly scannedAt: string;
}

export interface LicenseInfo {
  readonly package: string;
  readonly version: string;
  readonly license: string;
  readonly allowed: boolean;
}

export interface LicenseScanResult {
  readonly licenses: LicenseInfo[];
  readonly violations: LicenseInfo[];
  readonly scannedAt: string;
}

export interface SBOMComponent {
  readonly type: "library";
  readonly name: string;
  readonly version: string;
  readonly purl?: string;
  readonly license?: string;
}

export interface SBOM {
  readonly bomFormat: "CycloneDX";
  readonly specVersion: "1.4";
  readonly version: number;
  readonly metadata: {
    readonly timestamp: string;
    readonly component: {
      readonly type: "application";
      readonly name: string;
      readonly version: string;
    };
  };
  readonly components: SBOMComponent[];
}

/**
 * SecurityScanResult を生成する。
 */
export function createSecurityScanResult(params: {
  vulnerabilities: Vulnerability[];
}): SecurityScanResult {
  const vulns = params.vulnerabilities;
  return Object.freeze({
    vulnerabilities: Object.freeze([...vulns]) as Vulnerability[],
    summary: Object.freeze({
      critical: vulns.filter((v) => v.severity === "critical").length,
      high: vulns.filter((v) => v.severity === "high").length,
      moderate: vulns.filter((v) => v.severity === "moderate").length,
      low: vulns.filter((v) => v.severity === "low").length,
      info: vulns.filter((v) => v.severity === "info").length,
      total: vulns.length,
    }),
    scannedAt: new Date().toISOString(),
  });
}
