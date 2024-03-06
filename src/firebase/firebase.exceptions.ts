// TODO: Move to firebase exceptions

export class DocumentNotFoundException extends Error {
  constructor(message: string) {
    super(message);
  }
}
