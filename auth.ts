import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });

        if (!user) return null;
        if (user.isWalkIn) return null;
        if (user.deletedAt || user.anonymizedAt) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email.split('@')[0],
          role: user.role as 'ADMIN' | 'CLIENT' | 'SUPERADMIN',
          language: user.language,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 1 day (réduit pour limiter la fenêtre d'exposition en cas de vol de session)
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role as 'ADMIN' | 'CLIENT' | 'SUPERADMIN';
        token.language = (user as { language?: string }).language ?? 'fr';
        // Store tokenVersion at login time — used to detect password changes
        const dbUserAtLogin = await prisma.user.findUnique({
          where: { id: user.id! },
          select: { tokenVersion: true },
        });
        token.tokenVersion = dbUserAtLogin?.tokenVersion ?? 0;
      } else if (token.id) {
        // Re-fetch role and tokenVersion from DB on every token renewal
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id },
          select: { role: true, language: true, tokenVersion: true, deletedAt: true, anonymizedAt: true },
        });
        if (!dbUser) return null; // Account deleted → invalidate session
        if (dbUser.deletedAt || dbUser.anonymizedAt) return null; // Soft-deleted/anonymized → force logout
        // If tokenVersion changed (password changed/reset), reject the token
        if (dbUser.tokenVersion !== token.tokenVersion) return null;
        token.role = dbUser.role as 'ADMIN' | 'CLIENT' | 'SUPERADMIN';
        token.language = dbUser.language ?? 'fr';
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
    signIn: '/auth/login',
    error: '/auth/login',
  },
  trustHost: true,
});
