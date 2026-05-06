// Edge-safe NextAuth instance — instantiated once with the base config.
// Used by middleware and other Edge Runtime contexts. Calling `auth()` here
// only decodes the JWT cookie; it does NOT trigger the Prisma-backed jwt
// callback (that one lives only in auth.ts on the Node side).
import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export const { auth } = NextAuth(authConfig);
