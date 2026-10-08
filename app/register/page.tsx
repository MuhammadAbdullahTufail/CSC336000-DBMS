'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/authContext';

export default function RegisterPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'renter' | 'owner'>('renter');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { register, user, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.push('/dashboard');
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await register({
        first_name: firstName,
        last_name: lastName,
        email: email.trim(),
        password,
        phone_number: phone.trim() || undefined,
        role,
      });
      await login(email.trim(), password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-8 py-12">
      <div className="bg-white/10 border border-white/10 p-8 rounded-3xl shadow-2xl w-full max-w-md backdrop-blur-md">
        <h1 className="text-3xl font-bold mb-2 text-white">Create account</h1>
        <p className="text-gray-300 mb-6">Join GoRent as a renter or list your vehicles as an owner.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-gray-200 text-sm">First name</label>
              <input
                className="p-3 rounded-xl w-full"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block mb-1 text-gray-200 text-sm">Last name</label>
              <input
                className="p-3 rounded-xl w-full"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <label className="block mb-1 text-gray-200 text-sm">Email</label>
            <input
              type="email"
              className="p-3 rounded-xl w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block mb-1 text-gray-200 text-sm">Phone (optional)</label>
            <input
              className="p-3 rounded-xl w-full"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="block mb-1 text-gray-200 text-sm">Password</label>
            <input
              type="password"
              className="p-3 rounded-xl w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="block mb-1 text-gray-200 text-sm">I am a</label>
            <select
              className="p-3 rounded-xl w-full"
              value={role}
              onChange={(e) => setRole(e.target.value as 'renter' | 'owner')}
            >
              <option value="renter">Renter</option>
              <option value="owner">Owner</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-200 p-3 rounded-lg text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-sky-400 text-slate-950 font-bold py-3 rounded-xl hover:bg-sky-300 transition disabled:bg-gray-500"
          >
            {isLoading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-gray-300 mt-6 text-sm">
          Already have an account?{' '}
          <Link href="/login" className="text-sky-300 hover:underline font-semibold">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
