export class DocumentNotFoundException extends Error {
  constructor(public readonly data?: Record<string, any>) {
    super('Document not found');
  }
}
