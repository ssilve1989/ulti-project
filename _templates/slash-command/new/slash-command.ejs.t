---
to: src/slash-commands/commands/<%=name%>.ts
---
import { SlashCommandBuilder } from 'discord.js';

export const <%= h.changeCase.pascal(name) %>SlashCommand = new SlashCommandBuilder()
  .setName(<%=name%>)
  .setDescription("");
