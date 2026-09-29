import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Button } from '../components/ui/Button';
import { Field, inputClasses } from '../components/ui/FormField';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useAsync';
import AuthLayout from '../layouts/AuthLayout';
import { getErrorMessage } from '../utils/helpers';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});
type FormValues = z.infer<typeof schema>;

export const DEMO_CREDENTIALS = { email: 'demo@promptshield.local', password: 'Demo@12345' };

export default function LoginPage() {
  useDocumentTitle('Sign in');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/dashboard', { replace: true });
    } catch (error) {
      setServerError(getErrorMessage(error));
    }
  });

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your prompt security workspace.">
      {params.get('expired') && (
        <div role="status" className="mb-5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          Your session expired. Please sign in again.
        </div>
      )}
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" htmlFor="email" error={errors.email?.message} required>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className={inputClasses}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message} required>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className={inputClasses}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
        </Field>
        {serverError && (
          <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {serverError}
          </p>
        )}
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          Sign in
        </Button>
      </form>

      <div className="mt-6 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <KeyRound className="h-4 w-4 text-accent" aria-hidden="true" /> Demo account
        </p>
        <p className="mt-1 font-mono text-xs text-slate-400">
          {DEMO_CREDENTIALS.email} / {DEMO_CREDENTIALS.password}
        </p>
        <button
          type="button"
          className="mt-2 text-xs font-medium text-accent hover:underline"
          onClick={() => {
            setValue('email', DEMO_CREDENTIALS.email, { shouldValidate: true });
            setValue('password', DEMO_CREDENTIALS.password, { shouldValidate: true });
          }}
        >
          Fill demo credentials
        </button>
        <p className="mt-1 text-[11px] text-slate-500">Available after running the seed script (development data).</p>
      </div>

      <p className="mt-6 text-center text-sm text-slate-400">
        No account yet?{' '}
        <Link to="/register" className="font-medium text-accent hover:underline">
          Create one
        </Link>
      </p>
    </AuthLayout>
  );
}
