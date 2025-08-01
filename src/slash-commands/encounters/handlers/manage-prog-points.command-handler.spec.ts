import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ButtonInteraction,
  type ChatInputCommandInteraction,
  MessageFlags,
  StringSelectMenuInteraction,
} from 'discord.js';
import { EncountersService } from '../../../encounters/encounters.service.js';
import { ErrorService } from '../../../error/error.service.js';
import type {
  EncounterDocument,
  ProgPointDocument,
} from '../../../firebase/models/encounter.model.js';
import { PartyStatus } from '../../../firebase/models/signup.model.js';
import { ManageProgPointsCommand } from '../commands/encounters.commands.js';
import { ManageProgPointsCommandHandler } from './manage-prog-points.command-handler.js';

describe('ManageProgPointsCommandHandler', () => {
  let handler: ManageProgPointsCommandHandler;
  let encountersService: DeepMocked<EncountersService>;
  let errorService: DeepMocked<ErrorService>;
  let interaction: DeepMocked<ChatInputCommandInteraction<'cached' | 'raw'>>;
  let mockChannel: DeepMocked<any>;
  let mockCollector: DeepMocked<any>;

  const mockEncounter: EncounterDocument = {
    id: 'test-encounter',
    name: 'Test Encounter',
    description: 'Test encounter description',
    server: 'test-server',
    active: true,
    isActive: true,
    dateCreated: new Date(),
    progPointThreshold: 5,
  };

  const mockProgPoints: ProgPointDocument[] = [
    {
      id: 'p1-start',
      label: 'Phase 1 Start',
      order: 0,
      active: true,
      partyStatus: PartyStatus.EarlyProgParty,
    },
    {
      id: 'p2-add',
      label: 'Phase 2 Add',
      order: 1,
      active: true,
      partyStatus: PartyStatus.ProgParty,
    },
    {
      id: 'enrage',
      label: 'Enrage',
      order: 2,
      active: false,
      partyStatus: PartyStatus.ClearParty,
    },
  ];

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [ManageProgPointsCommandHandler],
    })
      .useMocker(() => createMock())
      .setLogger(createMock<Logger>())
      .compile();

    handler = fixture.get(ManageProgPointsCommandHandler);
    encountersService = fixture.get(EncountersService);
    errorService = fixture.get(ErrorService);

    // Setup interaction mock
    interaction = createMock<ChatInputCommandInteraction<'cached' | 'raw'>>();
    mockChannel = createMock();
    mockCollector = createMock();

    Object.defineProperty(interaction, 'channel', {
      value: mockChannel,
      writable: true,
    });
    Object.defineProperty(interaction, 'user', {
      value: createMock({ id: 'test-user' }),
      writable: true,
    });
    mockChannel.createMessageComponentCollector.mockReturnValue(mockCollector);
    mockCollector.on.mockReturnValue(mockCollector);

    // Setup service mocks
    encountersService.getEncounter.mockResolvedValue(mockEncounter);
    encountersService.getAllProgPoints.mockResolvedValue(mockProgPoints);
  });

  describe('execute', () => {
    it('should defer reply and initialize prog points manager', async () => {
      const command = new ManageProgPointsCommand(
        interaction,
        'test-encounter',
      );

      await handler.execute(command);

      expect(interaction.deferReply).toHaveBeenCalledWith({
        flags: MessageFlags.Ephemeral,
      });
      expect(encountersService.getEncounter).toHaveBeenCalledWith(
        'test-encounter',
      );
      expect(encountersService.getAllProgPoints).toHaveBeenCalledWith(
        'test-encounter',
      );
    });

    it('should handle error during initialization', async () => {
      const error = new Error('Test error');
      encountersService.getEncounter.mockRejectedValue(error);
      const command = new ManageProgPointsCommand(
        interaction,
        'test-encounter',
      );

      await handler.execute(command);

      expect(errorService.captureError).toHaveBeenCalledWith(error);
      expect(interaction.editReply).toHaveBeenCalledWith({
        content:
          '❌ An error occurred while loading prog points. Please try again.',
      });
    });

    it('should handle encounter not found', async () => {
      encountersService.getEncounter.mockResolvedValue(null);
      const command = new ManageProgPointsCommand(
        interaction,
        'test-encounter',
      );

      await handler.execute(command);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '❌ Encounter test-encounter not found.',
      });
    });
  });

  describe('collector setup', () => {
    it('should setup collector with correct filter and timeout', async () => {
      const command = new ManageProgPointsCommand(
        interaction,
        'test-encounter',
      );

      await handler.execute(command);

      expect(mockChannel.createMessageComponentCollector).toHaveBeenCalledWith({
        filter: expect.any(Function),
        time: 300_000,
      });
      expect(mockCollector.on).toHaveBeenCalledWith(
        'collect',
        expect.any(Function),
      );
      expect(mockCollector.on).toHaveBeenCalledWith(
        'end',
        expect.any(Function),
      );
    });

    it('should handle collector timeout', async () => {
      const command = new ManageProgPointsCommand(
        interaction,
        'test-encounter',
      );
      await handler.execute(command);

      // Get the end handler and call it with timeout reason
      const endHandler = mockCollector.on.mock.calls.find(
        (call: any) => call[0] === 'end',
      )?.[1];
      endHandler?.(new Map(), 'time');

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '⏰ Prog point management timed out.',
        components: [],
        embeds: [],
      });
    });
  });

  describe('main menu interactions', () => {
    beforeEach(async () => {
      const command = new ManageProgPointsCommand(
        interaction,
        'test-encounter',
      );
      await handler.execute(command);
    });

    it('should handle finish interaction', async () => {
      const buttonInteraction = createMock<ButtonInteraction>();
      buttonInteraction.isButton.mockReturnValue(true);
      buttonInteraction.isMessageComponent.mockReturnValue(true);
      Object.defineProperty(buttonInteraction, 'customId', {
        value: 'finish-interaction',
      });
      Object.defineProperty(buttonInteraction, 'deferred', {
        value: false,
        writable: true,
      });
      Object.defineProperty(buttonInteraction, 'replied', {
        value: false,
        writable: true,
      });

      // Get the collect handler
      const collectHandler = mockCollector.on.mock.calls.find(
        (call: any) => call[0] === 'collect',
      )?.[1];
      await collectHandler?.(buttonInteraction);

      expect(buttonInteraction.deferUpdate).toHaveBeenCalled();
      expect(mockCollector.stop).toHaveBeenCalledWith('finished');
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '✅ Prog point management completed.',
        embeds: [],
        components: [],
      });
    });

    it('should handle toggle prog point button', async () => {
      const buttonInteraction = createMock<ButtonInteraction>();
      buttonInteraction.isButton.mockReturnValue(true);
      buttonInteraction.isMessageComponent.mockReturnValue(true);
      Object.defineProperty(buttonInteraction, 'customId', {
        value: 'toggle-prog-point',
      });
      Object.defineProperty(buttonInteraction, 'deferred', {
        value: false,
        writable: true,
      });
      Object.defineProperty(buttonInteraction, 'replied', {
        value: false,
        writable: true,
      });

      const collectHandler = mockCollector.on.mock.calls.find(
        (call: any) => call[0] === 'collect',
      )?.[1];
      await collectHandler?.(buttonInteraction);

      expect(buttonInteraction.deferUpdate).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content:
            'Select one or more prog points to toggle between active and inactive:',
        }),
      );
    });
  });

  describe('utility methods', () => {
    beforeEach(async () => {
      const command = new ManageProgPointsCommand(
        interaction,
        'test-encounter',
      );
      await handler.execute(command);
    });

    it('should generate clean prog point IDs', () => {
      const generateProgPointId = (handler as any).generateProgPointId.bind(
        handler,
      );

      expect(generateProgPointId('Phase 1: Start')).toBe('phase-1-start');
      expect(generateProgPointId('P2 - Add Phase!')).toBe('p2-add-phase');
      expect(generateProgPointId('  Multiple   Spaces  ')).toBe(
        'multiple-spaces',
      );
      expect(generateProgPointId('Special@#$%Characters')).toBe(
        'specialcharacters',
      );
    });

    it('should format prog points for display correctly', () => {
      const formatProgPointsForDisplay = (
        handler as any
      ).formatProgPointsForDisplay.bind(handler);

      const result = formatProgPointsForDisplay(mockProgPoints);
      expect(result).toContain('1. ✅ Phase 1 Start');
      expect(result).toContain('2. ✅ Phase 2 Add');
      expect(result).toContain('3. ❌ Enrage (inactive)');
    });

    it('should create consistent prog point selection options', () => {
      const createProgPointSelectionOptions = (
        handler as any
      ).createProgPointSelectionOptions.bind(handler);

      const options = createProgPointSelectionOptions();
      expect(options).toHaveLength(3);
      expect(options[0]).toEqual({
        label: '✅ Phase 1 Start',
        value: 'p1-start',
        description: 'Position 1',
      });
      expect(options[2]).toEqual({
        label: '❌ Enrage (inactive)',
        value: 'enrage',
        description: 'Position 3',
      });
    });
  });

  describe('toggle functionality', () => {
    beforeEach(async () => {
      const command = new ManageProgPointsCommand(
        interaction,
        'test-encounter',
      );
      await handler.execute(command);

      // First click toggle button to get into toggle selection state
      const toggleButton = createMock<ButtonInteraction>();
      toggleButton.isButton.mockReturnValue(true);
      toggleButton.isMessageComponent.mockReturnValue(true);
      Object.defineProperty(toggleButton, 'customId', {
        value: 'toggle-prog-point',
      });
      Object.defineProperty(toggleButton, 'deferred', {
        value: false,
        writable: true,
      });
      Object.defineProperty(toggleButton, 'replied', {
        value: false,
        writable: true,
      });

      const collectHandler = mockCollector.on.mock.calls.find(
        (call: any) => call[0] === 'collect',
      )?.[1];
      await collectHandler?.(toggleButton);
    });

    it('should toggle prog point active status', async () => {
      encountersService.toggleProgPointActive.mockResolvedValue();

      const selectInteraction = createMock<StringSelectMenuInteraction>();
      selectInteraction.isStringSelectMenu.mockReturnValue(true);
      selectInteraction.isMessageComponent.mockReturnValue(true);
      Object.defineProperty(selectInteraction, 'customId', {
        value: 'select-prog-point-toggle',
      });
      Object.defineProperty(selectInteraction, 'values', {
        value: ['p1-start'],
      });
      Object.defineProperty(selectInteraction, 'deferred', {
        value: false,
        writable: true,
      });
      Object.defineProperty(selectInteraction, 'replied', {
        value: false,
        writable: true,
      });

      const collectHandler = mockCollector.on.mock.calls.find(
        (call: any) => call[0] === 'collect',
      )?.[1];
      await collectHandler?.(selectInteraction);

      expect(encountersService.toggleProgPointActive).toHaveBeenCalledWith(
        'test-encounter',
        'p1-start',
      );
      expect(selectInteraction.deferUpdate).toHaveBeenCalled();
    });

    it('should handle prog point not found during toggle', async () => {
      const selectInteraction = createMock<StringSelectMenuInteraction>();
      selectInteraction.isStringSelectMenu.mockReturnValue(true);
      selectInteraction.isMessageComponent.mockReturnValue(true);
      Object.defineProperty(selectInteraction, 'customId', {
        value: 'select-prog-point-toggle',
      });
      Object.defineProperty(selectInteraction, 'values', {
        value: ['non-existent'],
      });
      Object.defineProperty(selectInteraction, 'deferred', {
        value: false,
        writable: true,
      });
      Object.defineProperty(selectInteraction, 'replied', {
        value: false,
        writable: true,
      });

      const collectHandler = mockCollector.on.mock.calls.find(
        (call: any) => call[0] === 'collect',
      )?.[1];
      await collectHandler?.(selectInteraction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '❌ No prog points found.',
        embeds: [],
        components: [],
      });
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      const command = new ManageProgPointsCommand(
        interaction,
        'test-encounter',
      );
      await handler.execute(command);
    });

    it('should handle expired interaction error', async () => {
      const expiredError = { code: 10062, message: 'Unknown interaction' };
      const buttonInteraction = createMock<ButtonInteraction>();
      buttonInteraction.isButton.mockReturnValue(true);
      buttonInteraction.isMessageComponent.mockReturnValue(true);
      Object.defineProperty(buttonInteraction, 'customId', {
        value: 'toggle-prog-point',
      });
      Object.defineProperty(buttonInteraction, 'deferred', {
        value: false,
        writable: true,
      });
      Object.defineProperty(buttonInteraction, 'replied', {
        value: false,
        writable: true,
      });

      const collectHandler = mockCollector.on.mock.calls.find(
        (call: any) => call[0] === 'collect',
      )?.[1];

      // Mock the deferUpdate to throw an expired error
      buttonInteraction.deferUpdate.mockRejectedValue(expiredError);

      await collectHandler?.(buttonInteraction);

      expect(mockCollector.stop).toHaveBeenCalledWith('expired');
    });

    it('should validate interaction age', async () => {
      const oldInteraction = createMock<ButtonInteraction>();
      oldInteraction.isButton.mockReturnValue(true);
      oldInteraction.isMessageComponent.mockReturnValue(true);
      Object.defineProperty(oldInteraction, 'customId', {
        value: 'toggle-prog-point',
      });
      Object.defineProperty(oldInteraction, 'deferred', {
        value: false,
        writable: true,
      });
      Object.defineProperty(oldInteraction, 'replied', {
        value: false,
        writable: true,
      });
      Object.defineProperty(oldInteraction, 'createdTimestamp', {
        value: Date.now() - 16 * 60 * 1000, // 16 minutes ago (expired)
      });

      const collectHandler = mockCollector.on.mock.calls.find(
        (call: any) => call[0] === 'collect',
      )?.[1];
      await collectHandler?.(oldInteraction);

      expect(mockCollector.stop).toHaveBeenCalledWith('expired');
    });
  });

  describe('global interactions', () => {
    beforeEach(async () => {
      const command = new ManageProgPointsCommand(
        interaction,
        'test-encounter',
      );
      await handler.execute(command);
    });

    it('should handle return to main menu', async () => {
      encountersService.getAllProgPoints.mockResolvedValue(mockProgPoints);

      const buttonInteraction = createMock<ButtonInteraction>();
      buttonInteraction.isButton.mockReturnValue(true);
      buttonInteraction.isMessageComponent.mockReturnValue(true);
      Object.defineProperty(buttonInteraction, 'customId', {
        value: 'return-to-main',
      });
      Object.defineProperty(buttonInteraction, 'deferred', {
        value: false,
        writable: true,
      });
      Object.defineProperty(buttonInteraction, 'replied', {
        value: false,
        writable: true,
      });

      const collectHandler = mockCollector.on.mock.calls.find(
        (call: any) => call[0] === 'collect',
      )?.[1];
      await collectHandler?.(buttonInteraction);

      expect(buttonInteraction.deferUpdate).toHaveBeenCalled();
      expect(encountersService.getAllProgPoints).toHaveBeenCalledWith(
        'test-encounter',
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: 'Manage Prog Points - Test Encounter',
              }),
            }),
          ]),
        }),
      );
    });
  });
});
