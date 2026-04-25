import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: 'ADMIN' | 'CLIENT' | 'SUPERADMIN';
      language: string;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'CLIENT' | 'SUPERADMIN';
    language: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: 'ADMIN' | 'CLIENT' | 'SUPERADMIN';
    language: string;
    tokenVersion: number;
  }
}
