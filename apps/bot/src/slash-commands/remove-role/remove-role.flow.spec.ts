import { PermissionFlagsBits } from 'discord.js';
import { test as base, describe, expect } from 'vitest';
import { shown } from '../../test-utils/discord/fake-message.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type FlowApp } from '../../test-utils/flow-app.js';
import { textReply } from '../../test-utils/replies.js';

const GUILD = 'guild-1';
const PROG_ROLE = 'prog-role';
const OTHER_ROLE = 'other-role';
const ADMIN = Object.freeze({
  id: 'admin-1',
  username: 'admin',
  permissions: PermissionFlagsBits.Administrator,
});
const MEMBERS = Object.freeze(['member-1', 'member-2', 'member-3']);

const it = base.extend<{ flow: FlowApp }>({
  flow: fresh(
    async () => {
      const flow = await createFlowApp();
      flow.discord.addChannel(GUILD, 'general');
      flow.discord.addRole(GUILD, { id: PROG_ROLE, name: 'Prog' });
      flow.discord.addRole(GUILD, { id: OTHER_ROLE, name: 'Other' });
      flow.discord.addMember(ADMIN);
      flow.discord.addMember({
        id: 'member-1',
        username: 'one',
        roles: [PROG_ROLE, OTHER_ROLE],
      });
      flow.discord.addMember({
        id: 'member-2',
        username: 'two',
        roles: [PROG_ROLE],
      });
      flow.discord.addMember({
        id: 'member-3',
        username: 'three',
        roles: [OTHER_ROLE],
      });
      return flow;
    },
    (flow) => flow.close(),
  ),
});

describe('Remove role', () => {
  describe('when an admin removes a role from everyone', () => {
    it.beforeEach(async ({ flow }) => {
      flow.discord.command({
        userId: ADMIN.id,
        guildId: GUILD,
        commandName: 'remove-role',
        options: { role: PROG_ROLE },
      });
      await flow.settle();
    });

    it('takes it from every member holding it, and nothing else', ({
      flow,
    }) => {
      expect(MEMBERS.map((id) => flow.discord.rolesOf(id))).toEqual([
        [OTHER_ROLE],
        [],
        [OTHER_ROLE],
      ]);
    });

    it('tells the admin, privately, it worked', ({ flow }) => {
      expect(flow.discord.repliesTo(ADMIN.id).map(shown)).toEqual([
        textReply(ADMIN.id, 'Success!', { ephemeral: true }),
      ]);
    });
  });
});
