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
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as 'SUPERADMIN' | 'ADMIN' | 'CLIENT',
          language: user.language,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        // Fresh login
        token.id = user.id!;
        token.role = user.role as 'SUPERADMIN' | 'ADMIN' | 'CLIENT';
        token.language = (user as { language?: string }).language ?? 'fr';
      } else if (token.id) {
        // Re-read role from DB on every token refresh (role changes apply immediately)
        const fresh = await prisma.user.findUnique({
          where: { id: token.id },
          select: { role: true, language: true },
        });
        if (fresh) {
          token.role = fresh.role as 'SUPERADMIN' | 'ADMIN' | 'CLIENT';
          token.language = fresh.language ?? (token.language as string);
        }
      }
      return token;
    },
  },
});
