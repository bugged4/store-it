import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';
import NextAuth, { NextAuthOptions } from 'next-auth';

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
        console.log("Authorize function called");
  console.log("Credentials received:", credentials);

        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

     try {
  await connectDB();
} catch (err) {
  console.error("Database connection error:", err);
  throw new Error("Failed to connect to the database");
}
        const user = await User.findOne({
          email: credentials.email.toLowerCase().trim(),
        }).select('+password');

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
        };
      },
    }),
  ],

  // ── Callbacks ──────────────────────────────────────────────────
  callbacks: {
  async signIn({ user, account, profile }) {
    if (account?.provider === 'google') {
      try {
        await connectDB();

       const email = user.email?.toLowerCase();

   if (!email) {
  console.error("No email returned from Google");
  return false; // or handle differently
    }
    const existingUser = await User.findOne({ email });

        if (existingUser) {
          // 🔥 LINK ACCOUNT instead of blocking
          await User.updateOne(
            { email },
            {
              $set: {
                name: user.name,
                image: user.image,
                provider: 'google', // switch provider
                providerId: profile?.sub,
              },
            }
          );
        } else {
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
      // ── First sign-in (any provider) ──────────────────────────
      if (account && user) {
        token.provider = account.provider;

        if (account.provider === 'credentials') {
          // Credentials: all data already in the user object returned by authorize()
          token.id = user.id;
          token.storageused = (user as any).storageused ?? 0;
          token.storagelimit = (user as any).storagelimit ?? 5 * 1024 * 1024 * 1024;
        }

        if (account.provider === 'google') {
          // Google: fetch storage + _id from DB (not in OAuth profile)
          try {
            await connectDB();
            const dbUser = await User.findOne({ email: token.email });
            if (dbUser) {
              token.id = dbUser._id.toString();
              token.storageused = dbUser.storageused;
              token.storagelimit = dbUser.storagelimit;
            }
          } catch (err) {
            console.error('JWT Google DB fetch error:', err);
          }
        }
      }

      // Subsequent requests: return token as-is (no extra DB call)
      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.email = token.email as string;
        session.user.id = token.id as string;
        session.user.provider = token.provider as string;
        session.user.storageused = token.storageused as number;
        session.user.storagelimit = token.storagelimit as number;
      }
      return session;
    },
  },

  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },

  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

export default NextAuth(authOptions);