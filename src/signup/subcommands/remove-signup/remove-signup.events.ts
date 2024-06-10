import { SettingsDocument } from '../../../firebase/models/settings.model.js';
import { RemoveSignupDto } from './remove-signup.dto.js';

export class RemoveSignupEvent {
  constructor(
    public readonly dto: RemoveSignupDto,
    public readonly settings: SettingsDocument,
  ) {}
}
