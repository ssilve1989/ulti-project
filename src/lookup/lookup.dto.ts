import { IsOptional, IsString } from 'class-validator';
import { ToLowercase } from '../common/decorators/to-lowercase.js';
import { IsValidWorld } from '../common/validators/is-valid-world.js';
import type { SignupDocument } from '../firebase/models/signup.model.js';

export class LookupInteractionDto
  implements Pick<SignupDocument, 'character' | 'world'>
{
  @IsString()
  @ToLowercase()
  character: string;

  @IsString()
  @IsOptional()
  @ToLowercase()
  @IsValidWorld()
  world: string;
}
