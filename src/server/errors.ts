/** A problem with what the user asked for; its message is safe to show them. */
export class ValidationError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
