export type AuthSession = { userId: string; roleKey: string; abilities: string[] };
export interface AuthClient { getSession(): Promise<AuthSession>; }
