import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';

const TEA = new StringSelectMenuOptionBuilder()
  .setLabel('TEA')
  .setDescription('The Epic of Alexander (Ultimate')
  .setValue('tea');

const UCOB = new StringSelectMenuOptionBuilder()
  .setLabel('UCoB')
  .setDescription('The Unending Coil of Bahamut (Ultimate)')
  .setValue('ucob');

const UWU = new StringSelectMenuOptionBuilder()
  .setLabel('UWU')
  .setValue('uwu')
  .setDescription("The Weapon's Refrain (Ultimate)");

const DSR = new StringSelectMenuOptionBuilder()
  .setLabel('DSR')
  .setValue('dsr')
  .setDescription(`Dragonson's Reprise (Ultimate)`);

const TOP = new StringSelectMenuOptionBuilder()
  .setLabel('TOP')
  .setValue('top')
  .setDescription(`The Omega Protocol (Ultimate)`);

const ULTIMATES = [TOP, UWU, UCOB, TEA, DSR];

const ENCOUNTER_SELECTOR = new StringSelectMenuBuilder()
  .setCustomId('encounter')
  .setPlaceholder('Make a selection')
  .addOptions(...ULTIMATES);

// TODO: This is ass, surely a better way?
const DAYS_OF_WEEK = [
  new StringSelectMenuOptionBuilder().setLabel('Sunday').setValue('sunday'),
  new StringSelectMenuOptionBuilder().setLabel('Monday').setValue('monday'),
  new StringSelectMenuOptionBuilder().setLabel('Tuesday').setValue('tuesday'),
  new StringSelectMenuOptionBuilder()
    .setLabel('Wednesday')
    .setValue('wednesday'),
  new StringSelectMenuOptionBuilder().setLabel('Thursday').setValue('thursday'),
  new StringSelectMenuOptionBuilder().setLabel('Friday').setValue('friday'),
  new StringSelectMenuOptionBuilder().setLabel('Saturday').setValue('saturday'),
];

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const lhs = i % 12;
  const amPm = i > 12 ? 'PM' : 'AM';
  return new StringSelectMenuOptionBuilder()
    .setLabel(`${lhs === 0 ? '12' : lhs}:00 ${amPm}`)
    .setValue(`${i}:00`);
});

const dayMenu = new StringSelectMenuBuilder()
  .setCustomId('day')
  .setPlaceholder('Select a day')
  .addOptions(DAYS_OF_WEEK);

const startTimeMenu = new StringSelectMenuBuilder()
  .setCustomId('start-time')
  .setPlaceholder('Select start time')
  .addOptions(TIME_OPTIONS);

const endTimeMenu = new StringSelectMenuBuilder()
  .setCustomId('end-time')
  .setPlaceholder('Select end time')
  .addOptions(TIME_OPTIONS);

const Buttons = {
  Done: new ButtonBuilder()
    .setCustomId('done')
    .setLabel('Done')
    .setStyle(ButtonStyle.Success),

  More: new ButtonBuilder()
    .setCustomId('more')
    .setLabel('Add More Days')
    .setStyle(ButtonStyle.Primary),
};

export const Rows = {
  EncounterSelector: new ActionRowBuilder().addComponents(ENCOUNTER_SELECTOR),
  DayOfWeek: new ActionRowBuilder().addComponents(dayMenu),
  StartTime: new ActionRowBuilder().addComponents(startTimeMenu),
  EndTime: new ActionRowBuilder().addComponents(endTimeMenu),
  Confirmation: new ActionRowBuilder().addComponents(
    Buttons.Done,
    Buttons.More,
  ),
};
