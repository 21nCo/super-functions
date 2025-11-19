import { Hono } from 'hono';
import {
  verifyDiscordRequest,
  InteractionType,
  InteractionResponseType,
  getInteractionOption,
  updateInteractionResponse,
} from '@botfn/discord-core';
import { githubRequest, type GitHubClientConfig } from '@botfn/github-integration';
import {
  linearRequest,
  getTeams,
  searchIssues,
  createIssue as createLinearIssue,
  createComment as createLinearComment,
  type LinearClientConfig,
} from '@botfn/linear-integration';
import {
  LinkCommandOptionsSchema,
  CreateCommandOptionsSchema,
  LinkLinearCommandOptionsSchema,
  CreateLinearCommandOptionsSchema,
  type DiscordBotEnv,
  type GitHubBotEnv,
  type LinearBotEnv,
} from '@botfn/shared-types';
import { createPersistenceClient } from '@botfn/persistence-service/src/client';

export interface BotEnv extends DiscordBotEnv, GitHubBotEnv, LinearBotEnv {
  PERSISTENCE_SERVICE_URL: string;
}

/**
 * Handle /link command
 */
async function handleLinkCommand(interaction: any, env: BotEnv) {
  const {options} = interaction.data;

  // Validate options
  const parsed = LinkCommandOptionsSchema.safeParse({
    repository: getInteractionOption(options, 'repository'),
    search: getInteractionOption(options, 'search'),
  });

  if (!parsed.success) {
    return { content: '❌ Invalid command options' };
  }

  const { repository, search } = parsed.data;
  const { guild_id, channel_id } = interaction;

  const githubConfig: GitHubClientConfig = {
    appId: env.GITHUB_APP_ID,
    installationId: env.GITHUB_INSTALLATION_ID,
    privateKey: env.GITHUB_PRIVATE_KEY,
  };

  // Get the specific issue
  const issue = await githubRequest(
    `/repos/${repository}/issues/${search}`,
    githubConfig
  );

  const discordUrl = `https://discord.com/channels/${guild_id}/${channel_id}`;

  // Add comment to issue
  await githubRequest(
    `/repos/${repository}/issues/${issue.number}/comments`,
    githubConfig,
    {
      method: 'POST',
      body: JSON.stringify({
        body: `🔗 Linked to Discord thread: ${discordUrl}`,
      }),
      headers: { 'Content-Type': 'application/json' },
    }
  );

  // Persist to database
  const persistenceClient = createPersistenceClient(env.PERSISTENCE_SERVICE_URL);
  const githubIssueId = `${repository}#${issue.number}`;
  
  try {
    // Check if issue already exists
    const existingIssue = await persistenceClient.getIssueByGithubId.query({ githubIssueId });
    
    if (existingIssue) {
      // Add this discord thread to existing issue
      await persistenceClient.addDiscordThread.mutate({
        issueId: existingIssue.id,
        guildId: guild_id,
        channelId: channel_id,
      });
    } else {
      // Create new issue with this discord thread
      await persistenceClient.createIssue.mutate({
        githubIssueId,
        guildId: guild_id,
        channelId: channel_id,
        status: 'Backlog',
      });
    }
  } catch (error) {
    console.error('Failed to persist issue:', error);
    // Don't fail the command if persistence fails
  }

  return {
    content: `✅ GitHub issue linked: [#${issue.number} ${issue.title}](${issue.html_url})\\nDiscord thread link added to the issue.`,
  };
}

/**
 * Handle /create command
 */
async function handleCreateCommand(interaction: any, env: BotEnv) {
  const {options} = interaction.data;

  // Validate options
  const parsed = CreateCommandOptionsSchema.safeParse({
    repository: getInteractionOption(options, 'repository'),
    title: getInteractionOption(options, 'title'),
    description: getInteractionOption(options, 'description'),
  });

  if (!parsed.success) {
    return { content: '❌ Invalid command options' };
  }

  const { repository, title, description = '' } = parsed.data;
  const { guild_id, channel_id } = interaction;

  const githubConfig: GitHubClientConfig = {
    appId: env.GITHUB_APP_ID,
    installationId: env.GITHUB_INSTALLATION_ID,
    privateKey: env.GITHUB_PRIVATE_KEY,
  };

  const discordUrl = `https://discord.com/channels/${guild_id}/${channel_id}`;
  const body = `${description}\\n\\n---\\n🔗 Created from Discord: ${discordUrl}`;

  // Create issue
  const issue = await githubRequest(
    `/repos/${repository}/issues`,
    githubConfig,
    {
      method: 'POST',
      body: JSON.stringify({ title, body }),
      headers: { 'Content-Type': 'application/json' },
    }
  );

  // Persist to database
  const persistenceClient = createPersistenceClient(env.PERSISTENCE_SERVICE_URL);
  const githubIssueId = `${repository}#${issue.number}`;
  
  try {
    await persistenceClient.createIssue.mutate({
      githubIssueId,
      guildId: guild_id,
      channelId: channel_id,
      status: 'Backlog',
    });
  } catch (error) {
    console.error('Failed to persist issue:', error);
    // Don't fail the command if persistence fails
  }

  return {
    content: `✅ GitHub issue created: [#${issue.number} ${issue.title}](${issue.html_url})`,
  };
}

/**
 * Handle /link-linear-issue command
 */
async function handleLinkLinearCommand(interaction: any, env: BotEnv) {
  const {options} = interaction.data;

  // Validate options
  const parsed = LinkLinearCommandOptionsSchema.safeParse({
    team: getInteractionOption(options, 'team'),
    search: getInteractionOption(options, 'search'),
  });

  if (!parsed.success) {
    return { content: '❌ Invalid command options' };
  }

  const { team: teamId, search: issueId } = parsed.data;
  const { guild_id, channel_id } = interaction;

  const linearConfig: LinearClientConfig = {
    apiKey: env.LINEAR_API_KEY,
  };

  // Get the specific issue by ID
  const query = `
    query($issueId: String!) {
      issue(id: $issueId) {
        id
        identifier
        title
        url
      }
    }
  `;

  const result = await linearRequest<{
    issue: { id: string; identifier: string; title: string; url: string };
  }>(query, linearConfig, { issueId });

  const {issue} = result;
  const discordUrl = `https://discord.com/channels/${guild_id}/${channel_id}`;

  // Add comment to Linear issue
  await createLinearComment(
    linearConfig,
    issue.id,
    `🔗 Linked to Discord thread: ${discordUrl}`
  );

  // Persist to database
  const persistenceClient = createPersistenceClient(env.PERSISTENCE_SERVICE_URL);
  const linearIssueId = issue.id;
  
  try {
    // Check if issue already exists
    const existingIssue = await persistenceClient.getIssueByLinearId.query({ linearIssueId });
    
    if (existingIssue) {
      // Add this discord thread to existing issue
      await persistenceClient.addDiscordThread.mutate({
        issueId: existingIssue.id,
        guildId: guild_id,
        channelId: channel_id,
      });
    } else {
      // Create new issue with this discord thread
      await persistenceClient.createIssue.mutate({
        linearIssueId,
        guildId: guild_id,
        channelId: channel_id,
        status: 'Backlog',
      });
    }
  } catch (error) {
    console.error('Failed to persist issue:', error);
    // Don't fail the command if persistence fails
  }

  return {
    content: `✅ Linear issue linked: [${issue.identifier} ${issue.title}](${issue.url})\\nDiscord thread link added to the issue.`,
  };
}

/**
 * Handle /create-linear-issue command
 */
async function handleCreateLinearCommand(interaction: any, env: BotEnv) {
  const {options} = interaction.data;

  // Validate options
  const parsed = CreateLinearCommandOptionsSchema.safeParse({
    team: getInteractionOption(options, 'team'),
    title: getInteractionOption(options, 'title'),
    description: getInteractionOption(options, 'description'),
  });

  if (!parsed.success) {
    return { content: '❌ Invalid command options' };
  }

  const { team: teamId, title, description = '' } = parsed.data;
  const { guild_id, channel_id } = interaction;

  const linearConfig: LinearClientConfig = {
    apiKey: env.LINEAR_API_KEY,
  };

  const discordUrl = `https://discord.com/channels/${guild_id}/${channel_id}`;
  const finalDescription = description
    ? `${description}\n\n---\n🔗 Created from Discord: ${discordUrl}`
    : `🔗 Created from Discord: ${discordUrl}`;

  // Create issue
  const issue = await createLinearIssue(
    linearConfig,
    teamId,
    title,
    finalDescription
  );

  // Persist to database
  const persistenceClient = createPersistenceClient(env.PERSISTENCE_SERVICE_URL);
  const linearIssueId = issue.id;
  
  try {
    await persistenceClient.createIssue.mutate({
      linearIssueId,
      guildId: guild_id,
      channelId: channel_id,
      status: 'Backlog',
    });
  } catch (error) {
    console.error('Failed to persist issue:', error);
    // Don't fail the command if persistence fails
  }

  return {
    content: `✅ Linear issue created: [${issue.identifier} ${issue.title}](${issue.url})`,
  };
}

/**
 * Handle autocomplete for repository option
 */
async function handleRepositoryAutocomplete(env: BotEnv, query: string) {
  try {
    const githubConfig: GitHubClientConfig = {
      appId: env.GITHUB_APP_ID,
      installationId: env.GITHUB_INSTALLATION_ID,
      privateKey: env.GITHUB_PRIVATE_KEY,
    };

    const response = await githubRequest<{ repositories: Array<{ full_name: string }> }>(
      `/installation/repositories?per_page=100`,
      githubConfig
    );

    const repositories = response.repositories || [];

    const choices = repositories
      .filter((repo) => repo.full_name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 25)
      .map((repo) => ({
        name: repo.full_name,
        value: repo.full_name,
      }));

    return { choices };
  } catch (error) {
    console.error('Repository autocomplete error:', error);
    return { choices: [] };
  }
}

/**
 * Handle autocomplete for issue search
 */
async function handleIssueAutocomplete(
  env: BotEnv,
  query: string,
  repository: string
) {
  if (!repository) {
    return { choices: [] };
  }

  try {
    const githubConfig: GitHubClientConfig = {
      appId: env.GITHUB_APP_ID,
      installationId: env.GITHUB_INSTALLATION_ID,
      privateKey: env.GITHUB_PRIVATE_KEY,
    };

    const issues = await githubRequest<Array<{ number: number; title: string; body: string | null }>>(
      `/repos/${repository}/issues?state=all&per_page=25`,
      githubConfig
    );

    const choices = issues
      .filter((issue) => {
        const title = (issue.title || '').toLowerCase();
        const body = (issue.body || '').toLowerCase();
        return title.includes(query.toLowerCase()) || body.includes(query.toLowerCase());
      })
      .slice(0, 25)
      .map((issue) => ({
        name: `#${issue.number}: ${issue.title}`.substring(0, 100),
        value: issue.number.toString(),
      }));

    return { choices };
  } catch (error) {
    console.error('Issue autocomplete error:', error);
    return { choices: [] };
  }
}

/**
 * Handle autocomplete for Linear team option
 */
async function handleLinearTeamAutocomplete(env: BotEnv, query: string) {
  try {
    const linearConfig: LinearClientConfig = {
      apiKey: env.LINEAR_API_KEY,
    };

    const teams = await getTeams(linearConfig);

    const choices = teams
      .filter((team) =>
        team.name.toLowerCase().includes(query.toLowerCase()) ||
        team.key.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, 25)
      .map((team) => ({
        name: `${team.name} (${team.key})`,
        value: team.id,
      }));

    return { choices };
  } catch (error) {
    console.error('Linear team autocomplete error:', error);
    return { choices: [] };
  }
}

/**
 * Handle autocomplete for Linear issue search
 */
async function handleLinearIssueAutocomplete(
  env: BotEnv,
  query: string,
  teamId: string
) {
  if (!teamId) {
    return { choices: [] };
  }

  try {
    const linearConfig: LinearClientConfig = {
      apiKey: env.LINEAR_API_KEY,
    };

    const issues = await searchIssues(linearConfig, teamId, query);

    const choices = issues
      .slice(0, 25)
      .map((issue) => ({
        name: `${issue.identifier}: ${issue.title}`.substring(0, 100),
        value: issue.id,
      }));

    return { choices };
  } catch (error) {
    console.error('Linear issue autocomplete error:', error);
    return { choices: [] };
  }
}

/**
 * Create the bot app
 */
export function createBotApp() {
  const app = new Hono<{ Bindings: BotEnv }>();

  app.post('/interactions', async (c) => {
    const {env} = c;

    // Verify request
    const { isValid, body } = await verifyDiscordRequest(
      c.req.raw,
      env.DISCORD_PUBLIC_KEY
    );

    if (!isValid) {
      return c.text('Invalid request signature', 401);
    }

    const interaction = body;

    // Handle PING
    if (interaction.type === InteractionType.PING) {
      return c.json({ type: InteractionResponseType.PONG });
    }

    // Handle autocomplete
    if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
      const commandName = interaction.data.name;
      const focusedOption = interaction.data.options?.find((opt: any) => opt.focused);

      // Repository autocomplete for GitHub commands
      if (
        (commandName === 'link-github-issue' || commandName === 'create-github-issue') &&
        focusedOption?.name === 'repository'
      ) {
        const result = await handleRepositoryAutocomplete(env, focusedOption.value);
        return c.json({
          type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
          data: result,
        });
      }

      // Issue search autocomplete for GitHub link command
      if (commandName === 'link-github-issue' && focusedOption?.name === 'search') {
        const repositoryOption = interaction.data.options?.find(
          (opt: any) => opt.name === 'repository'
        );
        const result = await handleIssueAutocomplete(
          env,
          focusedOption.value,
          repositoryOption?.value || ''
        );
        return c.json({
          type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
          data: result,
        });
      }

      // Team autocomplete for Linear commands
      if (
        (commandName === 'link-linear-issue' || commandName === 'create-linear-issue') &&
        focusedOption?.name === 'team'
      ) {
        const result = await handleLinearTeamAutocomplete(env, focusedOption.value);
        return c.json({
          type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
          data: result,
        });
      }

      // Issue search autocomplete for Linear link command
      if (commandName === 'link-linear-issue' && focusedOption?.name === 'search') {
        const teamOption = interaction.data.options?.find(
          (opt: any) => opt.name === 'team'
        );
        const result = await handleLinearIssueAutocomplete(
          env,
          focusedOption.value,
          teamOption?.value || ''
        );
        return c.json({
          type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
          data: result,
        });
      }

      return c.json({
        type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
        data: { choices: [] },
      });
    }

    // Handle commands
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      // Immediately acknowledge
      c.executionCtx.waitUntil(
        (async () => {
          try {
            let result;

            if (interaction.data.name === 'link-github-issue') {
              result = await handleLinkCommand(interaction, env);
            } else if (interaction.data.name === 'create-github-issue') {
              result = await handleCreateCommand(interaction, env);
            } else if (interaction.data.name === 'link-linear-issue') {
              result = await handleLinkLinearCommand(interaction, env);
            } else if (interaction.data.name === 'create-linear-issue') {
              result = await handleCreateLinearCommand(interaction, env);
            } else {
              result = { content: '❌ Unknown command' };
            }

            await updateInteractionResponse(
              env.DISCORD_CLIENT_ID,
              interaction.token!,
              result.content
            );
          } catch (error: any) {
            console.error('Command error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            await updateInteractionResponse(
              env.DISCORD_CLIENT_ID,
              interaction.token!,
              `❌ Error: ${errorMessage}`
            );
          }
        })()
      );

      return c.json({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      });
    }

    return c.text('Unknown interaction type', 400);
  });

  return app;
}
