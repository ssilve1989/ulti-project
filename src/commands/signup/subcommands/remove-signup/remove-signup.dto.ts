import { IsEnum, IsString } from 'class-validator';
import { ToLowercase } from '../../../../common/decorators/to-lowercase.js';
import { Encounter } from '../../../../encounters/encounters.consts.js';
import { SignupDocument } from '../../../../firebase/models/signup.model.js';

class RemoveSignupDto
  implements Pick<SignupDocument, 'character' | 'world' | 'encounter'>
{
  @IsString()
  @ToLowercase()
  character: string;

  @IsEnum(Encounter)
  encounter: Encounter;

  @IsString()
  @ToLowercase()
  world: string;
}

export { RemoveSignupDto };
