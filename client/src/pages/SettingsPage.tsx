import { zodResolver } from '@hookform/resolvers/zod';
import { Cpu, KeyRound, LogOut, Trash, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, Eyebrow } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Field, inputClasses } from '../components/ui/FormField';
import { Skeleton } from '../components/ui/States';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync, useDocumentTitle } from '../hooks/useAsync';
import { dashboardService } from '../services/analysisService';
import { authService } from '../services/authService';
import { formatDate } from '../utils/format';
import { getErrorMessage } from '../utils/helpers';
import { passwordSchema } from './RegisterPage';

const profileSchema = z.object({ name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80) });
const passwordFormSchema = z
  .object({ currentPassword: z.string().min(1, 'Current password is required.'), newPassword: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.newPassword === v.confirmPassword, { message: 'Passwords do not match.', path: ['confirmPassword'] });

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const { user, setUser, applySession, logout } = useAuth();
  const toast = useToast();
  const { data: system, loading: systemLoading } = useAsync(() => dashboardService.systemStatus(), []);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const profileForm = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: { name: user?.name ?? '' } });
  const passwordForm = useForm<z.infer<typeof passwordFormSchema>>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const saveProfile = profileForm.handleSubmit(async ({ name }) => {
    try {
      setUser(await authService.updateProfile(name));
      toast.success('Profile updated.');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  });

  const changePassword = passwordForm.handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      applySession(await authService.changePassword(currentPassword, newPassword));
      passwordForm.reset();
      toast.success('Password changed. Other sessions were signed out.');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  });

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await authService.deleteAccount(deletePassword);
      toast.success('Your account has been deleted.');
      logout('manual');
    } catch (error) {
      toast.error(getErrorMessage(error));
      setDeleting(false);
    }
  };

  const mode = system?.analysisMode;

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Account</Eyebrow>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Profile & Settings</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader title="Profile" icon={<UserRound className="h-4 w-4" />} subtitle={`Member since ${user ? formatDate(user.createdAt) : '-'}`} />
          <form onSubmit={saveProfile} noValidate className="mt-5 space-y-4">
            <Field label="Name" htmlFor="profile-name" error={profileForm.formState.errors.name?.message}>
              <input id="profile-name" className={inputClasses} aria-invalid={!!profileForm.formState.errors.name} {...profileForm.register('name')} />
            </Field>
            <Field label="Email" htmlFor="profile-email" hint="Email cannot be changed.">
              <input id="profile-email" className={inputClasses} value={user?.email ?? ''} disabled readOnly />
            </Field>
            <Button type="submit" loading={profileForm.formState.isSubmitting}>Save profile</Button>
          </form>
        </Card>

        <Card className="p-5">
          <CardHeader title="Change password" icon={<KeyRound className="h-4 w-4" />} subtitle="Signs out your other sessions" />
          <form onSubmit={changePassword} noValidate className="mt-5 space-y-4">
            {(
              [
                ['currentPassword', 'Current password', 'current-password'],
                ['newPassword', 'New password', 'new-password'],
                ['confirmPassword', 'Confirm new password', 'new-password'],
              ] as const
            ).map(([name, label, autoComplete]) => (
              <Field key={name} label={label} htmlFor={name} error={passwordForm.formState.errors[name]?.message}>
                <input id={name} type="password" autoComplete={autoComplete} className={inputClasses} aria-invalid={!!passwordForm.formState.errors[name]} {...passwordForm.register(name)} />
              </Field>
            ))}
            <Button type="submit" loading={passwordForm.formState.isSubmitting}>Update password</Button>
          </form>
        </Card>
      </div>

      <Card className="p-5">
        <CardHeader title="Analysis engine" icon={<Cpu className="h-4 w-4" />} subtitle="Configured on the server through environment variables" />
        {systemLoading || !system || !mode ? (
          <Skeleton className="mt-5 h-32" />
        ) : (
          <div className="mt-5 grid gap-6 lg:grid-cols-3">
            <div>
              <p className="text-sm text-slate-400">Current mode</p>
              <p className="mt-1 font-display text-xl font-semibold">Analysis Mode: {mode.label}</p>
              <p className="mt-1 text-xs text-slate-500">
                {mode.mode === 'LOCAL'
                  ? 'Deterministic local scanners. Add OPENAI_API_KEY or GEMINI_API_KEY to server/.env to enable AI Enhanced mode.'
                  : `Local scanners plus ${mode.provider} (${mode.model}). Secrets are masked before prompts are sent.`}
              </p>
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-slate-400">Providers</p>
              <p className="flex items-center justify-between">OpenAI <Badge tone={mode.providers.openai.configured ? 'success' : 'neutral'}>{mode.providers.openai.configured ? 'Configured' : 'Not configured'}</Badge></p>
              <p className="flex items-center justify-between">Gemini <Badge tone={mode.providers.gemini.configured ? 'success' : 'neutral'}>{mode.providers.gemini.configured ? 'Configured' : 'Not configured'}</Badge></p>
              <p className="flex items-center justify-between">Local scanners <Badge tone="success">Always on</Badge></p>
            </div>
            <div className="text-sm">
              <p className="text-slate-400">Scoring weights</p>
              <ul className="mt-2 space-y-1">
                {Object.entries(system.scoring.weights).map(([category, weight]) => (
                  <li key={category} className="flex justify-between text-slate-300">
                    <span>{category.replace(/_/g, ' ')}</span>
                    <span className="font-mono">{Math.round(weight * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>

      <Card className="border-rose-400/20 p-5">
        <CardHeader title="Danger zone" subtitle="Sign out or permanently delete your account and all its data." />
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={() => logout()}>Sign out</Button>
          <Button variant="danger" icon={<Trash className="h-4 w-4" />} onClick={() => setDeleteOpen(true)}>Delete account</Button>
        </div>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete your account?"
        description="This permanently deletes your prompts, versions and analyses. Enter your password to confirm."
        confirmLabel="Delete account"
        loading={deleting}
        confirmDisabled={!deletePassword}
        onConfirm={deleteAccount}
        onCancel={() => {
          setDeleteOpen(false);
          setDeletePassword('');
        }}
      >
        <label htmlFor="delete-password" className="sr-only">Password</label>
        <input id="delete-password" type="password" autoComplete="current-password" className={inputClasses} placeholder="Password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
      </ConfirmDialog>
    </div>
  );
}
