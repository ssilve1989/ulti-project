# `/teams view` Members Embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/teams view` embed's description/teamId field value with a live member list for each team, keyed by the team's Discord role mention.

**Architecture:** Single method change in `TeamsCommandHandler.handleView`. Fetch guild members for each active team in parallel with `Promise.all`, then build embed fields where the field name is `<@&roleId>` and the value is the leader (always first, with ` (Leader)` suffix) followed by any non-leader role members as `<@userId>` mentions.

**Tech Stack:** NestJS 11, Discord.js v14, Vitest

---

## File Map

- Modify: `src/slash-commands/teams/handlers/teams.command-handler.ts` — rewrite `handleView` only
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.spec.ts` — add `view subcommand` describe block

---

## Task 1: Rewrite `handleView` with TDD

**Files:**
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.spec.ts`
- Modify: `src/slash-commands/teams/handlers/teams.command-handler.ts`

- [ ] **Step 1: Add the failing `view subcommand` describe block**

Add the following describe block to `src/slash-commands/teams/handlers/teams.command-handler.spec.ts`, before the closing `});` of the outer `describe('TeamsCommandHandler', ...)` block (i.e. after the `permission check` describe block):

```ts
describe('view subcommand', () => {
  it('replies with no-teams message when no active teams exist', async () => {
    helperTeamCollection.getActiveForGuild.mockResolvedValueOnce([]);

    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: { getSubcommand: () => 'view' },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenCalledWith('No active teams found.');
  });

  it('shows role mention as field name and leader-first member mentions as field value', async () => {
    const now = Timestamp.now();
    helperTeamCollection.getActiveForGuild.mockResolvedValueOnce([
      {
        guildId: 'guild-id',
        teamId: 'alpha',
        name: 'Alpha',
        active: true,
        memberRoleId: 'role-alpha',
        leaderUserId: 'leader-id',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const member1 = { user: { id: 'member-1' } } as unknown as GuildMember;
    discordService.getMembersWithRole.mockResolvedValueOnce([member1]);

    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: { getSubcommand: () => 'view' },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    expect(discordService.getMembersWithRole).toHaveBeenCalledWith({
      guildId: 'guild-id',
      roleId: 'role-alpha',
    });

    const replyArg = (interaction.editReply as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as {
      embeds: { data: { fields: { name: string; value: string }[] } }[];
    };
    expect(replyArg.embeds[0].data.fields[0]).toMatchObject({
      name: '<@&role-alpha>',
      value: '<@leader-id> (Leader)\n<@member-1>',
    });
  });

  it('omits the leader from the non-leader list when the leader holds the role', async () => {
    const now = Timestamp.now();
    helperTeamCollection.getActiveForGuild.mockResolvedValueOnce([
      {
        guildId: 'guild-id',
        teamId: 'alpha',
        name: 'Alpha',
        active: true,
        memberRoleId: 'role-alpha',
        leaderUserId: 'leader-id',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // The leader also holds the member role — should appear once, not twice
    const leaderMember = { user: { id: 'leader-id' } } as unknown as GuildMember;
    const otherMember = { user: { id: 'member-2' } } as unknown as GuildMember;
    discordService.getMembersWithRole.mockResolvedValueOnce([leaderMember, otherMember]);

    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: { getSubcommand: () => 'view' },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    const replyArg = (interaction.editReply as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as {
      embeds: { data: { fields: { name: string; value: string }[] } }[];
    };
    expect(replyArg.embeds[0].data.fields[0].value).toBe(
      '<@leader-id> (Leader)\n<@member-2>',
    );
  });

  it('shows only the leader line when no other members hold the role', async () => {
    const now = Timestamp.now();
    helperTeamCollection.getActiveForGuild.mockResolvedValueOnce([
      {
        guildId: 'guild-id',
        teamId: 'alpha',
        name: 'Alpha',
        active: true,
        memberRoleId: 'role-alpha',
        leaderUserId: 'leader-id',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    discordService.getMembersWithRole.mockResolvedValueOnce([]);

    const interaction = {
      guildId: 'guild-id',
      user: { id: 'coordinator-id' },
      options: { getSubcommand: () => 'view' },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute({ interaction });

    const replyArg = (interaction.editReply as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as {
      embeds: { data: { fields: { name: string; value: string }[] } }[];
    };
    expect(replyArg.embeds[0].data.fields[0].value).toBe('<@leader-id> (Leader)');
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
pnpm vitest run src/slash-commands/teams/handlers/teams.command-handler.spec.ts
```

Expected: the four new `view subcommand` tests fail. The first (`no-teams`) likely passes already; the others fail because `handleView` currently uses `t.description ?? t.teamId` for the field value.

- [ ] **Step 3: Rewrite `handleView` in the handler**

In `src/slash-commands/teams/handlers/teams.command-handler.ts`, replace the `handleView` method (lines 186–207) with:

```ts
private async handleView(
  interaction: TeamsCommand['interaction'],
): Promise<void> {
  const teams = await this.helperTeamCollection.getActiveForGuild(
    interaction.guildId,
  );

  if (teams.length === 0) {
    await interaction.editReply('No active teams found.');
    return;
  }

  const memberLists = await Promise.all(
    teams.map((t) =>
      this.discordService.getMembersWithRole({
        guildId: interaction.guildId,
        roleId: t.memberRoleId,
      }),
    ),
  );

  const embed = new EmbedBuilder().setTitle('Active Helper Teams').addFields(
    teams.map((t, i) => {
      const nonLeaders = memberLists[i].filter((m) => m.user.id !== t.leaderUserId);
      const lines = [
        `<@${t.leaderUserId}> (Leader)`,
        ...nonLeaders.map((m) => `<@${m.user.id}>`),
      ];
      return {
        name: `<@&${t.memberRoleId}>`,
        value: lines.join('\n'),
        inline: false,
      };
    }),
  );

  await interaction.editReply({ embeds: [embed] });
}
```

- [ ] **Step 4: Run the spec to verify all tests pass**

```bash
pnpm vitest run src/slash-commands/teams/handlers/teams.command-handler.spec.ts
```

Expected: all tests pass, including the existing subcommand tests.

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Run the full test suite**

```bash
pnpm test:ci
```

Expected: all tests pass, no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/slash-commands/teams/handlers/teams.command-handler.ts \
        src/slash-commands/teams/handlers/teams.command-handler.spec.ts
git commit -m "feat: show role mention and member list in /teams view embed"
```

---

## Self-Review

**1. Spec coverage:**

| Requirement | Task |
|---|---|
| Field name is role mention `<@&memberRoleId>` | Task 1 Step 3 |
| Leader shown first with ` (Leader)` suffix | Task 1 Step 3 |
| Non-leader members shown as `<@userId>` | Task 1 Step 3 |
| Leader excluded from non-leader list when they hold the role | Task 1 Steps 1 & 3 |
| Empty teams case unchanged ("No active teams found.") | Task 1 Steps 1 & 3 |
| Members fetched in parallel | Task 1 Step 3 (`Promise.all`) |

**2. Placeholder scan:** No TBD/TODO. All steps include exact code.

**3. Type consistency:** `getMembersWithRole` returns `GuildMember[]` — `m.user.id` is valid on `GuildMember`. `getActiveForGuild` returns `HelperTeamDocument[]` — `t.memberRoleId`, `t.leaderUserId` are defined fields on that interface. All consistent with existing code.
