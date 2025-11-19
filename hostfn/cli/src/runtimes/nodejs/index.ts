import {
  BaseRuntimeAdapter,
  RuntimeDetectionResult,
  RuntimeConfig,
  SetupOptions,
  ProcessManager,
} from '../base.js';
import { Runtime } from '../../config/schema.js';
import { NodeJSDetector } from './detector.js';
import { PM2Manager } from './pm2.js';

/**
 * Node.js runtime adapter
 */
export class NodeJSAdapter extends BaseRuntimeAdapter {
  readonly name: Runtime = 'nodejs';
  private pm2Manager = new PM2Manager();

  async detect(cwd: string): Promise<RuntimeDetectionResult> {
    return NodeJSDetector.detect(cwd);
  }

  async getDefaultConfig(cwd: string): Promise<Partial<RuntimeConfig>> {
    const pkg = NodeJSDetector.readPackageJson(cwd);
    
    if (!pkg) {
      throw new Error('package.json not found');
    }

    const buildCommand = NodeJSDetector.getBuildCommand(pkg);
    const startCommand = NodeJSDetector.getStartCommand(pkg);

    return {
      name: pkg.name || 'my-app',
      runtime: 'nodejs',
      version: pkg.engines?.node?.match(/\d+/)?.[0] || '18',
      build: buildCommand ? {
        command: buildCommand,
        directory: 'dist',
      } : undefined,
      start: {
        command: startCommand,
        entry: 'dist/index.js',
      },
    };
  }

  generateSetupScript(version: string, options: SetupOptions = {}): string {
    const port = options.port || 3000;
    const env = options.environment || 'production';
    const installRedis = options.installRedis ?? false;

    return `#!/bin/bash
set -e

# Log everything to file
LOG_FILE="/tmp/hostfn-setup.log"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "[$(date)] Starting hostfn setup..."

echo "=========================================="
echo "Node.js Server Setup (hostfn)"
echo "Environment: ${env}"
echo "=========================================="

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VER=$VERSION_ID
    echo "Detected OS: $OS $VER"
fi

# 1. Install Node.js via nvm
echo ""
echo "[1/7] Installing Node.js v${version} via nvm..."
if [ ! -d "$HOME/.nvm" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"
    
    nvm install ${version}
    nvm use ${version}
    nvm alias default ${version}
    echo "Node.js $(node --version) installed"
else
    echo "nvm already installed"
    source "$HOME/.nvm/nvm.sh"
    nvm install ${version}
    nvm use ${version}
fi

# 2. Install PM2
echo ""
echo "[2/7] Installing PM2 process manager..."
npm install -g pm2
pm2 --version

# 3. Install system dependencies
echo ""
echo "[3/7] Installing system dependencies..."
if command -v apt-get &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y nginx certbot python3-certbot-nginx rsync curl git build-essential
elif command -v yum &> /dev/null; then
    sudo yum install -y nginx certbot python3-certbot-nginx rsync git gcc-c++ make
elif command -v dnf &> /dev/null; then
    sudo dnf install -y nginx certbot python3-certbot-nginx rsync curl git gcc-c++ make
fi

# 4. Configure Nginx
echo ""
echo "[4/7] Configuring Nginx..."
if [ -d "/etc/nginx/sites-available" ]; then
    NGINX_CONFIG="/etc/nginx/sites-available/hostfn-${env}"
    sudo tee $NGINX_CONFIG > /dev/null <<'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }
}
EOF
    sudo ln -sf $NGINX_CONFIG /etc/nginx/sites-enabled/hostfn-${env}
elif [ -d "/etc/nginx/conf.d" ]; then
    NGINX_CONFIG="/etc/nginx/conf.d/hostfn-${env}.conf"
    sudo tee $NGINX_CONFIG > /dev/null <<'EOF'
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
fi

sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

${installRedis ? `
# 5. Install Redis (optional)
echo ""
echo "[5/7] Installing Redis..."
if command -v apt-get &> /dev/null; then
    sudo apt-get install -y redis-server
    sudo systemctl enable redis-server
    sudo systemctl start redis-server
elif command -v yum &> /dev/null; then
    sudo yum install -y redis
    sudo systemctl enable redis
    sudo systemctl start redis
fi
` : `
# 5. Skip Redis installation
echo ""
echo "[5/7] Skipping Redis installation..."
`}

# 6. Create deployment directories
echo ""
echo "[6/7] Creating deployment directories..."
sudo mkdir -p /var/www
sudo chown -R $USER:$USER /var/www
mkdir -p /var/log/pm2

# 7. Configure PM2 startup
echo ""
echo "[7/7] Configuring PM2 startup..."
PM2_STARTUP_CMD=$(pm2 startup | grep 'sudo' | tail -n 1)
if [ -n "$PM2_STARTUP_CMD" ]; then
    eval "$PM2_STARTUP_CMD" || echo "PM2 startup configured"
else
    echo "PM2 startup already configured or not needed"
fi
pm2 save

# 8. Firewall setup
echo ""
echo "[8/7] Configuring firewall..."
if command -v ufw &> /dev/null; then
    sudo ufw allow 22/tcp
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw --force enable
fi

echo ""
echo "=========================================="
echo "✅ Server setup complete!"
echo "=========================================="
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"
echo "PM2: $(pm2 --version)"
echo "Nginx: Running"
echo "Port: ${port}"
echo "=========================================="
echo "[$(date)] Setup completed successfully"
echo "Log saved to: $LOG_FILE"
`;
  }

  getProcessManager(): ProcessManager {
    return this.pm2Manager;
  }
}
