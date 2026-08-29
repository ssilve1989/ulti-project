import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAutoMock } from '../../../test-utils/mock-factory.js';
import { RemoveRoleCommandHandler } from './remove-role.command-handler.js';

describe('RemoveRoleCommandHandler', () => {
  let command: RemoveRoleCommandHandler;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [RemoveRoleCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    command = fixture.get(RemoveRoleCommandHandler);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });
});
