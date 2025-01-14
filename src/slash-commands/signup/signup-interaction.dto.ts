import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  ValidateIf,
} from 'class-validator';
import { ToLowercase } from '../../common/decorators/to-lowercase.js';
import { TransformUrl } from '../../common/decorators/transform-url.js';
import { IsValidWorld } from '../../common/validators/is-valid-world.js';
import { Encounter } from '../../encounters/encounters.consts.js';
import type { SignupDocument } from '../../firebase/models/signup.model.js';
import {
  PROG_PROOF_HOSTS_WHITELIST,
  WHITELIST_VALIDATION_ERROR,
} from './signup.consts.js';

class SignupInteractionDto
  implements Omit<SignupDocument, 'status' | 'partyStatus' | 'expiresAt'>
{
  @IsString()
  availability: string;

  @IsString()
  @ToLowercase()
  character: string;

  @IsString()
  discordId: string;

  @IsString()
  role: string; // freeform for now but could be restricted via enum

  @IsString()
  progPointRequested: string;

  @IsEnum(Encounter)
  encounter: Encounter;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsUrl(
    { host_whitelist: PROG_PROOF_HOSTS_WHITELIST },
    {
      message: WHITELIST_VALIDATION_ERROR,
    },
  )
  @TransformUrl()
  @ValidateIf(
    ({ screenshot, proofOfProgLink }) => proofOfProgLink || !screenshot,
  )
  proofOfProgLink: string | null = null;

  @IsString({
    message: 'A screenshot must be attached if no link is provided',
  })
  @ValidateIf(({ proofOfProgLink }) => !proofOfProgLink)
  screenshot: string | null = null;

  @IsString()
  @ToLowercase()
  username: string;

  @IsString()
  @ToLowercase()
  @IsValidWorld()
  world: string;
}

export { SignupInteractionDto };
