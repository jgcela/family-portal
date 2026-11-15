import 'server-only';
import { AuthorizationError } from '@/server/rbac/authorize';
import { ZodError } from 'zod';
import { ValidationError } from '@/server/services/modules';

export function errorMessage(err: unknown): string {
  if (err instanceof ValidationError) return err.message;
  if (err instanceof ZodError) return err.issues[0]?.message ?? 'Check the form and try again.';
  if (err instanceof AuthorizationError) return err.message.startsWith('Not allowed') ? 'You do not have permission to do that.' : err.message;
  if (err instanceof Error && (err.name === 'AssistantUnavailableError' || err.name === 'QuotaExceededError')) return err.message;
  console.error(err);
  return 'Something went wrong. Please try again.';
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

export const ids = (fd: FormData, k: string) => fd.getAll(k).filter((v): v is string => typeof v === 'string');

/** <input type="datetime-local"> value in the school's zone → ISO instant (or null). */
export { zonedTimeToUtc } from '@/server/calendar/time';
