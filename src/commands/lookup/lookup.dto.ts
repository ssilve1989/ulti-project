import { IsOptional, IsString } from 'class-validator';
import { SignupDocument } from '../../firebase/models/signup.model.js';
import { ToLowercase } from '../../common/decorators/to-lowercase.js';

export class LookupInteractionDto
  implements Pick<SignupDocument, 'character' | 'world'>
{
  @IsString()
  @ToLowercase()
  character: string;

  @IsString()
  @IsOptional()
  @ToLowercase()
  world: string;
}
