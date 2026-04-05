'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code' | 'not-found'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [linkId, setLinkId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (!data.found) {
        setStep('not-found');
      } else {
        setLinkId(data.linkId);
        setStep('code');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/resume-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, linkId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/submit/${data.token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            奕卓資本 / Capella Alpha Fund
          </h1>
          <h2 className="text-lg text-gray-600 mb-6">
            投资者信息收集系统 / Investor Information Collection
          </h2>
        </div>

        {step === 'email' && (
          <>
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-gray-700 text-sm">
                如果您已收到专属链接，请直接使用该链接。
              </p>
              <p className="text-gray-500 mt-1 text-sm">
                If you have received a unique link, please use it directly.
              </p>
            </div>

            <div className="border-t pt-6">
              <p className="text-sm font-medium text-gray-700 mb-3">
                继续之前的表单 / Resume previous submission
              </p>
              <form onSubmit={handleSendCode}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  placeholder="your@email.com"
                />
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-3 w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                >
                  {loading ? '查找中... / Searching...' : '发送验证码 / Send Code'}
                </button>
              </form>
            </div>
          </>
        )}

        {step === 'code' && (
          <form onSubmit={handleVerifyCode}>
            <p className="text-sm text-gray-600 mb-4">
              验证码已发送至 / Code sent to: <strong>{email}</strong>
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              请输入6位验证码 / Enter 6-digit code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              maxLength={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-2xl tracking-widest text-gray-900"
              placeholder="000000"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="mt-4 w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {loading ? '验证中... / Verifying...' : '验证 / Verify'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('email'); setCode(''); setError(''); }}
              className="mt-2 w-full text-gray-500 py-2 text-sm hover:text-gray-700"
            >
              返回 / Back
            </button>
          </form>
        )}

        {step === 'not-found' && (
          <div className="text-center">
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-amber-700 text-sm">
                未找到与此邮箱关联的有效链接。请使用管理员发送的专属链接。
              </p>
              <p className="text-amber-600 mt-1 text-sm">
                No active submission found for this email. Please use the unique link you received.
              </p>
            </div>
            <button
              onClick={() => { setStep('email'); setError(''); }}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              返回 / Back
            </button>
          </div>
        )}

        <div className="mt-6 pt-6 border-t text-center">
          <a href="/admin/login" className="text-sm text-gray-400 hover:text-gray-600">
            管理员登录 / Admin Login
          </a>
        </div>
      </div>
    </div>
  );
}
