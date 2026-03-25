import NextAuth, { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      provider: string;
      storageused: number;
      storagelimit: number;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    provider: string;
    storageused: number;
    storagelimit: number;
  }
}