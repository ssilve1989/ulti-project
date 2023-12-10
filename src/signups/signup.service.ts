import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { EmbedBuilder } from 'discord.js';
import { CollectionReference, Firestore } from 'firebase-admin/firestore';
import { EncounterFriendlyDescription } from '../app.consts.js';
import { InjectFirestore } from '../firebase/firebase.decorators.js';
import { SignupEvent } from './signup.events.js';
import { Signup, SignupRequest } from './signup.interfaces.js';

@Injectable()
class SignupService {
  private readonly logger = new Logger(SignupService.name);
  private readonly collection: CollectionReference<Signup>;

  constructor(
    private readonly eventBus: EventBus,

    @InjectFirestore() private readonly firestore: Firestore,
  ) {
    this.collection = this.firestore.collection(
      'signups',
    ) as CollectionReference<Signup>;
  }

  /**
   * Upserts a signup request into the database. If the signup already exists, it will update the
   * fflogsLink, character, world, and availability fields. Otherwise, it will create a new signup
   * @param signup
   */
  public async upsertSignup(signup: SignupRequest) {
    const key = this.getKeyForSignup(signup);

    const document = this.collection.doc(key);
    const snapshot = await document.get();

    if (snapshot.exists) {
      await document.set(signup, {
        // only update these fields if the document already exists. This allows approvals that were made to remain intact
        mergeFields: ['fflogsLink', 'character', 'world', 'availability'],
      });
    } else {
      await document.create({ ...signup, approved: false });
    }

    const updatedSnapshot = await this.collection.doc(key).get();
    const updatedSignup = updatedSnapshot.data();

    // TOOD: better way to handle typing here? We know the document will exist becuase we just wrote it!
    if (updatedSignup) {
      this.logger.debug('publishing signup event');
      this.eventBus.publish(new SignupEvent(updatedSignup));
    }
  }

  /**
   * Creates an embed for the signup that can be used in a message
   * @param signup
   * @param description
   * @returns
   */
  public createSignupConfirmationEmbed({
    availability,
    character,
    encounter,
    fflogsLink,
    world,
  }: SignupRequest) {
    const embed = new EmbedBuilder()
      .setTitle(`${EncounterFriendlyDescription[encounter]} Signup`)
      .setDescription("Here's a summary of your request")
      .addFields([
        { name: 'Character', value: character },
        { name: 'Home World', value: world },
        { name: 'FF Logs Link', value: `[Click Here](${fflogsLink})` },
        { name: 'Availability', value: availability },
      ]);

    return embed;
  }

  private getKeyForSignup({ username, encounter }: SignupRequest) {
    // usernames are supposed to be unique right? The recent change discord
    // made to remove #discriminator from the username might make this wonky
    return `${username}-${encounter}`;
  }
}

export { SignupService };
