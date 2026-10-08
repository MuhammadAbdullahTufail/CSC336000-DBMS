'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, user } = useAuth();
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Log in failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-8 py-12">
      <div className="bg-white/10 border border-white/10 p-8 rounded-3xl shadow-2xl w-full max-w-md backdrop-blur-md">
        <h1 className="text-4xl font-bold mb-2 text-white">Welcome back</h1>
        <p className="text-gray-300 mb-8">Log in to continue using GoRent.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block mb-2 text-gray-200">Email (your username)</label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="p-3 rounded-xl w-full placeholder-gray-500"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="block mb-2 text-gray-200">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="p-3 rounded-xl w-full placeholder-gray-500"
              placeholder="Enter your password"
              required
            />
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-200 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-sky-400 text-slate-950 font-bold py-3 rounded-xl hover:bg-sky-300 transition disabled:bg-gray-400"
          >
            {isLoading ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        <Link
          href="/register"
          className="mt-4 block w-full text-center border border-sky-400/60 text-sky-200 font-semibold py-3 rounded-xl hover:bg-white/5 transition"
        >
          Create an account
        </Link>

        <p className="text-center text-gray-300 mt-6 text-sm">
          New to GoRent?{' '}
          <Link href="/register" className="text-sky-300 hover:underline font-semibold">
            Create an account
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
