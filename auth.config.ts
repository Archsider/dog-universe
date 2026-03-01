import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  providers: [],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role as 'ADMIN' | 'CLIENT';
        token.language = (user as { language?: string }).language ?? 'fr';
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.language = token.language ?? 'fr';
      }
      return session;
    },
  },
  pages: {
    signIn: '/fr/auth/login',
    error: '/fr/auth/login',
  },
  trustHost: true,
} satisfies NextAuthConfig;
