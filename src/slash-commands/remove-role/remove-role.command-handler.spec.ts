import { createMock } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { RemoveRoleCommandHandler } from './remove-role.command-handler.js';

describe('RemoveRoleCommandHandler', () => {
  let handler: RemoveRoleCommandHandler;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [RemoveRoleCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(RemoveRoleCommandHandler);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });
});
