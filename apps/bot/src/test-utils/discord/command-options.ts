import {
  type APIApplicationCommandBasicOption,
  type APIApplicationCommandOption,
  ApplicationCommandOptionType,
  type Attachment,
  ChannelType,
  type CommandInteractionOption,
  type GuildMember,
  type PermissionsBitField,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  type Role,
  type TextChannel,
  type User,
} from 'discord.js';
import { mockOf } from '../mock-factory.js';

/** A command as registered with Discord (what a slash command builder's toJSON() gives). */
export type RegisteredCommand = Pick<
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  'name' | 'options' | 'default_member_permissions'
>;

/** A value a test gives an option: text, a number, a flag, or the id of a user, role or channel. */
export type OptionValue = string | number | boolean;

/** Finds the users, roles and channels a command's options refer to, as Discord resolves them. */
export interface OptionTargets {
  user(id: string): { user: User; member?: GuildMember } | undefined;
  role(id: string): Role | undefined;
  channel(id: string): TextChannel | undefined;
}

/** What a test sends: the subcommand, if any, and its options. */
export interface GivenCommand {
  readonly subcommand?: string;
  readonly options: Readonly<Record<string, OptionValue | null>>;
  readonly attachments: Readonly<Record<string, { url: string }>>;
}

type Resolved = Omit<CommandInteractionOption<'cached'>, 'name' | 'type'>;

const typeName = (type: ApplicationCommandOptionType) =>
  ApplicationCommandOptionType[type];

/** The resolved option for a text, number or flag value, after its limits are checked. */
function valueOption(
  label: string,
  option: APIApplicationCommandBasicOption,
  value: OptionValue,
): Resolved {
  const expected =
    option.type === ApplicationCommandOptionType.String
      ? 'string'
      : option.type === ApplicationCommandOptionType.Boolean
        ? 'boolean'
        : 'number';
  if (typeof value !== expected) {
    throw new Error(
      `${label} is a ${typeName(option.type)}, not ${typeof value}`,
    );
  }
  if (
    option.type === ApplicationCommandOptionType.Integer &&
    !Number.isInteger(value)
  ) {
    throw new Error(`${label} is an Integer, not ${value}`);
  }
  assertWithinChoices(label, option, value);
  assertWithinLimits(label, option, value);
  return { value };
}

function assertWithinChoices(
  label: string,
  option: APIApplicationCommandBasicOption,
  value: OptionValue,
): void {
  const choices = 'choices' in option ? option.choices : undefined;
  if (choices && !choices.some((choice) => choice.value === value)) {
    throw new Error(
      `${label} only offers ${choices.map((choice) => choice.value).join(', ')} (got "${value}")`,
    );
  }
}

/** A text option's length limits, or a number option's range. */
function limitsOf(option: APIApplicationCommandBasicOption): [number, number] {
  if (option.type === ApplicationCommandOptionType.String) {
    return [option.min_length ?? 0, option.max_length ?? 6000];
  }
  const min = 'min_value' in option ? option.min_value : undefined;
  const max = 'max_value' in option ? option.max_value : undefined;
  return [min ?? Number.NEGATIVE_INFINITY, max ?? Number.POSITIVE_INFINITY];
}

/** Throws unless a text value fits its length limits, and a number its range. */
function assertWithinLimits(
  label: string,
  option: APIApplicationCommandBasicOption,
  value: OptionValue,
): void {
  if (typeof value === 'boolean') return;
  const size = typeof value === 'string' ? value.length : value;
  const [min, max] = limitsOf(option);
  if (size < min || size > max) {
    const given = typeof value === 'string' ? `${size} characters` : value;
    throw new Error(`Discord won't send ${label} with ${given}`);
  }
}

/** The resolved option for a user, role or channel id, which must exist in the guild. */
function targetOption(
  label: string,
  option: APIApplicationCommandBasicOption,
  value: OptionValue,
  targets: OptionTargets,
): Resolved {
  if (typeof value !== 'string') {
    throw new Error(`${label} takes the id of a ${typeName(option.type)}`);
  }
  const resolved = resolveTarget(label, option, value, targets);
  if (!resolved) {
    throw new Error(
      `${label} can't pick ${value}: there is no such ${typeName(option.type)} in the guild`,
    );
  }
  return { value, ...resolved };
}

/** The user, role or channel an id picks, if the guild has it. */
function resolveTarget(
  label: string,
  option: APIApplicationCommandBasicOption,
  id: string,
  targets: OptionTargets,
): Resolved | undefined {
  switch (option.type) {
    case ApplicationCommandOptionType.User:
      return targets.user(id);
    case ApplicationCommandOptionType.Role: {
      const role = targets.role(id);
      return role && { role };
    }
    case ApplicationCommandOptionType.Channel: {
      assertChannelType(label, option);
      const channel = targets.channel(id);
      return channel && { channel };
    }
    default:
      return undefined;
  }
}

/** The fake's channels are all text channels; Discord only offers the types an option allows. */
function assertChannelType(
  label: string,
  option: APIApplicationCommandBasicOption,
): void {
  const types = 'channel_types' in option ? (option.channel_types ?? []) : [];
  if (
    types.length > 0 &&
    !types.some((type) => type === ChannelType.GuildText)
  ) {
    throw new Error(`${label} doesn't offer text channels`);
  }
}

const VALUE_TYPES = new Set([
  ApplicationCommandOptionType.String,
  ApplicationCommandOptionType.Integer,
  ApplicationCommandOptionType.Number,
  ApplicationCommandOptionType.Boolean,
]);

const TARGET_TYPES = new Set([
  ApplicationCommandOptionType.User,
  ApplicationCommandOptionType.Role,
  ApplicationCommandOptionType.Channel,
]);

/** The option as discord.js hands it to the resolver, once Discord would accept it. */
function resolveOption(
  commandName: string,
  option: APIApplicationCommandBasicOption,
  value: OptionValue,
  targets: OptionTargets,
): CommandInteractionOption<'cached'> {
  const label = `/${commandName}'s "${option.name}" option`;
  const base = { name: option.name, type: option.type };
  if (VALUE_TYPES.has(option.type)) {
    return { ...base, ...valueOption(label, option, value) };
  }
  if (TARGET_TYPES.has(option.type)) {
    return { ...base, ...targetOption(label, option, value, targets) };
  }
  if (option.type === ApplicationCommandOptionType.Attachment) {
    throw new Error(`${label} is an Attachment; give it in attachments`);
  }
  throw new Error(
    `DiscordMock does not support ${typeName(option.type)} options (${label})`,
  );
}

function attachmentOption(
  name: string,
  { url }: { url: string },
): CommandInteractionOption<'cached'> {
  return {
    name,
    type: ApplicationCommandOptionType.Attachment,
    value: `attachment-${name}`,
    attachment: mockOf<Attachment>({ url }),
  };
}

const isBasicOption = (
  option: APIApplicationCommandOption,
): option is APIApplicationCommandBasicOption =>
  option.type !== ApplicationCommandOptionType.Subcommand &&
  option.type !== ApplicationCommandOptionType.SubcommandGroup;

/** The declared options of the command, or of the subcommand the test picked. */
function declaredOptions(
  command: RegisteredCommand,
  subcommand: string | undefined,
): readonly APIApplicationCommandBasicOption[] {
  const options = command.options ?? [];
  const subcommands = options.filter(
    (option) => option.type === ApplicationCommandOptionType.Subcommand,
  );
  if (
    options.some(
      (option) => option.type === ApplicationCommandOptionType.SubcommandGroup,
    )
  ) {
    throw new Error(
      `DiscordMock does not support subcommand groups (/${command.name})`,
    );
  }
  if (subcommands.length === 0) {
    if (subcommand !== undefined) {
      throw new Error(`/${command.name} has no subcommands`);
    }
    return options.filter(isBasicOption);
  }
  const picked = subcommands.find(({ name }) => name === subcommand);
  if (!picked) {
    throw new Error(
      `Discord won't send /${command.name} without one of its subcommands (${subcommands.map(({ name }) => name).join(', ')}; got ${subcommand ?? 'none'})`,
    );
  }
  return picked.options ?? [];
}

/**
 * The options of a command as discord.js's CommandInteractionOptionResolver
 * takes them, after checking Discord would send them: every option declared
 * and acceptable, every required option given, and a subcommand picked when
 * the command has them.
 */
export function commandOptions(
  command: RegisteredCommand,
  given: GivenCommand,
  targets: OptionTargets,
): CommandInteractionOption<'cached'>[] {
  const commandName = [command.name, given.subcommand]
    .filter((part) => part !== undefined)
    .join(' ');
  const declared = new Map(
    declaredOptions(command, given.subcommand).map((option) => [
      option.name,
      option,
    ]),
  );
  const values = Object.entries(given.options).flatMap(([name, value]) =>
    value === null ? [] : [{ name, value }],
  );
  const optionNamed = (name: string) => {
    const option = declared.get(name);
    if (!option) throw new Error(`/${commandName} has no "${name}" option`);
    return option;
  };
  const resolved = [
    ...values.map(({ name, value }) =>
      resolveOption(commandName, optionNamed(name), value, targets),
    ),
    ...Object.entries(given.attachments).map(([name, attachment]) => {
      if (optionNamed(name).type !== ApplicationCommandOptionType.Attachment) {
        throw new Error(
          `/${commandName}'s "${name}" option is not an Attachment`,
        );
      }
      return attachmentOption(name, attachment);
    }),
  ];
  const missing = [...declared.values()].filter(
    (option) =>
      'required' in option &&
      option.required &&
      !resolved.some(({ name }) => name === option.name),
  );
  if (missing.length > 0) {
    throw new Error(
      `Discord won't send /${commandName} without its required ${missing.map(({ name }) => `"${name}"`).join(', ')} option`,
    );
  }
  return given.subcommand === undefined
    ? resolved
    : [
        {
          name: given.subcommand,
          type: ApplicationCommandOptionType.Subcommand,
          options: resolved,
        },
      ];
}

/**
 * Throws unless the member may use the command: Discord only shows a command
 * with default member permissions to members who have them (Administrator has
 * every permission).
 */
export function assertPermitted(
  command: RegisteredCommand,
  userId: string,
  permissions: PermissionsBitField,
): void {
  const required = command.default_member_permissions;
  if (required === undefined || required === null) return;
  if (!permissions.has(BigInt(required))) {
    throw new Error(
      `${userId} lacks the permissions /${command.name} requires, so Discord won't show it to them`,
    );
  }
}
