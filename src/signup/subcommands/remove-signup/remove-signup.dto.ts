import { IsEnum, IsString } from 'class-validator';
import { ToLowercase } from '../../../common/decorators/to-lowercase.js';
import { IsValidWorld } from '../../../common/validators/is-valid-world.js';
import { Encounter } from '../../../encounters/encounters.consts.js';
import type { SignupDocument } from '../../../firebase/models/signup.model.js';

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
  @IsValidWorld()
  world: string;
}

export { RemoveSignupDto };
