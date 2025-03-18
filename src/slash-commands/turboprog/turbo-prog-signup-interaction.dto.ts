import { IsEnum, IsString } from 'class-validator';
import { Encounter } from '../../encounters/encounters.consts.js';
import type { SignupDocument } from '../../firebase/models/signup.model.js';

class TurboProgSignupInteractionDto
  implements Pick<SignupDocument, 'encounter' | 'availability'>
{
  @IsString()
  availability: string;

  @IsEnum(Encounter)
  encounter: Encounter;
}

export { TurboProgSignupInteractionDto };
