import 'server-only';
import { AuthorizationError } from '@/server/rbac/authorize';
import { ValidationError } from '@/server/services/modules';

export function errorMessage(err: unknown): string {
  if (err instanceof ValidationError) return err.message;
  if (err instanceof AuthorizationError) return 'You do not have permission to do that.';
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
