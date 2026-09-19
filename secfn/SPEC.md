# SecFn V0 Specification

> Comprehensive self-hosted security platform for developers

## Overview

SecFn is a developer-first security solution that combines vulnerability scanning, access control, secrets management, and security monitoring into a single self-hosted platform. It builds on the super-functions ecosystem, reusing proven patterns from searchfn, authfn, and testfn.

**Version**: 0.1.0  
**Target Release**: Q2 2026  
**Status**: Specification

## Core Philosophy

- **Self-hosted first**: No external dependencies or cloud services
- **Developer experience**: Simple SDK, works locally, minimal configuration
- **Zero-trust security**: Every request validated, every resource protected
- **Comprehensive**: Scanning, monitoring, access control, and secrets in one tool
- **Performance**: Fast execution, efficient storage, real-time monitoring
- **Ecosystem integration**: Leverages super-functions infrastructure

## Architecture

```
secfn/
├── ts-sdk/
│   ├── src/
│   │   ├── core/              # Security orchestration & management
│   │   ├── scanning/          # Vulnerability & secret scanning
│   │   ├── access-control/    # RBAC and policy engine
│   │   ├── secrets/           # Secrets vault and rotation
│   │   ├── monitoring/        # Security event logging & analytics
│   │   ├── rate-limiting/     # Request throttling & protection
│   │   ├── middleware/        # Framework-agnostic security middleware
│   │   ├── storage/           # Persistence layer
│   │   └── integrations/      # Framework adapters (Express, Hono, Fastify)
│   └── examples/
├── dashboard/                 # Static HTML security dashboard
└── cli/                       # Command-line security tools
```

## V0 Features

### 1. Secret Scanning & Detection

#### Code Secret Scanner
**Priority**: P0 (Critical)

Detects hardcoded secrets in source code and version control.

**Capabilities**:
- Pattern-based secret detection
- Support for common secret types (API keys, tokens, passwords)
- Git commit scanning
- Pre-commit hook integration
- Custom pattern definition
- False positive filtering

**Secret Patterns**:
```typescript
interface SecretPattern {
  name: string;
  pattern: RegExp;
  entropy?: number;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

const defaultPatterns: SecretPattern[] = [
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    entropy: 4.5,
    description: 'AWS Access Key ID',
    severity: 'critical'
  },
  {
    name: 'Generic API Key',
    pattern: /api[_-]?key[_-]?[=:]\s*['"]?([a-zA-Z0-9]{32,})/gi,
    entropy: 4.0,
    description: 'Generic API key pattern',
    severity: 'high'
  },
  {
    name: 'Private Key',
    pattern: /-----BEGIN (RSA|OPENSSH|DSA|EC|PGP) PRIVATE KEY-----/g,
    description: 'Private cryptographic key',
    severity: 'critical'
  },
  {
    name: 'JWT Token',
    pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    description: 'JSON Web Token',
    severity: 'high'
  }
];
```

**API Design**:
```typescript
interface SecretScannerConfig {
  patterns?: SecretPattern[];
  excludePaths?: string[];
  minEntropy?: number;
  maxFileSize?: number;
  storage?: StorageConfig;
}

const scanner = secFn.createSecretScanner({
  patterns: [...defaultPatterns, ...customPatterns],
  excludePaths: ['node_modules/**', '*.test.ts'],
  minEntropy: 3.5,
  storage: {
    type: 'indexeddb',
    dbName: 'secfn-scans'
  }
});

const results = await scanner.scanDirectory('./src');
const criticalSecrets = results.filter(r => r.severity === 'critical');

// Scan git history
const gitResults = await scanner.scanGitHistory({
  branch: 'main',
  commits: 100
});
```

**Scan Result Schema**:
```typescript
interface SecretScanResult {
  id: string;
  timestamp: number;
  file: string;
  line: number;
  column: number;
  pattern: string;
  match: string;
  redactedMatch: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  entropy: number;
  context: string;
  resolved: boolean;
  falsePositive: boolean;
}
```

**Implementation Notes**:
- Use Shannon entropy calculation for secret confidence scoring
- Implement git integration via `simple-git` library
- Support incremental scanning with file hash tracking
- Store scan history in IndexedDB for trend analysis

### 2. Secrets Vault

#### Encrypted Secret Storage
**Priority**: P0 (Critical)

Secure storage and management of application secrets.

**Capabilities**:
- AES-256-GCM encryption
- Secret versioning and rotation
- Access logging and audit trails
- Secret expiration and notifications
- Environment-specific secrets
- Secret sharing with access control

**Storage Schema**:
```typescript
interface Secret {
  id: string;
  key: string;
  value: string;
  encrypted: boolean;
  version: number;
  tags: string[];
  environment?: 'development' | 'staging' | 'production';
  expiresAt?: number;
  rotateEvery?: number;
  lastRotated?: number;
  lastAccessed?: number;
  accessCount: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

interface SecretAccess {
  id: string;
  secretId: string;
  userId: string;
  action: 'read' | 'write' | 'delete' | 'rotate';
  timestamp: number;
  ip?: string;
  userAgent?: string;
}
```

**API Design**:
```typescript
interface SecretsVaultConfig {
  encryption: {
    algorithm: 'AES-256-GCM';
    masterKey: string;
    keyDerivation?: 'PBKDF2' | 'scrypt';
  };
  storage: StorageConfig;
  rotation?: {
    checkInterval: number;
    notifyBefore: number;
  };
}

const vault = secFn.createSecretsVault({
  encryption: {
    algorithm: 'AES-256-GCM',
    masterKey: process.env.MASTER_KEY,
    keyDerivation: 'PBKDF2'
  },
  storage: {
    type: 'file',
    path: './secrets.enc'
  },
  rotation: {
    checkInterval: 86400000,
    notifyBefore: 604800000
  }
});

await vault.set('stripe_api_key', 'sk_live_...', {
  tags: ['payment', 'production'],
  environment: 'production',
  expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
  rotateEvery: 90 * 24 * 60 * 60 * 1000
});

const secret = await vault.get('stripe_api_key');
const allSecrets = await vault.list({ environment: 'production' });

await vault.rotate('stripe_api_key', 'sk_live_new...');
await vault.delete('old_api_key');

const history = await vault.getAccessLog('stripe_api_key', { limit: 100 });
```

**Encryption Implementation**:
```typescript
class SecretEncryption {
  private algorithm = 'aes-256-gcm';
  private keyLength = 32;
  private ivLength = 16;
  
  async encrypt(plaintext: string, masterKey: string): Promise<string> {
    const key = await this.deriveKey(masterKey);
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return JSON.stringify({
      iv: iv.toString('hex'),
      encrypted,
      authTag: authTag.toString('hex')
    });
  }
  
  async decrypt(ciphertext: string, masterKey: string): Promise<string> {
    const key = await this.deriveKey(masterKey);
    const { iv, encrypted, authTag } = JSON.parse(ciphertext);
    
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      key,
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  private async deriveKey(masterKey: string): Promise<Buffer> {
    return crypto.pbkdf2Sync(
      masterKey,
      'secfn-salt',
      100000,
      this.keyLength,
      'sha256'
    );
  }
}
```

### 3. Access Control (RBAC)

#### Role-Based Access Control
**Priority**: P0 (Critical)

Fine-grained permission management for resources and actions.

**Capabilities**:
- Role definitions and assignments
- Permission hierarchies
- Resource-based access control
- Dynamic permission evaluation
- Context-aware access decisions
- Permission caching for performance

**Schema Design**:
```typescript
interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  inherits?: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

interface Permission {
  id: string;
  resource: string;
  action: string;
  conditions?: PolicyCondition[];
}

interface UserRole {
  userId: string;
  roleId: string;
  resourceIds?: string[];
  expiresAt?: number;
  assignedAt: number;
}

interface PolicyCondition {
  field: string;
  operator: 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'lt' | 'contains';
  value: unknown;
}
```

**API Design**:
```typescript
interface AccessControlConfig {
  database: Adapter;
  namespace?: string;
  cache?: {
    ttl: number;
    maxSize: number;
  };
}

const access = secFn.createAccessControl({
  database: adapter,
  namespace: 'secfn',
  cache: {
    ttl: 300000,
    maxSize: 1000
  }
});

// Define roles
await access.createRole({
  name: 'admin',
  permissions: ['*:*'],
  description: 'Full system access'
});

await access.createRole({
  name: 'editor',
  permissions: ['project:read', 'project:write', 'file:read', 'file:write'],
  description: 'Can edit projects and files'
});

await access.createRole({
  name: 'viewer',
  permissions: ['project:read', 'file:read'],
  inherits: [],
  description: 'Read-only access'
});

// Assign roles
await access.assignRole('user_123', 'editor', {
  resourceIds: ['project_abc', 'project_def']
});

// Check permissions
const allowed = await access.check({
  userId: 'user_123',
  action: 'project:write',
  resourceId: 'project_abc'
});

// With conditions
const conditionalCheck = await access.check({
  userId: 'user_123',
  action: 'file:delete',
  resourceId: 'file_xyz',
  context: {
    fileSize: 1024,
    fileOwner: 'user_123'
  }
});

// List user permissions
const permissions = await access.getUserPermissions('user_123');
```

**Permission Evaluation**:
```typescript
class AccessController {
  async check(request: AccessRequest): Promise<boolean> {
    const user = await this.getUser(request.userId);
    const roles = await this.getUserRoles(user.id);
    
    for (const role of roles) {
      const permissions = await this.getRolePermissions(role.id);
      
      for (const permission of permissions) {
        if (this.matchesPermission(permission, request)) {
          if (await this.evaluateConditions(permission, request.context)) {
            this.cacheResult(request, true);
            return true;
          }
        }
      }
    }
    
    this.cacheResult(request, false);
    return false;
  }
  
  private matchesPermission(permission: Permission, request: AccessRequest): boolean {
    const [permResource, permAction] = permission.id.split(':');
    const [reqResource, reqAction] = request.action.split(':');
    
    const resourceMatch = permResource === '*' || permResource === reqResource;
    const actionMatch = permAction === '*' || permAction === reqAction;
    
    return resourceMatch && actionMatch;
  }
}
```

### 4. Rate Limiting & Protection

#### Request Rate Limiting
**Priority**: P0 (Critical)

Protect against brute force attacks and API abuse.

**Capabilities**:
- Multiple rate limiting algorithms (token bucket, sliding window)
- Per-user, per-IP, per-endpoint limits
- Distributed rate limiting support
- Custom limit rules
- Rate limit headers (X-RateLimit-*)
- Automatic blocking of abusive IPs

**Storage Schema**:
```typescript
interface RateLimitRule {
  id: string;
  name: string;
  type: 'global' | 'perUser' | 'perIP' | 'perEndpoint';
  requests: number;
  window: number;
  blockDuration?: number;
  endpoints?: string[];
}

interface RateLimitEntry {
  key: string;
  count: number;
  resetAt: number;
  blocked: boolean;
  blockedUntil?: number;
}

interface RateLimitViolation {
  id: string;
  timestamp: number;
  key: string;
  ip: string;
  userId?: string;
  endpoint: string;
  requestCount: number;
  limit: number;
  window: number;
  blocked: boolean;
}
```

**API Design**:
```typescript
interface RateLimiterConfig {
  storage: Adapter;
  rules: {
    global?: RateLimitRule;
    perUser?: RateLimitRule;
    perIP?: RateLimitRule;
    perEndpoint?: Record<string, RateLimitRule>;
  };
  onLimitExceeded?: (violation: RateLimitViolation) => void;
}

const limiter = secFn.createRateLimiter({
  storage: adapter,
  rules: {
    global: {
      requests: 1000,
      window: 60000
    },
    perUser: {
      requests: 100,
      window: 60000
    },
    perIP: {
      requests: 50,
      window: 60000,
      blockDuration: 300000
    },
    perEndpoint: {
      '/api/login': {
        requests: 5,
        window: 300000,
        blockDuration: 900000
      },
      '/api/search': {
        requests: 100,
        window: 60000
      }
    }
  },
  onLimitExceeded: async (violation) => {
    await monitoring.logSecurityEvent({
      type: 'rate_limit_exceeded',
      severity: 'medium',
      ...violation
    });
  }
});

const result = await limiter.check({
  userId: 'user_123',
  ip: '192.168.1.1',
  endpoint: '/api/search'
});

if (!result.allowed) {
  throw new Error(`Rate limit exceeded. Retry after ${result.retryAfter}ms`);
}
```

**Token Bucket Algorithm**:
```typescript
class TokenBucketRateLimiter {
  async check(key: string, limit: number, window: number): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = await this.storage.get(key);
    
    if (!entry || now >= entry.resetAt) {
      await this.storage.set(key, {
        count: 1,
        resetAt: now + window,
        blocked: false
      });
      return {
        allowed: true,
        remaining: limit - 1,
        resetAt: now + window
      };
    }
    
    if (entry.blocked && now < entry.blockedUntil) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
        retryAfter: entry.blockedUntil - now
      };
    }
    
    if (entry.count >= limit) {
      entry.blocked = true;
      entry.blockedUntil = now + this.blockDuration;
      await this.storage.set(key, entry);
      
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
        retryAfter: entry.blockedUntil - now
      };
    }
    
    entry.count++;
    await this.storage.set(key, entry);
    
    return {
      allowed: true,
      remaining: limit - entry.count,
      resetAt: entry.resetAt
    };
  }
}
```

**Middleware Integration**:
```typescript
function rateLimitMiddleware(limiter: RateLimiter) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const result = await limiter.check({
      userId: req.user?.id,
      ip: req.ip,
      endpoint: req.path
    });
    
    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetAt);
    
    if (!result.allowed) {
      res.setHeader('Retry-After', Math.ceil(result.retryAfter / 1000));
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: result.retryAfter
      });
    }
    
    next();
  };
}
```

### 5. Security Monitoring & Event Logging

#### Security Event Logging
**Priority**: P1 (High)

Comprehensive audit trail and security event tracking.

**Capabilities**:
- Real-time security event logging
- Event aggregation and correlation
- Tamper-proof log storage
- Event search and filtering
- Anomaly detection
- Alert notifications

**Event Schema**:
```typescript
interface SecurityEvent {
  id: string;
  timestamp: number;
  type: 'auth_failure' | 'rate_limit_exceeded' | 'unauthorized_access' | 
        'secret_accessed' | 'permission_denied' | 'suspicious_activity' |
        'secret_exposed' | 'policy_violation';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  userId?: string;
  ip: string;
  userAgent?: string;
  resource?: string;
  action?: string;
  metadata: Record<string, unknown>;
  resolved: boolean;
  resolvedAt?: number;
  resolvedBy?: string;
  notes?: string;
}

interface SecurityMetrics {
  timeRange: { start: number; end: number };
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  topIPs: Array<{ ip: string; count: number }>;
  topUsers: Array<{ userId: string; count: number }>;
  anomalies: SecurityAnomaly[];
}
```

**API Design**:
```typescript
interface MonitoringConfig {
  storage: Adapter;
  retention?: number;
  anomalyDetection?: {
    enabled: boolean;
    sensitivity: number;
  };
  alerts?: {
    enabled: boolean;
    channels: AlertChannel[];
  };
}

const monitoring = secFn.createMonitoring({
  storage: adapter,
  retention: 90 * 24 * 60 * 60 * 1000,
  anomalyDetection: {
    enabled: true,
    sensitivity: 0.8
  },
  alerts: {
    enabled: true,
    channels: [
      { type: 'email', config: { to: 'security@example.com' } },
      { type: 'webhook', config: { url: 'https://slack.webhook.url' } }
    ]
  }
});

await monitoring.logEvent({
  type: 'auth_failure',
  severity: 'medium',
  userId: 'user_123',
  ip: '192.168.1.1',
  resource: '/api/login',
  action: 'login',
  metadata: {
    reason: 'invalid_password',
    attemptCount: 3
  }
});

const events = await monitoring.queryEvents({
  type: 'auth_failure',
  severity: ['high', 'critical'],
  startDate: Date.now() - 24 * 60 * 60 * 1000,
  endDate: Date.now()
});

const metrics = await monitoring.getMetrics({
  timeRange: {
    start: Date.now() - 7 * 24 * 60 * 60 * 1000,
    end: Date.now()
  }
});

await monitoring.resolveEvent('event_123', {
  resolvedBy: 'admin_456',
  notes: 'False positive - user locked out temporarily'
});
```

**Anomaly Detection**:
```typescript
interface SecurityAnomaly {
  id: string;
  timestamp: number;
  type: 'unusual_access_pattern' | 'geographic_anomaly' | 'spike_in_failures' | 
        'new_endpoint_access' | 'unusual_time';
  score: number;
  description: string;
  relatedEvents: string[];
  userId?: string;
  ip?: string;
}

class AnomalyDetector {
  async detectAnomalies(events: SecurityEvent[]): Promise<SecurityAnomaly[]> {
    const anomalies: SecurityAnomaly[] = [];
    
    const failureRate = this.calculateFailureRate(events);
    if (failureRate > this.threshold) {
      anomalies.push({
        type: 'spike_in_failures',
        score: failureRate,
        description: `Unusual spike in authentication failures: ${failureRate}%`
      });
    }
    
    const geographicAnomalies = this.detectGeographicAnomalies(events);
    anomalies.push(...geographicAnomalies);
    
    const timeAnomalies = this.detectTimeAnomalies(events);
    anomalies.push(...timeAnomalies);
    
    return anomalies;
  }
}
```

### 6. Vulnerability Scanning

#### Static Code Analysis
**Priority**: P1 (High)

Detect common security vulnerabilities in source code.

**Capabilities**:
- SQL injection detection
- XSS vulnerability detection
- CSRF token validation
- Insecure deserialization
- Path traversal detection
- Command injection detection
- Custom vulnerability rules

**Vulnerability Patterns**:
```typescript
interface VulnerabilityRule {
  id: string;
  name: string;
  category: 'injection' | 'xss' | 'csrf' | 'auth' | 'crypto' | 'config';
  severity: 'critical' | 'high' | 'medium' | 'low';
  pattern: RegExp | ((code: string, ast?: any) => boolean);
  description: string;
  recommendation: string;
  cwe?: string;
  owasp?: string;
}

const defaultRules: VulnerabilityRule[] = [
  {
    id: 'sql-injection',
    name: 'SQL Injection',
    category: 'injection',
    severity: 'critical',
    pattern: /\.query\s*\(\s*['"`]\s*SELECT.*\$\{.*\}/gi,
    description: 'Direct string interpolation in SQL queries',
    recommendation: 'Use parameterized queries or prepared statements',
    cwe: 'CWE-89',
    owasp: 'A03:2021'
  },
  {
    id: 'xss-innerhtml',
    name: 'XSS via innerHTML',
    category: 'xss',
    severity: 'high',
    pattern: /\.innerHTML\s*=\s*(?!['"`])/gi,
    description: 'Dynamic content assignment to innerHTML',
    recommendation: 'Use textContent or sanitize HTML input',
    cwe: 'CWE-79',
    owasp: 'A03:2021'
  },
  {
    id: 'hardcoded-secret',
    name: 'Hardcoded Secret',
    category: 'config',
    severity: 'critical',
    pattern: /(password|secret|token|api[_-]?key)\s*[=:]\s*['"][^'"]+['"]/gi,
    description: 'Hardcoded credentials in source code',
    recommendation: 'Use environment variables or secrets manager',
    cwe: 'CWE-798',
    owasp: 'A07:2021'
  }
];
```

**API Design**:
```typescript
const vulnScanner = secFn.createVulnerabilityScanner({
  rules: [...defaultRules, ...customRules],
  excludePaths: ['node_modules/**', '*.test.ts'],
  storage: {
    type: 'indexeddb',
    dbName: 'secfn-vulnerabilities'
  }
});

const results = await vulnScanner.scan('./src');

const critical = results.filter(v => v.severity === 'critical');
const groupedByCategory = vulnScanner.groupByCategory(results);

await vulnScanner.generateReport({
  format: 'html',
  output: './security-report.html'
});
```

### 7. Security Middleware

#### Framework-Agnostic Security Middleware
**Priority**: P1 (High)

Security middleware for popular web frameworks.

**Capabilities**:
- Request validation and sanitization
- Security headers (CSP, HSTS, X-Frame-Options)
- CORS configuration
- CSRF protection
- Input validation
- Output encoding
- Rate limiting integration
- Access control integration

**API Design**:
```typescript
interface SecurityMiddlewareConfig {
  rateLimiter?: RateLimiter;
  accessControl?: AccessControl;
  monitoring?: SecurityMonitoring;
  headers?: SecurityHeadersConfig;
  cors?: CorsConfig;
  csrf?: CsrfConfig;
  validation?: ValidationConfig;
}

const security = secFn.createMiddleware({
  rateLimiter: limiter,
  accessControl: access,
  monitoring: monitoring,
  headers: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    frameguard: { action: 'deny' },
    xssProtection: true
  },
  cors: {
    origin: ['https://example.com'],
    credentials: true
  },
  csrf: {
    enabled: true,
    cookieName: '_csrf'
  }
});

// Express integration
app.use(toExpress(security.middleware));

// Hono integration
app.use('*', toHono(security.middleware));

// Fastify integration
fastify.register(toFastify(security.middleware));
```

### 8. Storage & Persistence

#### Storage Layer
**Priority**: P0 (Critical)

Efficient storage for security data, events, and configurations.

**Storage Backends**:
- **IndexedDB**: Browser/local development (reuse `searchfn/src/storage/indexeddb-manager.ts`)
- **File System**: Server environments, encrypted storage
- **Database Adapters**: Production use via `@superfunctions/db`

**Schema Design**:
```typescript
const STORES = {
  secrets: 'secfn_secrets',
  secretAccess: 'secfn_secret_access',
  roles: 'secfn_roles',
  permissions: 'secfn_permissions',
  userRoles: 'secfn_user_roles',
  securityEvents: 'secfn_security_events',
  rateLimits: 'secfn_rate_limits',
  scanResults: 'secfn_scan_results',
  vulnerabilities: 'secfn_vulnerabilities',
  config: 'secfn_config'
};

secrets: {
  keyPath: 'id',
  indexes: ['key', 'environment', 'expiresAt', 'tags']
}

securityEvents: {
  keyPath: 'id',
  indexes: ['timestamp', 'type', 'severity', 'userId', 'ip']
}

scanResults: {
  keyPath: 'id',
  indexes: ['timestamp', 'severity', 'file', 'pattern']
}
```

**Storage API**:
```typescript
class SecurityStorage {
  async saveSecret(secret: Secret): Promise<void>;
  async getSecret(id: string): Promise<Secret | null>;
  async listSecrets(filter?: SecretFilter): Promise<Secret[]>;
  async deleteSecret(id: string): Promise<void>;
  
  async logSecurityEvent(event: SecurityEvent): Promise<void>;
  async queryEvents(query: EventQuery): Promise<SecurityEvent[]>;
  async getMetrics(range: TimeRange): Promise<SecurityMetrics>;
  
  async saveScanResult(result: ScanResult): Promise<void>;
  async getScanHistory(limit: number): Promise<ScanResult[]>;
  
  async cleanup(retentionDays: number): Promise<void>;
}
```

## Technical Implementation

### Dependencies

**Core**:
- TypeScript 5.6+
- Node.js 18+

**Storage**:
- fake-indexeddb (for Node.js IndexedDB support)
- @superfunctions/db (database adapters)

**Security**:
- crypto (Node.js built-in)
- bcrypt (password hashing)
- rate-limiter-flexible

**Scanning**:
- glob (file pattern matching)
- simple-git (git integration)

**Utilities**:
- chalk (terminal colors)
- ora (spinners)
- commander (CLI)

### Performance Targets

**V0 Benchmarks**:
- Scan 10,000 files for secrets in <10s
- Rate limit check in <5ms
- Access control check in <10ms (with cache)
- Log 1000 security events in <500ms
- Query 10,000 events in <100ms
- Encrypt/decrypt secret in <10ms

### Storage Limits

**IndexedDB**:
- Max database size: Browser-dependent (typically ~50MB+)
- Event retention: 90 days default
- Automatic cleanup on threshold

**File System**:
- No hard limits
- Encrypted storage with AES-256-GCM
- Configurable retention policy

### Browser Compatibility

**IndexedDB Storage**:
- Chrome 24+
- Firefox 16+
- Safari 10+
- Edge 12+

**Dashboard**:
- Modern browsers with ES6 support
- No IE11 support

## API Examples

### Basic Setup

```typescript
import { secFn } from 'secfn';
import { drizzleAdapter } from '@superfunctions/db/adapters';

const adapter = drizzleAdapter({ db, dialect: 'postgres' });

const security = secFn.create({
  database: adapter,
  namespace: 'secfn',
  masterKey: process.env.MASTER_KEY
});

await security.initialize();
```

### Secret Scanning

```typescript
const scanner = security.createSecretScanner({
  excludePaths: ['node_modules/**', 'dist/**']
});

const results = await scanner.scanDirectory('./src');

for (const result of results) {
  if (result.severity === 'critical') {
    console.error(`🚨 ${result.pattern} found in ${result.file}:${result.line}`);
  }
}
```

### Secrets Management

```typescript
const vault = security.createSecretsVault();

await vault.set('database_url', process.env.DATABASE_URL, {
  environment: 'production',
  tags: ['database', 'critical']
});

const dbUrl = await vault.get('database_url');
```

### Access Control

```typescript
const access = security.createAccessControl();

await access.createRole({
  name: 'developer',
  permissions: ['code:read', 'code:write', 'deploy:staging']
});

await access.assignRole('user_123', 'developer');

const canDeploy = await access.check({
  userId: 'user_123',
  action: 'deploy:production'
});
```

### Rate Limiting

```typescript
const limiter = security.createRateLimiter({
  rules: {
    perUser: { requests: 100, window: 60000 },
    perEndpoint: {
      '/api/login': { requests: 5, window: 300000 }
    }
  }
});

const result = await limiter.check({
  userId: req.user.id,
  ip: req.ip,
  endpoint: req.path
});

if (!result.allowed) {
  throw new Error('Rate limit exceeded');
}
```

### Security Monitoring

```typescript
const monitoring = security.createMonitoring();

await monitoring.logEvent({
  type: 'auth_failure',
  severity: 'medium',
  userId: 'user_123',
  ip: req.ip,
  resource: '/api/login'
});

const metrics = await monitoring.getMetrics({
  timeRange: {
    start: Date.now() - 24 * 60 * 60 * 1000,
    end: Date.now()
  }
});

console.log(`Total events: ${metrics.totalEvents}`);
console.log(`Critical events: ${metrics.eventsBySeverity.critical}`);
```

### Complete Express Integration

```typescript
import express from 'express';
import { secFn } from 'secfn';
import { toExpress } from '@superfunctions/http-express';

const app = express();

const security = secFn.create({
  database: adapter,
  masterKey: process.env.MASTER_KEY
});

const access = security.createAccessControl();
const limiter = security.createRateLimiter({
  rules: {
    global: { requests: 1000, window: 60000 }
  }
});
const monitoring = security.createMonitoring();

const middleware = security.createMiddleware({
  accessControl: access,
  rateLimiter: limiter,
  monitoring: monitoring
});

app.use(toExpress(middleware));

app.get('/api/protected', async (req, res) => {
  const allowed = await access.check({
    userId: req.user.id,
    action: 'resource:read'
  });
  
  if (!allowed) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  res.json({ data: 'protected resource' });
});

app.listen(3000);
```

## Development Roadmap

### Phase 1: Core Infrastructure (Weeks 1-2)
- [ ] Core security manager architecture
- [ ] Storage layer (IndexedDB + File System)
- [ ] Configuration management
- [ ] Basic CLI structure

### Phase 2: Secrets Management (Weeks 3-4)
- [ ] Secret scanning engine
- [ ] Secret pattern library
- [ ] Git integration for commit scanning
- [ ] Secrets vault with encryption
- [ ] Secret rotation logic

### Phase 3: Access Control (Weeks 5-6)
- [ ] RBAC implementation
- [ ] Role and permission management
- [ ] Policy evaluation engine
- [ ] Permission caching
- [ ] Database schema for roles/permissions

### Phase 4: Rate Limiting & Monitoring (Weeks 7-8)
- [ ] Token bucket rate limiter
- [ ] Sliding window implementation
- [ ] Security event logging
- [ ] Event query engine
- [ ] Metrics aggregation

### Phase 5: Vulnerability Scanning (Weeks 9-10)
- [ ] Static code analyzer
- [ ] Vulnerability rule engine
- [ ] OWASP Top 10 patterns
- [ ] Scan result storage
- [ ] Report generation

### Phase 6: Middleware & Integrations (Weeks 11-12)
- [ ] Framework-agnostic middleware
- [ ] Express adapter
- [ ] Hono adapter
- [ ] Fastify adapter
- [ ] Security headers middleware

### Phase 7: Dashboard & CLI (Weeks 13-14)
- [ ] Security dashboard UI
- [ ] Metrics visualization
- [ ] Event viewer
- [ ] CLI commands
- [ ] Report exports

### Phase 8: Polish & Documentation (Weeks 15-16)
- [ ] Comprehensive documentation
- [ ] Usage examples
- [ ] Performance optimization
- [ ] Testing and bug fixes
- [ ] Beta release

## Testing Strategy

### Unit Tests
- Core modules: >90% coverage
- Encryption: Algorithm validation
- Access control: Policy evaluation tests
- Rate limiting: Algorithm correctness
- Scanning: Pattern matching accuracy

### Integration Tests
- End-to-end secret scanning
- Multi-framework middleware
- Storage persistence
- Event logging pipeline

### Security Tests
- Encryption strength validation
- Rate limiter bypass attempts
- Access control edge cases
- Secret detection accuracy

### Performance Tests
- Large codebase scanning (100,000+ files)
- High-throughput rate limiting (10,000+ req/s)
- Event logging under load
- Database query performance

## Documentation

### User Guides
- Getting Started
- Secret Scanning Guide
- Secrets Vault Usage
- Access Control Setup
- Rate Limiting Configuration
- Security Monitoring
- Middleware Integration
- Dashboard Usage

### API Reference
- Complete TypeScript API docs
- Configuration options
- Extension points
- Custom rule development

### Examples
- Basic setup
- Express integration
- Hono integration
- Custom vulnerability rules
- Security automation workflows

## Success Metrics

**Adoption**:
- 50+ GitHub stars in first month
- 10+ production deployments
- 5+ community examples

**Performance**:
- Scan 10,000 files in <10 seconds
- Rate limit check in <5ms
- Access control check in <10ms

**Quality**:
- <5 critical bugs in first 3 months
- >90% test coverage
- <24hr response time on security issues

## Future Roadmap (Post-V0)

### V1 Features
- Machine learning-based anomaly detection
- Automated threat response
- Security policy recommendations
- Integration with external security tools
- Cloud provider security scanning
- Container security scanning

### V2 Features
- Real-time collaborative security dashboard
- Advanced compliance reporting (SOC 2, ISO 27001)
- Security orchestration and automation
- Threat intelligence integration
- Security training and awareness tools

## Open Questions

1. **Cloud Integration**: Should we support cloud secret managers (AWS Secrets Manager, etc.)?
2. **Machine Learning**: Include ML-based anomaly detection in V0 or V1?
3. **Compliance**: Which compliance frameworks to prioritize?
4. **Distributed**: Support for distributed rate limiting across multiple servers?
5. **Real-time**: WebSocket-based real-time security dashboard?

## Contributors

Initial implementation by 21n team as part of super-functions ecosystem.

## License

MIT License - See LICENSE file for details
