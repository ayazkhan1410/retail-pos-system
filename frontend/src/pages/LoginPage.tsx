import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Barcode, Eye, EyeOff, Languages, ShieldCheck, Wallet, WifiOff } from 'lucide-react';
import LanguageToggle from '@/components/layout/LanguageToggle';
import { Button, Input, BrandLogo } from '@/components/ui';
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
      navigate(homePath(useAuthStore.getState().user), { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, t('auth.failed')));
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: WifiOff, text: t('auth.featureOffline') },
    { icon: Languages, text: t('auth.featureLanguages') },
    { icon: ShieldCheck, text: t('auth.featureRoles') },
    { icon: Barcode, text: t('auth.featureBarcode') },
    { icon: Wallet, text: t('auth.featureShifts') },
  ];

  return (
    <main className="grid min-h-[100dvh] bg-white lg:grid-cols-2 dark:bg-brand-950">
      {/* Dark marketing panel — desktop */}
      <section className="relative hidden overflow-hidden bg-brand-900 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgb(var(--accent)/0.28),transparent_55%),radial-gradient(ellipse_at_90%_80%,rgb(99_91_255/0.18),transparent_50%)]" />
        <div className="pointer-events-none absolute -bottom-24 -start-16 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="pointer-events-none absolute -top-10 -end-10 h-56 w-56 rounded-full bg-white/5 blur-2xl" />

        <div className="relative z-10 flex flex-1 flex-col px-12 py-10 xl:px-16">
          <BrandLogo className="text-[22px]" markSize={30} onDark />

          <div className="mt-14 max-w-lg">
            <h2 className="text-[40px] font-semibold leading-[1.12] tracking-tight text-white">
              {t('auth.tagline')}
            </h2>
            <p className="mt-4 max-w-md text-base text-brand-300">{t('auth.panelTitle')}</p>

            <ul className="mt-10 space-y-3">
              {features.map(({ icon: Icon, text }) => (
                <li
                  key={text}
                  className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent-glow">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="pt-1.5 text-sm leading-snug text-brand-200">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Sign-in form */}
      <section className="flex flex-col px-6 py-6 sm:px-12 lg:px-14">
        <div className="flex items-center justify-between">
          <BrandLogo className="text-[22px] lg:invisible" markSize={30} />
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
                <p
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                >
                  {error}
                </p>
              )}
              <Button variant="primary" size="lg" type="submit" className="!h-11 w-full" loading={loading}>
                {t('auth.signIn')}
              </Button>
            </form>

            {/* Compact features on mobile where the dark panel is hidden */}
            <ul className="mt-10 space-y-2 lg:hidden">
              {features.slice(0, 3).map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-2.5 text-sm text-brand-600 dark:text-brand-400">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-xs text-brand-400">© {new Date().getFullYear()} Tijori POS</p>
      </section>
    </main>
  );
}
