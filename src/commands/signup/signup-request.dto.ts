import { IsEnum, IsString, IsUrl, ValidateIf } from 'class-validator';
import { ToLowercase } from '../../common/decorators/to-lowercase.js';
import { Encounter } from '../../encounters/encounters.consts.js';
import {
  PartyType,
  SignupDocument,
} from '../../firebase/models/signup.model.js';

class SignupInteractionDto
  implements Omit<SignupDocument, 'status' | 'partyType'>
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

  @IsEnum(Encounter)
  encounter: Encounter;

  @IsUrl(
    { host_whitelist: [/fflogs\.com/] },
    {
      message:
        'A valid fflogs URL must be provided if no screenshot is attached',
    },
  )
  @ValidateIf(({ screenshot }) => !screenshot)
  fflogsLink?: string | null;

  @IsString({
    message: 'A screenshot must be attached if no fflogs link is provided',
  })
  @ValidateIf(({ fflogsLink }) => !fflogsLink)
  screenshot?: string | null;

  @IsString()
  @ToLowercase()
  username: string;

  @IsString()
  @ToLowercase()
  world: string;
}

export { SignupInteractionDto };
