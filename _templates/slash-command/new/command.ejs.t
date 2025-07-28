---
to: src/slash-commands/<%=name%>/<%=name%>.command.ts
---
import type { ChatInputCommandInteraction } from 'discord.js';

class <%= h.changeCase.pascal(name) %>Command {
  constructor(public readonly interaction: ChatInputCommandInteraction) {}
}

export { <%= h.changeCase.pascal(name) %>Command };
