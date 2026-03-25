import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';

export const authOptions: NextAuthOptions = {
  providers: [
    // ── Google OAuth ──────────────────────────────────────────────
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: 'select_account',
        },
      },
    }),

    // ── Email / Password ──────────────────────────────────────────
    CredentialsProvider({
      id: 'credentials',
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        await connectDB();

         const user = await User.findOne({
          email: credentials.email.toLowerCase().trim(),
        }).select("+password");

        if (!user) {
          throw new Error('No account found with this email');
        }

        if (user.provider !== 'credentials' || !user.password) {
          throw new Error('This email is linked to a Google account. Please sign in with Google.');
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          throw new Error('Invalid email or password');
        }

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          image: user.image ?? null,
          storageused: user.storageused,
          storagelimit: user.storagelimit,
          provider: 'credentials',
        };
      },
    }),
  ],

  // ── Callbacks ──────────────────────────────────────────────────
  callbacks: {
    async signIn({ user, account, profile }) {
      // For Google sign-ins, upsert the user in MongoDB
      if (account?.provider === 'google') {
        try {
          await connectDB();

          const email = user.email!.toLowerCase();
          const existingUser = await User.findOne({ email });

          if (existingUser) {
            // If they registered with credentials, block Google sign-in on same email
            if (existingUser.provider === 'credentials') {
              return '/auth/login?error=EmailUsedWithPassword';
            }
            // Update name/image in case they changed them
            await User.updateOne(
              { email },
              { $set: { name: user.name, image: user.image, providerId: profile?.sub } }
            );
          } else {
            // New Google user — create record
            await User.create({
              email,
              name: user.name,
              image: user.image,
              provider: 'google',
              providerId: profile?.sub,
            });
          }
        } catch (err) {
          console.error('Google signIn error:', err);
          return false;
        }
      }
      return true;
    },

    async jwt({ token, user, account }) {
      // First sign-in: attach extra fields to JWT
      if (user) {
        token.id = user.id;
        token.provider = account?.provider ?? 'credentials';
        token.storageused = (user as any).storageused ?? 0;
        token.storagelimit = (user as any).storagelimit ?? 5 * 1024 * 1024 * 1024;
      }

      // For Google: fetch storage info from DB (not in OAuth profile)
      if (account?.provider === 'google' && token.email) {
        try {
          await connectDB();
          const dbUser = await User.findOne({ email: token.email });
          if (dbUser) {
            token.id = dbUser._id.toString();
            token.storageused = dbUser.storageused;
            token.storagelimit = dbUser.storagelimit;
          }
        } catch {}
      }

      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.provider = token.provider;
        session.user.storageused = token.storageused;
        session.user.storagelimit = token.storagelimit;
      }
      return session;
    },
  },

  // ── Pages ──────────────────────────────────────────────────────
  pages: {
    signIn: '/auth/login',
    error: '/auth/login',
  },

  // ── Session ───────────────────────────────────────────────────
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },

  secret: process.env.NEXTAUTH_SECRET,

  debug: process.env.NODE_ENV === 'development',
};

export default NextAuth(authOptions);
