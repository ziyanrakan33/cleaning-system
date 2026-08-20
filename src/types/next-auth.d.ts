import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      /** Contract area a contractor-side account is restricted to — see src/server/scope.ts. */
      contractAreaId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    contractAreaId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    contractAreaId: string | null;
  }
}
