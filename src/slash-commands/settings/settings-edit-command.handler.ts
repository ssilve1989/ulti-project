import * as Sentry from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import { SettingsSubcommandHandler } from './settings-subcommand.handler.js';

export abstract class SettingsEditCommandHandler<
  TOpts,
> extends SettingsSubcommandHandler {
  protected abstract readonly successMessage: string;

  protected abstract readOptions(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): TOpts;

  protected abstract scopeContext(opts: TOpts): {
    name: string;
    context: Record<string, unknown>;
  };

  protected abstract buildPatch(
    opts: TOpts,
    existing: SettingsDocument | undefined,
  ): Partial<SettingsDocument>;

  protected async handle(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const opts = this.readOptions(interaction);
    const { name, context } = this.scopeContext(opts);
    Sentry.getCurrentScope().setContext(name, context);

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    await this.settingsCollection.upsert(interaction.guildId, {
      ...settings,
      ...this.buildPatch(opts, settings),
    });

    await interaction.editReply(this.successMessage);
  }
}
