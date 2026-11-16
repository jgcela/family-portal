import { Redirect } from 'expo-router';

import { useAppState } from '@/state/app-state';

export default function Index() {
  const { auth } = useAppState();
  return <Redirect href={auth === 'signed_in' ? '/home' : '/welcome'} />;
}
