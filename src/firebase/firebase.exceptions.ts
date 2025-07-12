export class DocumentNotFoundException extends Error {
  constructor(public readonly data?: Record<string, unknown>) {
    super('Document not found');
  }
}
