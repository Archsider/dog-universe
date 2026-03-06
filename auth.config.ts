import type { NextAuthConfig } from 'next-auth';
import { prisma } from '@/lib/prisma';

export const authConfig = {
  providers: [],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Fresh login — populate from the user object
        token.id = user.id!;
        token.role = user.role as 'SUPERADMIN' | 'ADMIN' | 'CLIENT';
        token.language = (user as { language?: string }).language ?? 'fr';
      } else if (token.id) {
        // Subsequent requests — re-read role from DB so changes take effect immediately
        const fresh = await prisma.user.findUnique({
          where: { id: token.id },
          select: { role: true, language: true },
        });
        if (fresh) {
          token.role = fresh.role as 'SUPERADMIN' | 'ADMIN' | 'CLIENT';
          token.language = fresh.language ?? token.language;
        }
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
