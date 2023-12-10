import { Signup } from './signup.interfaces.js';

export class SignupEvent {
  constructor(public readonly signup: Signup) {}
}
