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
      totpPending?: boolean;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'CLIENT' | 'SUPERADMIN';
    language: string;
    totpPending?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: 'ADMIN' | 'CLIENT' | 'SUPERADMIN';
    language: string;
    tokenVersion: number;
    totpPending?: boolean;
  }
}
