import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import { isJob, JOB_NAME } from '@ulti-project/shared';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import type { ISlashCommand } from '../../../slash-command.interface.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';
import { parseEmojiId } from './parse-emoji-id.js';

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'job-emojis' })
class EditJobEmojisCommandHandler implements ISlashCommand {
  constructor(private readonly settingsCollection: SettingsCollection) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const job = interaction.options.getString('job', true);
    if (!isJob(job)) {
      await interaction.editReply(`Unknown job: ${job}`);
      return;
    }

    const input = interaction.options.getString('emoji');
    const emojiId = input === null ? undefined : parseEmojiId(input);
    if (input !== null && emojiId === undefined) {
      await interaction.editReply(
        'That isn’t a custom emoji. Paste the emoji itself, or its id.',
      );
      return;
    }

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );
    const { [job]: _previous, ...others } = settings?.jobEmojis ?? {};
    await this.settingsCollection.setJobEmojis(
      interaction.guildId,
      emojiId ? { ...others, [job]: emojiId } : others,
    );

    await interaction.editReply(
      emojiId
        ? `${JOB_NAME[job]} (${job}) now shows as <:${job}:${emojiId}>`
        : `${JOB_NAME[job]} (${job}) now shows as \`${job}\``,
    );
  }
}

export { EditJobEmojisCommandHandler };
