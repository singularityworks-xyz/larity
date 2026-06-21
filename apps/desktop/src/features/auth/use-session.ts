import { useSession } from "../../lib/auth-client";

export interface AuthUser {
  email: string;
  id: string;
  image?: string | null;
  name: string;
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
