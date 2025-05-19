import { z } from 'zod/v4';
import { configSchema } from './app.config.js';

describe('configSchema', () => {
  it('should apply default values when not provided', () => {
    const config = configSchema.parse({
      CLIENT_ID: 'test-id',
      DISCORD_TOKEN: 'test-token',
      GCP_PRIVATE_KEY: 'key',
      GCP_ACCOUNT_EMAIL: 'email',
      GCP_PROJECT_ID: 'project',
    });

    expect(config).toEqual(
      expect.objectContaining({
        APPLICATION_MODE: ['ultimate'],
        DISCORD_REFRESH_COMMANDS: false,
        LOG_LEVEL: 'info',
        NODE_ENV: 'development',
      }),
    );
  });

  it('should transform APPLICATION_MODE string into array', () => {
    const config = configSchema.parse({
      APPLICATION_MODE: 'savage+ultimate',
      CLIENT_ID: 'test-id',
      DISCORD_TOKEN: 'test-token',
      GCP_PRIVATE_KEY: 'key',
      GCP_ACCOUNT_EMAIL: 'email',
      GCP_PROJECT_ID: 'project',
    });

    expect(config.APPLICATION_MODE).toEqual(['savage', 'ultimate']);
  });

  it('should reject invalid APPLICATION_MODE values', () => {
    expect(() =>
      configSchema.parse({
        APPLICATION_MODE: 'invalid+ultimate',
        CLIENT_ID: 'test-id',
        DISCORD_TOKEN: 'test-token',
        GCP_PRIVATE_KEY: 'key',
        GCP_ACCOUNT_EMAIL: 'email',
        GCP_PROJECT_ID: 'project',
      }),
    ).toThrow(z.ZodError);
  });

  it('should reject duplicate APPLICATION_MODE values', () => {
    const result = configSchema.safeParse({
      APPLICATION_MODE: 'ultimate+ultimate',
      CLIENT_ID: 'test-id',
      DISCORD_TOKEN: 'test-token',
      GCP_PRIVATE_KEY: 'key',
      GCP_ACCOUNT_EMAIL: 'email',
      GCP_PROJECT_ID: 'project',
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBeInstanceOf(z.ZodError);
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'custom',
            message: 'Duplicate modes are not allowed',
            path: ['APPLICATION_MODE'],
          }),
        ]),
      );
    }
  });

  it('should validate required fields', () => {
    expect(() =>
      configSchema.parse({
        APPLICATION_MODE: 'ultimate',
      }),
    ).toThrow(z.ZodError);
  });

  it('should validate LOG_LEVEL enum', () => {
    expect(() =>
      configSchema.parse({
        CLIENT_ID: 'test-id',
        DISCORD_TOKEN: 'test-token',
        GCP_PRIVATE_KEY: 'key',
        GCP_ACCOUNT_EMAIL: 'email',
        GCP_PROJECT_ID: 'project',
        LOG_LEVEL: 'invalid',
      }),
    ).toThrow(z.ZodError);
  });

  it('should validate NODE_ENV enum', () => {
    expect(() =>
      configSchema.parse({
        CLIENT_ID: 'test-id',
        DISCORD_TOKEN: 'test-token',
        GCP_PRIVATE_KEY: 'key',
        GCP_ACCOUNT_EMAIL: 'email',
        GCP_PROJECT_ID: 'project',
        NODE_ENV: 'invalid',
      }),
    ).toThrow(z.ZodError);
  });
});
