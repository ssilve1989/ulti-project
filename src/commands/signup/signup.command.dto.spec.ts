import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Encounter } from '../../encounters/encounters.consts.js';
import { SignupInteractionDto } from './signup-interaction.dto.js';
import { PROG_PROOF_HOSTS_WHITELIST } from './signup.consts.js';

function createBaseObject(proofOfProgLink: string) {
  return {
    availability: 'test',
    character: 'test',
    discordId: 'test',
    role: 'test',
    progPointRequested: 'test',
    encounter: Encounter.TOP,
    proofOfProgLink,
    username: 'test',
    world: 'test',
  };
}

describe('SignupInteractionDto', () => {
  it.each(PROG_PROOF_HOSTS_WHITELIST)(
    'should allow URLs from host %s',
    async (host) => {
      const dto = plainToInstance(
        SignupInteractionDto,
        createBaseObject(`${host.source.replace(/\\/g, '')}`),
      );
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    },
  );

  it('should not allow URLs not in the whitelist', async () => {
    const dto = plainToInstance(
      SignupInteractionDto,
      createBaseObject('https://not-in-whitelist.com/test'),
    );
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('proofOfProgLink');
  });
});
