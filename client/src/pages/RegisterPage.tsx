import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { Button } from '../components/ui/Button';
import { Field, inputClasses } from '../components/ui/FormField';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useDocumentTitle } from '../hooks/useAsync';
import AuthLayout from '../layouts/AuthLayout';
import { getErrorMessage } from '../utils/helpers';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be at most 128 characters.')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter.')
  .regex(/\d/, 'Password must contain at least one number.');

const schema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80),
    email: z.string().trim().email('Enter a valid email address.'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });
type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  useDocumentTitle('Create account');
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', password: '', confirmPassword: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await registerUser(values.name, values.email, values.password);
      toast.success('Account created. Welcome to Prompt Shield!');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setServerError(getErrorMessage(error));
    }
  });

  const fields: Array<{ name: keyof FormValues; label: string; type: string; autoComplete: string; hint?: string }> = [
    { name: 'name', label: 'Full name', type: 'text', autoComplete: 'name' },
    { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
    { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password', hint: 'At least 8 characters with a letter and a number.' },
    { name: 'confirmPassword', label: 'Confirm password', type: 'password', autoComplete: 'new-password' },
  ];

  return (
    <AuthLayout title="Create your account" subtitle="Start analysing prompts in Local Analysis Mode.">
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        {fields.map((field) => (
          <Field key={field.name} label={field.label} htmlFor={field.name} error={errors[field.name]?.message} hint={field.hint} required>
            <input
              id={field.name}
              type={field.type}
              autoComplete={field.autoComplete}
              className={inputClasses}
              aria-invalid={!!errors[field.name]}
              aria-describedby={errors[field.name] ? `${field.name}-error` : field.hint ? `${field.name}-hint` : undefined}
              {...register(field.name)}
            />
          </Field>
        ))}
        {serverError && (
          <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {serverError}
          </p>
        )}
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-400">
        Already registered?{' '}
        <Link to="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
