import type { ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { ForbiddenPage } from '../errors/ForbiddenPage';
export function RouteGuard({ ability, children }: { ability: string; children: ReactNode }) {
  const auth = useAuth();
  return auth.abilities.includes('*') || auth.abilities.includes('*:*:*') || auth.abilities.includes(ability) ? <>{children}</> : <ForbiddenPage />;
}
