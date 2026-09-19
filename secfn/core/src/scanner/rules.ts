import { generateId } from "../id.js";
import type { RulePack, ScanTarget, SecurityFinding, SecurityRule, SecFnSeverity } from "../types.js";
import {
  calculateEntropy,
  contextForLine,
  fingerprintFinding,
  lineColumn,
  redactSecret,
} from "./utils.js";

export interface PatternSecurityRuleConfig {
  id: string;
  name: string;
  description: string;
  severity: SecFnSeverity;
  pattern: RegExp;
  entropy?: number;
}

export class PatternSecurityRule implements SecurityRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly severity: SecFnSeverity;
  private readonly pattern: RegExp;
  private readonly entropy?: number;

  constructor(config: PatternSecurityRuleConfig) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.severity = config.severity;
    this.pattern = ensureGlobal(config.pattern);
    this.entropy = config.entropy;
  }

  evaluate({ target, content }: { target: ScanTarget; content: string }): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    for (const match of content.matchAll(this.pattern)) {
      if (match.index === undefined || !match[0]) continue;
      const value = match[1] || match[0];
      if (this.entropy !== undefined && calculateEntropy(value) < this.entropy) {
        continue;
      }
      const location = lineColumn(content, match.index);
      const file = target.displayPath ?? target.path;
      findings.push({
        id: generateId("finding"),
        ruleId: this.id,
        ruleName: this.name,
        severity: this.severity,
        message: this.description,
        file,
        line: location.line,
        column: location.column,
        match: value,
        redactedMatch: redactSecret(value),
        fingerprint: fingerprintFinding({
          ruleId: this.id,
          file,
          line: location.line,
          column: location.column,
          value,
        }),
        context: contextForLine(content, location.line),
      });
    }
    return findings;
  }
}

export const defaultSecretRulePack: RulePack = {
  id: "secfn.secrets",
  name: "SecFn Secret Detection",
  rules: [
    new PatternSecurityRule({
      id: "secret.aws_access_key",
      name: "AWS Access Key",
      description: "AWS access key detected",
      severity: "critical",
      pattern: /AKIA[0-9A-Z]{16}/g,
      entropy: 3.5,
    }),
    new PatternSecurityRule({
      id: "secret.aws_secret_key",
      name: "AWS Secret Key",
      description: "AWS secret access key assignment detected",
      severity: "critical",
      pattern: /aws[_-]?secret[_-]?access[_-]?key\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,
      entropy: 3.5,
    }),
    new PatternSecurityRule({
      id: "secret.github_token",
      name: "GitHub Token",
      description: "GitHub token detected",
      severity: "critical",
      pattern: /\b(gh[pousr]_[A-Za-z0-9_]{36,255})\b/g,
      entropy: 3.5,
    }),
    new PatternSecurityRule({
      id: "secret.openai_key",
      name: "OpenAI API Key",
      description: "OpenAI API key detected",
      severity: "critical",
      pattern: /\b(sk-[A-Za-z0-9_-]{20,})\b/g,
      entropy: 3.0,
    }),
    new PatternSecurityRule({
      id: "secret.stripe_key",
      name: "Stripe API Key",
      description: "Stripe API key detected",
      severity: "critical",
      pattern: /\b((?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,})\b/g,
      entropy: 3.0,
    }),
    new PatternSecurityRule({
      id: "secret.slack_token",
      name: "Slack Token",
      description: "Slack token detected",
      severity: "high",
      pattern: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
      entropy: 3.0,
    }),
    new PatternSecurityRule({
      id: "secret.private_key",
      name: "Private Key",
      description: "Private key block detected",
      severity: "critical",
      pattern: /-----BEGIN (?:RSA |OPENSSH |DSA |EC |PGP )?PRIVATE KEY-----/g,
    }),
    new PatternSecurityRule({
      id: "secret.jwt",
      name: "JWT Token",
      description: "JWT token detected",
      severity: "high",
      pattern: /\b(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g,
      entropy: 3.0,
    }),
    new PatternSecurityRule({
      id: "secret.database_url",
      name: "Database URL With Credentials",
      description: "Database URL containing credentials detected",
      severity: "high",
      pattern: /\b((?:postgres|postgresql|mysql|mongodb|redis):\/\/[^:\s]+:[^@\s]+@[^\s'"]+)/gi,
    }),
    new PatternSecurityRule({
      id: "secret.generic_api_key",
      name: "Generic API Key",
      description: "Generic API key assignment detected",
      severity: "medium",
      pattern: /(?:api[_-]?key|secret|token)\s*[=:]\s*['"]?([A-Za-z0-9_\-./+=]{24,})['"]?/gi,
      entropy: 3.5,
    }),
  ],
};

function ensureGlobal(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}
