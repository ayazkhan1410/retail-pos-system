import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Languages, ShieldCheck, WifiOff } from 'lucide-react';
import { Button, Input, BrandLogo } from '@/components/ui';
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
  const [showPassword, setShowPassword] = useState(false);
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

  const features = [
    { icon: WifiOff, text: t('auth.featureOffline') },
    { icon: Languages, text: t('auth.featureLanguages') },
    { icon: ShieldCheck, text: t('auth.featureRoles') },
  ];

  return (
    <main className="grid min-h-[100dvh] bg-white lg:grid-cols-2 dark:bg-brand-950">
      <section className="flex flex-col px-6 py-6 sm:px-12 lg:px-14">
        <div className="flex items-center justify-between">
          <BrandLogo className="text-[22px]" markSize={30} />
          <LanguageToggle compact />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[360px]">
            <h1 className="text-[26px] font-semibold tracking-tight">{t('auth.title')}</h1>
            <p className="mt-1.5 text-sm text-brand-500 dark:text-brand-400">{t('auth.subtitle')}</p>

            <form onSubmit={submit} className="mt-8 space-y-4">
              <Input
                id="email"
                label={t('auth.email')}
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10"
              />
              <div className="relative">
                <Input
                  id="password"
                  label={t('auth.password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 pe-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  aria-pressed={showPassword}
                  className="absolute bottom-1 end-1 flex h-8 w-8 items-center justify-center rounded-md text-brand-400 hover:bg-brand-100 hover:text-brand-700 focus-ring dark:hover:bg-brand-800"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  {error}
                </p>
              )}
              <Button variant="primary" size="lg" type="submit" className="!h-11 w-full" loading={loading}>{t('auth.signIn')}</Button>
            </form>
          </div>
        </div>

        <p className="text-xs text-brand-400">© {new Date().getFullYear()} Tijori POS</p>
      </section>

      <section className="relative hidden items-center justify-center overflow-hidden border-s border-brand-200 bg-brand-50 p-14 lg:flex dark:border-brand-800 dark:bg-[#0f1013]">
        <div className="w-full max-w-[480px]">
          <h2 className="text-[40px] font-semibold leading-[1.12] tracking-tight">{t('auth.tagline')}</h2>
          <p className="mt-4 max-w-md text-base text-brand-600 dark:text-brand-400">{t('auth.panelTitle')}</p>
          <ul className="mt-10 space-y-3">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 rounded-xl border border-brand-200 bg-white p-4 shadow-card dark:border-brand-800 dark:bg-brand-900">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="pt-1.5 text-sm text-brand-700 dark:text-brand-300">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
