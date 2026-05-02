import { useSession } from "../../lib/auth-client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  orgId?: string | null;
  role?: string;
}

export function useAuthSession() {
  const session = useSession();
  return {
    ...session,
    user: session.data?.user as AuthUser | undefined,
  };
}
