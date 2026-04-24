import { useSession } from "../../lib/auth-client";

export function useAuthSession() {
  const session = useSession();
  return {
    ...session,
    user: session.data?.user,
  };
}
