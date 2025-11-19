# Discord Bot

Discord slash commands for integrating GitHub and Linear with Discord threads, deployed on Cloudflare Workers.

## Features

### GitHub Integration
- `/link-github-issue` - Select a repository, search and link GitHub issues to Discord threads
- `/create-github-issue` - Select a repository and create new GitHub issues from Discord

### Linear Integration
- `/link-linear-issue` - Select a team, search and link Linear issues to Discord threads
- `/create-linear-issue` - Select a team and create new Linear issues from Discord

## Setup

### 1. Discord Application Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Copy the **Application ID** and **Public Key** (from General Information)
4. Go to "Bot" section and create a bot
5. Copy the **Bot Token**
6. Note: You'll set the **Interactions Endpoint URL** after deploying to Cloudflare

### 2. Register Discord Commands

1. Install dependencies:
```bash
npm install
```

2. Set up `.env` file for command registration:
```bash
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_application_id
```

3. Register commands globally:
```bash
npm run register-commands
```

### 3. GitHub App Setup

1. Create a GitHub App:
   - Go to https://github.com/settings/apps (or your org settings)
   - Click "New GitHub App"
   - Fill in:
     - **Name**: "Discord Integration Bot"
     - **Homepage URL**: Your worker URL (can update later)
     - **Webhook**: Uncheck "Active"
     - **Repository permissions**:
       - **Issues**: Read & Write
       - **Metadata**: Read-only (auto-selected)
   - Click "Create GitHub App"

2. Get credentials:
   - Note the **App ID**
   - Generate and download a **Private Key** (`.pem` file)
   - Go to "Install App" and install it on your account/org
   - Select all repositories you want the bot to access
   - Get the **Installation ID** from the URL: `https://github.com/settings/installations/{installation_id}`

3. Prepare the private key:
   ```bash
   # Convert the .pem file to a single-line string
   cat your-app-name.2025-10-25.private-key.pem | tr '\n' ' '
   ```

### 4. Linear Setup (Optional)

1. Get your Linear API key:
   - Go to https://linear.app/settings/api
   - Create a new Personal API Key
   - Copy the API key (starts with `lin_api_`)

2. The bot will automatically discover all teams you have access to via autocomplete

### 5. Deploy to Cloudflare Workers

1. Set up required secrets:
```bash
echo "your_discord_public_key" | wrangler secret put DISCORD_PUBLIC_KEY
echo "your_discord_client_id" | wrangler secret put DISCORD_CLIENT_ID
echo "your_github_app_id" | wrangler secret put GITHUB_APP_ID
echo "your_github_installation_id" | wrangler secret put GITHUB_INSTALLATION_ID
# Paste the single-line private key when prompted:
wrangler secret put GITHUB_PRIVATE_KEY
# For Linear integration:
echo "your_linear_api_key" | wrangler secret put LINEAR_API_KEY
```

2. Deploy to Cloudflare:
```bash
npm run deploy
```

3. Copy your worker URL (e.g., `https://discord-bot.your-subdomain.workers.dev`)

### 6. Configure Discord Interactions Endpoint

1. Go back to Discord Developer Portal > Your App > General Information
2. Set **Interactions Endpoint URL** to: `https://your-worker-url.workers.dev/interactions`
3. Discord will send a PING request to verify the endpoint

## Usage

### GitHub Commands

#### `/link-github-issue`

1. Select a repository from the autocomplete dropdown
2. Search for issues with autocomplete
3. Select an issue to link to the current Discord thread

Example: Type `/link-github-issue`, select a repo, then search for an issue

#### `/create-github-issue`

1. Select a repository from the autocomplete dropdown
2. Provide a title (required) and description (optional)
3. Creates a new GitHub issue with the Discord thread link

Example: `/create-github-issue` → select repo → title: "Fix login button" → description: "The login button is not responsive on mobile"

### Linear Commands

#### `/link-linear-issue`

1. Select a team from the autocomplete dropdown
2. Search for issues with autocomplete
3. Select an issue to link to the current Discord thread

Example: Type `/link-linear-issue`, select a team, then search for an issue

#### `/create-linear-issue`

1. Select a team from the autocomplete dropdown
2. Provide a title (required) and description (optional)
3. Creates a new Linear issue with the Discord thread link

Example: `/create-linear-issue` → select team → title: "Fix login button" → description: "The login button is not responsive on mobile"

## Architecture

- Discord sends slash command interactions to Cloudflare Worker
- Worker verifies the request signature using Discord's public key
- Worker processes commands and interacts with GitHub/Linear APIs
- Responses are sent back to Discord via interaction webhooks
- Modular command handlers for easy extension

## Development

Run locally:
```bash
npm run dev
```

Use a tool like [ngrok](https://ngrok.com/) to expose your local server for Discord webhook testing.

## Notes

- Commands are registered globally and take up to 1 hour to propagate
- Worker uses Discord's interaction webhook tokens for deferred responses
- Uses GitHub App authentication (more secure than personal access tokens)
- All secrets are stored in Cloudflare Workers environment
- GitHub App tokens are generated on-demand and expire after 1 hour
- Repository selection is dynamic - the bot can access any repository the GitHub App is installed on
- Linear team selection is dynamic - the bot can access any team your API key has access to
- Linear integration is optional - GitHub commands work independently
- Make sure to install the GitHub App on all repositories you want to access from Discord
