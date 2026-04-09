# hostfn

**Universal application deployment CLI** - Deploy Node.js applications to any VPS.

> Zero-downtime deployments • Health checks • Auto-rollback • PM2 integration • Nginx setup and SSL support

---

## Quick Start

```bash
# Initialize configuration
cd your-project
hostfn init

# Setup server (Requires ssh keys pre-configured)
hostfn server setup username@your-server.com

# Deploy to production
hostfn deploy production

# Expose via Nginx, provision SSL certificate(s)
hostfn expose production

# Monitor your app
hostfn status production
hostfn logs production
```

---

## Table of Contents

- [Installation](#installation)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
  - [Single Application](#single-application)
  - [Monorepo / Multi-Service](#monorepo--multi-service)
- [Commands Reference](#commands-reference)
- [Deployment Strategies](#deployment-strategies)
- [Advanced Topics](#advanced-topics)
- [Examples](#examples)
- [Architecture](#architecture)
- [Development](#development)

---
## Installation

### via npm

```bash
npm install -g hostfn
```

### via source

```bash
# Clone repository
cd hostfn/
# Install dependencies
npm install
# Build the project
npm run build
cd packages/cli
npm link
```

### Using the CLI

```bash
# After linking
hostfn --version
hostfn --help
```

---

## Getting Started

### 1. Initialize Your Project

```bash
cd your-project
hostfn init
```

This creates `hostfn.config.json` with smart defaults detected from your project.

### 2. Setup Your Server

For the next steps to work, the ssh keys should configured on the machine where hostfn CLI is being used.

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/your-private-key
```

If ssh-agent or default ssh config is not available, you can set the SSH key and passphrase manually:
```bash
export HOSTFN_SSH_PASSPHRASE="your-passphrase"
export HOSTFN_SSH_KEY=$(cat ~/.ssh/your-private-key.pem | base64)
hostfn <command> <environment>
```

```bash
hostfn server setup ubuntu@your-server.com
```

This installs:
- Node.js (via nvm)
- PM2 (process manager)
- Required system dependencies

### 3. Setup environment variables and deploy

```bash
hostfn env push production .env.production
```
This uploads your local `.env.production` file to the server.
To update an individual env value, use `hostfn env set <environment> <key> <value>` instead.


```bash
hostfn deploy <environment>
```

Deploy command will run the application with:
- PM2 managing the process
- Automatic restarts on crashes
- Health checks ensuring readiness
- Backup created for rollback


### 4. Expose the application

```bash
hostfn expose <environment>
```

This will expose the application via Nginx, provision SSL certificate(s) and create a DNS record.

### 5. Monitor the application

```bash
hostfn status <environment>
hostfn logs <environment>
```

---

## Configuration

### Single Application

Create `hostfn.config.json` in your project root:

```json
{
  "name": "my-app",
  "runtime": "nodejs",
  "version": "18",
  "environments": {
    "production": {
      "server": "ubuntu@prod.example.com",
      "port": 3000,
      "instances": "max",
      "domain": "api.example.com",
      "sslEmail": "admin@example.com"
    },
    "staging": {
      "server": "ubuntu@staging.example.com",
      "port": 3000,
      "instances": 2,
      "sslEmail": "admin@example.com",
      "domain": ["domain1.example.com", "domain2.example.com"]
    }
  },
  "build": {
    "command": "npm run build",
    "directory": "dist",
    "nodeModules": "all"
  },
  "start": {
    "command": "npm start",
    "entry": "dist/index.js"
  },
  "health": {
    "path": "/health",
    "timeout": 60,
    "retries": 10,
    "interval": 3
  },
  "env": {
    "required": ["NODE_ENV", "DATABASE_URL"],
    "optional": ["REDIS_URL", "LOG_LEVEL"]
  },
  "sync": {
    "exclude": [
      "node_modules",
      ".git",
      "dist",
      ".env",
      "*.log"
    ]
  },
  "backup": {
    "keep": 5
  }
}
```

### Monorepo / Multi-Service

Perfect for microservices architectures where each service lives in its own directory.

#### Strategy 1: All Services on Same Server

```json
{
  "name": "my-monorepo",
  "runtime": "nodejs",
  "version": "18",
  "environments": {
    "production": {
      "server": "ubuntu@shared-server.com",
      "port": 3000,
      "instances": "max"
    }
  },
  "build": {
    "command": "npm run build",
    "directory": "dist"
  },
  "start": {
    "command": "npm start"
  },
  "services": {
    "account": {
      "port": 3001,
      "path": "services/account",
      "domain": "account.example.com",
      "instances": "max"
    },
    "auth": {
      "port": 3002,
      "path": "services/auth",
      "domain": "auth.example.com",
      "instances": 4
    },
    "notification": {
      "port": 3003,
      "path": "services/notification"
    }
  }
}
```

**Result**: All 3 services deploy to `ubuntu@shared-server.com`:
- `my-monorepo-account-production` on port 3001
- `my-monorepo-auth-production` on port 3002
- `my-monorepo-notification-production` on port 3003

#### Strategy 2: Services on Different Servers

```json
{
  "name": "my-monorepo",
  "runtime": "nodejs",
  "version": "18",
  "environments": {
    "production": {
      "server": "ubuntu@default-server.com",
      "port": 3000,
      "instances": "max"
    }
  },
  "build": {
    "command": "npm run build",
    "directory": "dist"
  },
  "start": {
    "command": "npm start"
  },
  "services": {
    "account": {
      "port": 3001,
      "path": "services/account",
      "server": "ubuntu@account-dedicated.com",
      "instances": "max"
    },
    "auth": {
      "port": 3002,
      "path": "services/auth",
      "server": "ubuntu@auth-dedicated.com",
      "instances": 4
    },
    "notification": {
      "port": 3003,
      "path": "services/notification"
    }
  }
}
```

**Result**:
- `account` → `ubuntu@account-dedicated.com`
- `auth` → `ubuntu@auth-dedicated.com`
- `notification` → `ubuntu@default-server.com` (fallback)

**Perfect for:**
- Isolating critical services (auth, payments)
- Dedicated resources for high-traffic services
- Geographic distribution
- Security/compliance requirements

### Configuration Schema

#### Root Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | ✅ | Application name |
| `runtime` | `'nodejs' \| 'python' \| 'go' \| 'ruby' \| 'rust' \| 'docker'` | ✅ | Runtime (only nodejs supported currently) |
| `version` | `string` | ✅ | Runtime version |
| `environments` | `object` | ✅ | Environment configurations |
| `build` | `object` | ❌ | Build configuration |
| `start` | `object` | ✅ | Start configuration |
| `health` | `object` | ❌ | Health check configuration |
| `env` | `object` | ❌ | Environment variable requirements |
| `sync` | `object` | ❌ | File sync configuration |
| `backup` | `object` | ❌ | Backup retention configuration |
| `services` | `object` | ❌ | Multi-service configuration (monorepo) |

#### Environment Configuration

```typescript
{
  server: string;              // SSH connection (user@host)
  port: number;                // Service port
  instances: number | 'max';   // PM2 instances (default: 1)
  domain?: string;             // Domain name
  sslEmail?: string;           // Email for SSL certificate
}
```

#### Service Configuration (Monorepo)

```typescript
{
  port: number;                // Service port (required)
  path: string;                // Path in monorepo (required)
  domain?: string;             // Custom domain
  server?: string;             // Override environment server
  instances?: number | 'max';  // Override PM2 instances
}
```

---

## Commands Reference

### Initialize

```bash
hostfn init
```

Interactive setup that:
- Detects your project runtime
- Prompts for configuration
- Creates `hostfn.config.json`

### Server Management

```bash
# Setup a new server
hostfn server setup ubuntu@your-server.com [options]
  --env <environment>        Environment name (default: production)
  --node-version <version>   Node.js version (default: 18)
  --port <port>              Service port (default: 3000)
  --redis                    Install Redis
  --password <password>      SSH password (if not using key auth)

# View server information
hostfn server info ubuntu@your-server.com
```

### Deployment

```bash
# Deploy to an environment
hostfn deploy [environment] [options]
  [environment]              Environment to deploy to (default: production)
  --host <host>              Override server host
  --ci                       CI/CD mode (non-interactive)
  --dry-run                  Show what would be deployed
  --service <name>           Deploy specific service (monorepo)
  --all                      Deploy all services (monorepo)

# Examples
hostfn deploy production
hostfn deploy staging --dry-run
hostfn deploy prod --ci
hostfn deploy production --service account
hostfn deploy production --all
hostfn deploy production --local --ci  # Self-hosted runner
```

### Monitoring

```bash
# View application status
hostfn status [environment] [options]
  [environment]              Environment (default: production)
  --service <name>           Show specific service status (monorepo)

# View logs
hostfn logs [environment] [options]
  [environment]              Environment (default: production)
  --lines <n>                Number of lines (default: 100)
  --errors                   Show only errors
  --output <file>            Save logs to file
  --service <name>           View specific service logs (monorepo)

# Examples
hostfn status production
hostfn status prod --service account
hostfn logs production --lines 500
hostfn logs prod --service auth --errors
hostfn logs production --output debug.log
```

### Rollback

```bash
# Rollback to previous deployment
hostfn rollback [environment] [options]
  [environment]              Environment (default: production)
  --to <timestamp>           Rollback to specific backup

# Examples
hostfn rollback production          # Interactive selection
hostfn rollback prod --to 20240115-120000
```

### Environment Variables

```bash
# List environment variables (masked)
hostfn env list <environment>

# Set a variable
hostfn env set <environment> <key> <value>

# Upload .env file
hostfn env push <environment> <file>

# Download .env file
hostfn env pull <environment> <file>

# Validate required variables
hostfn env validate <environment>

# Examples
hostfn env list production
hostfn env set prod DATABASE_URL "postgresql://..."
hostfn env push production .env.production
hostfn env pull production .env.backup
hostfn env validate production
```

---

## CI/CD Integration

### GitHub Actions

#### Remote Deployment (Standard CI/CD)

For deploying from GitHub Actions to a remote server:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install hostfn
        run: npm install -g hostfn
      
      - name: Deploy
        env:
          HOSTFN_SSH_KEY: ${{ secrets.HOSTFN_SSH_KEY }}
          HOSTFN_SSH_PASSPHRASE: ${{ secrets.HOSTFN_SSH_PASSPHRASE }}
        run: hostfn deploy production --ci
```

**Setup GitHub Secrets:**

1. Generate base64-encoded SSH key:
   ```bash
   cat ~/.ssh/your_key | base64
   ```

2. Add to GitHub repository secrets:
   - `HOSTFN_SSH_KEY`: Base64-encoded private key
   - `HOSTFN_SSH_PASSPHRASE`: SSH key passphrase (if any)

#### Self-Hosted Runner (Local Deployment)

For deploying on a self-hosted GitHub Actions runner running on your deployment server:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: self-hosted
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy locally
        run: hostfn deploy production --local --ci
```

**Why `--local` mode?**
- No SSH needed (already on the server)
- Faster deployment (no network transfer)
- Uses local file operations instead of rsync
- Perfect for self-hosted runners

### Environment Variables

**For CI/CD:**
- `HOSTFN_SSH_KEY`: Base64-encoded SSH private key
- `HOSTFN_SSH_PASSPHRASE`: SSH key passphrase (optional)
- `HOSTFN_HOST`: Override server host

**In GitHub Actions, these are set automatically from secrets:**
```yaml
env:
  HOSTFN_SSH_KEY: ${{ secrets.HOSTFN_SSH_KEY }}
  HOSTFN_SSH_PASSPHRASE: ${{ secrets.HOSTFN_SSH_PASSPHRASE }}
```

**For local testing or other CI platforms:**
```bash
# Encode SSH key for GitHub secrets
cat ~/.ssh/id_rsa | base64

# Then add to GitHub secrets via repository settings
```

### Other CI/CD Platforms

**GitLab CI:**
```yaml
deploy:
  stage: deploy
  script:
    - npm install -g hostfn
    - hostfn deploy production --ci
  variables:
    HOSTFN_SSH_KEY: $CI_SSH_KEY
    HOSTFN_SSH_PASSPHRASE: $CI_SSH_PASSPHRASE
  only:
    - main
```

**CircleCI:**
```yaml
deploy:
  docker:
    - image: node:20
  steps:
    - checkout
    - run: npm install -g hostfn
    - run: hostfn deploy production --ci
  environment:
    HOSTFN_SSH_KEY: $HOSTFN_SSH_KEY
    HOSTFN_SSH_PASSPHRASE: $HOSTFN_SSH_PASSPHRASE
```

---

## Deployment Strategies

### Single Application

Perfect for:
- Simple APIs or web apps
- Monolithic applications
- Single-service projects

```json
{
  "name": "my-api",
  "runtime": "nodejs",
  "version": "18",
  "environments": {
    "production": {
      "server": "ubuntu@prod.com",
      "port": 3000,
      "instances": "max"
    }
  }
}
```

### Monorepo: All Services on Same Server

Perfect for:
- Development/staging environments
- Small to medium applications
- Cost-effective deployments
- Services that don't need isolation

```json
{
  "environments": {
    "production": {
      "server": "ubuntu@shared.com"
    }
  },
  "services": {
    "api": { "port": 3001, "path": "services/api" },
    "worker": { "port": 3002, "path": "services/worker" },
    "admin": { "port": 3003, "path": "services/admin" }
  }
}
```

**Deployment:**
```bash
hostfn deploy production              # Deploys all 3 services
hostfn deploy production --service api # Deploys just api
```

### Monorepo: Services on Different Servers

Perfect for:
- Production environments
- High-traffic services needing dedicated resources
- Critical service isolation (auth, payments)
- Geographic distribution
- Security/compliance requirements

```json
{
  "environments": {
    "production": {
      "server": "ubuntu@default.com"
    }
  },
  "services": {
    "api": {
      "port": 3001,
      "path": "services/api",
      "instances": "max"
    },
    "auth": {
      "port": 3002,
      "path": "services/auth",
      "server": "ubuntu@auth-dedicated.com",
      "instances": 4
    },
    "payment": {
      "port": 3003,
      "path": "services/payment",
      "server": "ubuntu@pci-compliant.com",
      "instances": 2
    }
  }
}
```

**Result:**
- `api` → `ubuntu@default.com` (shared server)
- `auth` → `ubuntu@auth-dedicated.com` (dedicated)
- `payment` → `ubuntu@pci-compliant.com` (isolated for compliance)

### Hybrid Approach

Mix shared and dedicated servers based on needs:

```json
{
  "services": {
    "public-api": {
      "port": 3001,
      "path": "services/api",
      "server": "ubuntu@public-edge.com",
      "instances": "max"
    },
    "internal-api": {
      "port": 3002,
      "path": "services/internal"
    },
    "worker": {
      "port": 3003,
      "path": "services/worker",
      "instances": 2
    }
  }
}
```

---

## Advanced Topics

### Deployment Flow

1. **Pre-flight Checks**
   - Verify rsync availability
   - Connect to server via SSH
   - Check/create remote directory
   - Acquire deployment lock

2. **File Sync**
   - Sync files with rsync (respects `.exclude` patterns)
   - Fast incremental transfers

3. **Remote Build**
   - Install dependencies (`npm ci --production`)
   - Run build command if specified
   - Build output in configured directory

4. **Backup**
   - Create timestamped backup of current deployment
   - Keep N most recent backups (configurable)

5. **PM2 Deployment**
   - Generate PM2 ecosystem config
   - Start new process or reload existing (zero-downtime)
   - Save PM2 configuration

6. **Health Check**
   - Poll health endpoint with retries
   - Configurable timeout and interval
   - Fail deployment if unhealthy

7. **Auto-Rollback** (on failure)
   - Restore previous deployment from backup
   - Reload PM2 with old version
   - Report rollback status

### Directory Structure on Server

Single application:
```
/var/www/
  └── my-app-production/
      ├── .env
      ├── package.json
      ├── node_modules/
      ├── dist/
      └── ecosystem.config.cjs
```

Monorepo (multi-service):
```
/var/www/
  ├── my-monorepo-account-production/
  │   ├── .env
  │   ├── package.json
  │   ├── node_modules/
  │   └── dist/
  ├── my-monorepo-auth-production/
  │   ├── .env
  │   ├── package.json
  │   ├── node_modules/
  │   └── dist/
  └── my-monorepo-notification-production/
      ├── .env
      ├── package.json
      ├── node_modules/
      └── dist/
```

### Service Naming Convention

- **Single app**: `{name}-{environment}`
  - Example: `my-app-production`

- **Monorepo**: `{name}-{serviceName}-{environment}`
  - Example: `21n-account-production`

### Health Check Implementation

Your application should expose a health endpoint:

```javascript
// Express example
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Fastify example
fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
});
```

Configure in `hostfn.config.json`:
```json
{
  "health": {
    "path": "/health",
    "timeout": 60,
    "retries": 10,
    "interval": 3
  }
}
```

### Environment Variables

hostfn automatically loads environment variables from a `.env` file on your server. The PM2 process manager is configured to read from `.env` in the deployment directory.

#### Option 1: Push .env file (Recommended)
```bash
hostfn env push production .env.production
```

This uploads your local `.env` file to the server. After deployment, PM2 will automatically load these variables.

#### Option 2: Set individual variables
```bash
hostfn env set production DATABASE_URL "postgresql://..."
hostfn env set production REDIS_URL "redis://..."
```

Note: After setting variables, redeploy to reload the PM2 process with updated env vars.

#### Option 3: Validate requirements
```json
{
  "env": {
    "required": ["DATABASE_URL", "API_KEY"],
    "optional": ["REDIS_URL", "LOG_LEVEL"]
  }
}
```

```bash
hostfn env validate production
```

### CI/CD Integration

```yaml
# GitHub Actions example
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install hostfn
        run: npm install -g hostfn
      
      - name: Setup SSH Key
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/id_rsa
          chmod 600 ~/.ssh/id_rsa
      
      - name: Deploy to Production
        run: hostfn deploy production --ci
        env:
          HOSTFN_HOST: ${{ secrets.PRODUCTION_HOST }}
```

For monorepo, deploy only changed services:
```yaml
- name: Deploy Changed Services
  run: |
    if [[ $(git diff --name-only HEAD~1 | grep '^services/account/') ]]; then
      hostfn deploy production --ci --service account
    fi
    if [[ $(git diff --name-only HEAD~1 | grep '^services/auth/') ]]; then
      hostfn deploy production --ci --service auth
    fi
```

---

## 📚 Examples

### Example 1: Simple Express API

```json
{
  "name": "express-api",
  "runtime": "nodejs",
  "version": "18",
  "environments": {
    "production": {
      "server": "ubuntu@api.example.com",
      "port": 3000,
      "instances": "max"
    }
  },
  "build": {
    "command": "npm run build",
    "directory": "dist"
  },
  "start": {
    "command": "npm start",
    "entry": "dist/server.js"
  }
}
```

### Example 2: Microservices Monorepo

```json
{
  "name": "21n",
  "runtime": "nodejs",
  "version": "18",
  "environments": {
    "production": {
      "server": "ubuntu@shared.21n.com",
      "port": 3000,
      "instances": "max"
    }
  },
  "build": {
    "command": "npm run build",
    "directory": "dist"
  },
  "start": {
    "command": "npm start"
  },
  "services": {
    "account": {
      "port": 3001,
      "path": "services/account",
      "domain": "account.21n.com",
      "instances": "max"
    },
    "auth": {
      "port": 3002,
      "path": "services/auth",
      "domain": "auth.21n.com",
      "server": "ubuntu@auth.21n.com",
      "instances": 4
    },
    "notification": {
      "port": 3003,
      "path": "services/notification",
      "domain": "notification.21n.com",
      "instances": 2
    },
    "analytics": {
      "port": 3004,
      "path": "services/analytics",
      "instances": 1
    }
  },
  "health": {
    "path": "/health",
    "timeout": 60,
    "retries": 10,
    "interval": 3
  }
}
```

See `examples/` directory for more complete examples.

---

## Architecture

```
hostfn/
├── packages/
│   └── cli/                    # Main CLI package
│       ├── src/
│       │   ├── commands/       # Command implementations
│       │   │   ├── deploy.ts   # Deployment engine
│       │   │   ├── status.ts   # Status monitoring
│       │   │   ├── logs.ts     # Log streaming
│       │   │   ├── rollback.ts # Rollback system
│       │   │   ├── env.ts      # Environment variables
│       │   │   ├── init.ts     # Project initialization
│       │   │   └── server/     # Server management
│       │   ├── config/         # Config schema & loader
│       │   │   ├── schema.ts   # Zod schema
│       │   │   └── loader.ts   # Config loading
│       │   ├── runtimes/       # Runtime adapters
│       │   │   ├── base.ts     # Base adapter interface
│       │   │   ├── registry.ts # Runtime registry
│       │   │   └── nodejs/     # Node.js adapter (PM2)
│       │   ├── core/           # Core business logic
│       │   │   ├── ssh.ts      # SSH connection manager
│       │   │   ├── sync.ts     # File sync (rsync)
│       │   │   ├── health.ts   # Health checking
│       │   │   ├── backup.ts   # Backup management
│       │   │   └── lock.ts     # Deployment locking
│       │   └── utils/          # Utilities
│       │       ├── logger.ts   # Pretty logging
│       │       └── validation.ts
│       └── package.json
├── examples/                   # Example configurations
│   ├── monorepo-config.json
│   └── monorepo-multi-server-config.json
├── _conduct/
│   ├── specs/                  # Project specifications
│   └── .meta/                  # Additional documentation
│       ├── MONOREPO_GUIDE.md
│       ├── QUICK_START_MONOREPO.md
│       ├── CHANGELOG_MONOREPO.md
│       └── MULTI_SERVER_SUMMARY.md
└── README.md
```

### Design Principles

1. **Pluggable Runtime System**
   - Base adapter interface
   - Runtime-specific implementations
   - Easy to add new languages

2. **Type Safety**
   - Zod for runtime validation
   - TypeScript for compile-time safety
   - Schema-driven configuration

3. **Production Ready**
   - Health checks
   - Auto-rollback on failure
   - Zero-downtime deployments
   - Deployment locking

4. **Developer Experience**
   - Interactive CLI
   - Smart defaults
   - Clear error messages
   - Dry-run mode

---

## Development

```bash
# Clone and setup
git clone <repo>
cd hostfn
npm install

# Build
npm run build

# Watch mode (development)
npm run dev

# Lint
npm run lint

# Test
npm run test

# Link for local testing
cd packages/cli
npm link

# Use globally
hostfn --help
```

### Project Structure

- **Monorepo**: Managed with Turborepo
- **TypeScript**: Strict mode enabled
- **Package Manager**: npm
- **Node Version**: >=18.0.0

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

---
### Roadmap
- Additional runtime adapters (Python, Go, Ruby, Rust)
- Parallel service deployments
- Service dependency graphs
- Web dashboard
- Metrics collection
- CI/CD templates
---

## License

MIT



