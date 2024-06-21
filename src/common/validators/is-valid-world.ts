import { NorthAmericanWorlds } from '../../worlds/consts.js';
import { IsInSet } from './is-in-set.js';

export const IsValidWorld = (worlds: Set<string> = NorthAmericanWorlds) =>
  IsInSet(worlds, {
    message:
      'Invalid World. Please check the spelling and make sure it is a valid world in the NA Region',
  });
