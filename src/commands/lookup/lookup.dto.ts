import { capitalCase } from 'change-case';
import { IsOptional, IsString } from 'class-validator';
import { ToCasing } from '../../common/decorators/to-casing.js';
import { SignupDocument } from '../../firebase/models/signup.model.js';

export class LookupInteractionDto
  implements Pick<SignupDocument, 'character' | 'world'>
{
  @IsString()
  @ToCasing(capitalCase)
  character: string;

  @IsString()
  @IsOptional()
  @ToCasing(capitalCase)
  world: string;
}
