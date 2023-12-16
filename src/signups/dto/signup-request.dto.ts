import { IsEnum, IsString, IsUrl, ValidateIf } from 'class-validator';
import { Encounter } from '../../app.consts.js';

class SignupRequestDto {
  @IsString()
  availability: string;

  @IsString()
  character: string;

  @IsString()
  discordId: string;

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
  username: string;

  @IsString()
  world: string;
}

export { SignupRequestDto };
