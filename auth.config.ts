// Edge-safe NextAuth base config — NO Prisma, NO bcrypt, NO Node-only APIs.
// Used by middleware (Edge Runtime) to decode the JWT cookie and read the
// session.user fields that were set by the Node-side jwt callback in auth.ts.
//
// The full config (with Credentials provider + jwt callback that hits the DB)
// lives in auth.ts (Node Runtime) and consumes this base via spread.
//
// Reference: https://authjs.dev/guides/edge-compatibility
import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
  providers: [], // Credentials provider is added in auth.ts (it needs Prisma + bcrypt)
  session: {
    strategy: 'jwt',
    // 12h — narrowed from 24h (audit S-M4). Combined with `tokenVersion`
    // bumping on password change, this caps the window of a stolen JWT
    // cookie at 12h max instead of 24h. The `jwt()` callback in auth.ts
    // refreshes role/totpPending from DB on every JWT update, so role
    // revocation propagates faster too.
    maxAge: 12 * 60 * 60,
  },
  callbacks: {
    // session() only reads the JWT — Edge-safe.
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as 'ADMIN' | 'CLIENT' | 'SUPERADMIN';
        session.user.language = (token.language as string) ?? 'fr';
        session.user.totpPending = (token.totpPending as boolean | undefined) ?? false;
        session.user.totpEnabled = (token.totpEnabled as boolean | undefined) ?? false;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/login',
  },
  trustHost: true,
};
