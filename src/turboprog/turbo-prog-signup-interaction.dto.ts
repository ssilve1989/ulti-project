import { IsEnum, IsString } from 'class-validator';
import { ToLowercase } from '../common/decorators/to-lowercase.js';
import { Encounter } from '../encounters/encounters.consts.js';
import { SignupDocument } from '../firebase/models/signup.model.js';

class TurboProgSignupInteractionDto
  implements
    Pick<SignupDocument, 'character' | 'encounter' | 'role' | 'availability'>
{
  @IsString()
  availability: string;

  @IsString()
  @ToLowercase()
  character: string;

  @IsEnum(Encounter)
  encounter: Encounter;

  @IsString()
  role: string;

  @IsString()
  world: string;
}

export { TurboProgSignupInteractionDto };
