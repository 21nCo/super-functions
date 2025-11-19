import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const commands = [
  new SlashCommandBuilder()
    .setName('link-github-issue')
    .setDescription('Search and link a GitHub issue to this Discord thread')
    .addStringOption((option) =>
      option
        .setName('repository')
        .setDescription('Select the GitHub repository')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName('search')
        .setDescription('Search query for GitHub issues')
        .setRequired(true)
        .setAutocomplete(true)
    ),
  new SlashCommandBuilder()
    .setName('create-github-issue')
    .setDescription('Create a new GitHub issue linked to this Discord thread')
    .addStringOption((option) =>
      option
        .setName('repository')
        .setDescription('Select the GitHub repository')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Title of the GitHub issue')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription('Description of the GitHub issue')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('link-linear-issue')
    .setDescription('Search and link a Linear issue to this Discord thread')
    .addStringOption((option) =>
      option
        .setName('team')
        .setDescription('Select the Linear team')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName('search')
        .setDescription('Search query for Linear issues')
        .setRequired(true)
        .setAutocomplete(true)
    ),
  new SlashCommandBuilder()
    .setName('create-linear-issue')
    .setDescription('Create a new Linear issue linked to this Discord thread')
    .addStringOption((option) =>
      option
        .setName('team')
        .setDescription('Select the Linear team')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Title of the Linear issue')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription('Description of the Linear issue')
        .setRequired(false)
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands }
    );

    console.log('✅ Successfully registered application commands.');
  } catch (error) {
    console.error(error);
  }
})();
