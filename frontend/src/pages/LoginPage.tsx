import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import LanguageToggle from '@/components/layout/LanguageToggle';
import { apiErrorMessage } from '@/services';
import { homePath, useAuthStore } from '@/store';
import { useTranslation } from '@/i18n';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      // Tills are shared: the next person starts at their own home, not where the last one left off.
      navigate(homePath(useAuthStore.getState().user), { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, t('auth.failed')));
      setLoading(false);
    }
  };

  return (
    <main className="page-bg flex min-h-[100dvh] items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-light shadow-glow">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <LanguageToggle />
        </div>
        <h1 className="font-display text-xl font-bold">{t('auth.title')}</h1>
        <p className="mb-5 mt-1 text-sm text-brand-500">{t('auth.subtitle')}</p>
        <form onSubmit={submit} className="space-y-4">
          <Input id="email" label={t('auth.email')} type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input id="password" label={t('auth.password')} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <Button variant="accent" size="lg" type="submit" className="w-full" loading={loading}>{t('auth.signIn')}</Button>
        </form>
      </Card>
    </main>
  );
}
