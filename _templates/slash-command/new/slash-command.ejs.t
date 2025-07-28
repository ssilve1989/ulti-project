---
to: src/slash-commands/<%=name%>/<%=name%>.slash-command.ts
---
import { SlashCommandBuilder } from 'discord.js';

export const <%= h.changeCase.pascal(name) %>SlashCommand = new SlashCommandBuilder()
  .setName('<%=name%>')
  .setDescription('TODO: Add description');
