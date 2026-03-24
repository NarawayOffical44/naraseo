/**
 * NextAuth.js API Route
 * Handles authentication with Google OAuth
 */

import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },

  callbacks: {
    async signIn({ user, account, profile, email, credentials }) {
      try {
        // Check if user exists in Supabase
        const { data: existingUser, error: fetchError } = await supabase
          .from('users')
          .select('*')
          .eq('email', user.email)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          console.error('Supabase fetch error:', fetchError);
          return false;
        }

        if (!existingUser) {
          // Create new user
          const { error: insertError } = await supabase
            .from('users')
            .insert([
              {
                email: user.email,
                name: user.name,
                image: user.image,
                plan: 'free', // Default to free tier
                subscription_status: 'active',
                audits_used_this_month: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }
            ]);

          if (insertError) {
            console.error('Error creating user:', insertError);
            return false;
          }

          console.log(`✅ New user created: ${user.email}`);
        }

        return true;
      } catch (error) {
        console.error('SignIn callback error:', error);
        return false;
      }
    },

    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;

        // Fetch user from Supabase to get plan info
        const { data: supabaseUser } = await supabase
          .from('users')
          .select('*')
          .eq('email', user.email)
          .single();

        if (supabaseUser) {
          token.plan = supabaseUser.plan;
          token.supabaseUserId = supabaseUser.id;
          token.auditsUsed = supabaseUser.audits_used_this_month;
        }
      }
      return token;
    },

    async session({ session, token }) {
      session.user.id = token.supabaseUserId || token.id;
      session.user.plan = token.plan || 'free';
      session.user.auditsUsed = token.auditsUsed || 0;
      return session;
    },
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  jwt: {
    secret: process.env.NEXTAUTH_SECRET,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  events: {
    async signIn({ user, account, profile, isNewUser }) {
      console.log(`🔐 User signed in: ${user.email}`);
    },

    async signOut({ token }) {
      console.log(`🔐 User signed out: ${token.email}`);
    },
  },

  debug: process.env.NODE_ENV === 'development',
});

export { handler as GET, handler as POST };
