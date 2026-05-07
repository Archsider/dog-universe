// next-auth v5 : encore en beta (5.0.0-beta.31 au 2026-05-04). Pas de release GA.
// Surveille https://github.com/nextauthjs/next-auth/releases — upgrade vers 5.0.0 stable
// dès disponible. Notre code utilise déjà les API stabilisées (handlers, auth, signIn, signOut).
//
// Cette config Node étend la base Edge (auth.config.ts) avec :
//   - le provider Credentials (utilise Prisma + bcrypt)
//   - le callback jwt (hit la DB pour tokenVersion / role / TOTP)
// Le middleware Edge utilise auth.edge.ts qui ne contient AUCUNE de ces deps.
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { authConfig } from './auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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
          // Explicit select: avoids fetching columns that may not exist yet in
          // prod DB (e.g. firstName/lastName added by a pending migration). A
          // missing column in a select-all query causes Prisma to throw, which
          // NextAuth silently converts to "invalid credentials".
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            role: true,
            language: true,
            isWalkIn: true,
            deletedAt: true,
            anonymizedAt: true,
          },
        });

        if (!user) return null;
        if (user.isWalkIn) return null;
        if (user.deletedAt || user.anonymizedAt) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        // Fetch totpEnabled to signal pending 2FA
        const totpData = await prisma.user.findUnique({
          where: { id: user.id },
          select: { totpEnabled: true },
        });
        const totpPending = totpData?.totpEnabled ?? false;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email.split('@')[0],
          role: user.role as 'ADMIN' | 'CLIENT' | 'SUPERADMIN',
          language: user.language,
          totpPending,
          totpEnabled: totpPending,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role as 'ADMIN' | 'CLIENT' | 'SUPERADMIN';
        token.language = (user as { language?: string }).language ?? 'fr';
        token.totpPending = (user as { totpPending?: boolean }).totpPending ?? false;
        token.totpEnabled = (user as { totpEnabled?: boolean }).totpEnabled ?? false;
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
          select: { role: true, language: true, tokenVersion: true, deletedAt: true, anonymizedAt: true, totpEnabled: true, totpVerifiedAt: true },
        });
        if (!dbUser) return null; // Account deleted → invalidate session
        if (dbUser.deletedAt || dbUser.anonymizedAt) return null; // Soft-deleted/anonymized → force logout
        // If tokenVersion changed (password changed/reset), reject the token
        if (dbUser.tokenVersion !== token.tokenVersion) return null;
        token.role = dbUser.role as 'ADMIN' | 'CLIENT' | 'SUPERADMIN';
        token.language = dbUser.language ?? 'fr';
        token.totpEnabled = dbUser.totpEnabled;
        // Si TOTP pending mais vérifié depuis le login → clear
        if (token.totpPending && dbUser.totpVerifiedAt) {
          const issuedAt = new Date((token.iat as number) * 1000);
          if (dbUser.totpVerifiedAt > issuedAt) {
            token.totpPending = false;
          }
        }
        // Si TOTP désactivé entre-temps → clear
        if (!dbUser.totpEnabled) {
          token.totpPending = false;
        }
      }
      return token;
    },
    // session() callback inherited from authConfig (Edge-safe).
  },
});
