// App-wide state that lives on the phone: sign-in (simulated in the
// prototype), the selected school, read/unread marks, calendar filters and the
// prototype switches. Server data goes through TanStack Query (src/services).

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { initialReadIds, schools } from '@/data/sample';
import type { School } from '@/data/types';
import { defaultPrototypeOptions, setPrototypeOptions, type PrototypeOptions } from '@/services/prototype';

type AuthStage = 'signed_out' | 'two_step' | 'signed_in';

type AppState = {
  auth: AuthStage;
  signIn: (email: string, password: string) => { ok: true } | { ok: false; message: string };
  verifyTwoStep: (code: string) => { ok: true } | { ok: false; message: string };
  signOut: () => void;

  /** 'all' or a school id. */
  schoolFilter: string;
  setSchoolFilter: (id: string) => void;
  /** The single selected school, or null in "All schools". */
  selectedSchool: School | null;

  readIds: ReadonlySet<string>;
  markRead: (id: string) => void;

  calendarChildIds: readonly string[];
  setCalendarChildIds: (ids: string[]) => void;

  options: PrototypeOptions;
  setOption: <K extends keyof PrototypeOptions>(key: K, value: PrototypeOptions[K]) => void;

  /** True when at least one of the family's schools has the assistant on a plan with AI. */
  askAvailable: boolean;
  schoolHasAsk: (schoolId: string) => boolean;
};

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthStage>('signed_out');
  const [schoolFilter, setSchoolFilter] = useState('all');
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set(initialReadIds));
  const [calendarChildIds, setCalendarChildIds] = useState<readonly string[]>([]);
  const [options, setOptions] = useState<PrototypeOptions>(defaultPrototypeOptions);

  const signIn = useCallback(
    (email: string, password: string) => {
      if (!email.includes('@')) return { ok: false as const, message: 'Enter the email you use for your school portal.' };
      if (password.length < 1) return { ok: false as const, message: 'Enter your password.' };
      if (password.toLowerCase() === 'wrong') return { ok: false as const, message: "That email and password don't match. Try again." };
      setAuth(options.requireTwoStep ? 'two_step' : 'signed_in');
      return { ok: true as const };
    },
    [options.requireTwoStep],
  );

  const verifyTwoStep = useCallback((code: string) => {
    const clean = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(clean) && !/^[a-z0-9]{10}$/i.test(clean)) return { ok: false as const, message: 'Enter the 6-digit code from your authenticator app.' };
    if (clean === '000000') return { ok: false as const, message: "That code didn't work. Check the app and try again." };
    setAuth('signed_in');
    return { ok: true as const };
  }, []);

  const signOut = useCallback(() => {
    // Phase 4: also ends the session on the server and clears SecureStore and the query cache.
    setAuth('signed_out');
    setSchoolFilter('all');
    setCalendarChildIds([]);
  }, []);

  const markRead = useCallback((id: string) => {
    setReadIds((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
  }, []);

  const setOption = useCallback(<K extends keyof PrototypeOptions>(key: K, value: PrototypeOptions[K]) => {
    setOptions((prev) => {
      const next = { ...prev, [key]: value };
      setPrototypeOptions(next);
      return next;
    });
  }, []);

  const schoolHasAsk = useCallback(
    (schoolId: string) => {
      const s = schools.find((x) => x.id === schoolId);
      return !!s && !options.essentialPlan && s.plan !== 'essential' && s.assistantEnabled;
    },
    [options.essentialPlan],
  );

  const value = useMemo<AppState>(
    () => ({
      auth,
      signIn,
      verifyTwoStep,
      signOut,
      schoolFilter,
      setSchoolFilter,
      selectedSchool: schools.find((s) => s.id === schoolFilter) ?? null,
      readIds,
      markRead,
      calendarChildIds,
      setCalendarChildIds,
      options,
      setOption,
      askAvailable: schools.some((s) => schoolHasAsk(s.id)),
      schoolHasAsk,
    }),
    [auth, signIn, verifyTwoStep, signOut, schoolFilter, readIds, markRead, calendarChildIds, options, setOption, schoolHasAsk],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState must be used inside AppStateProvider');
  return v;
}
