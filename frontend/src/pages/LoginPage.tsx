import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Languages, ShieldCheck, Store, WifiOff } from 'lucide-react';
import { Button, Input } from '@/components/ui';
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
    <main className="grid min-h-[100dvh] bg-brand-50 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] dark:bg-brand-950">
      {/* Brand panel */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-white lg:flex xl:p-14">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-ink">
            <Store className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div className="leading-tight">
            <p className="text-base font-semibold tracking-tight">SmartShop</p>
            <p className="text-xs text-ink-muted">{t('nav.pointOfSale')}</p>
          </div>
        </div>

        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight xl:text-[2.5rem] xl:leading-[1.1]">
            {t('auth.panelTitle')}
          </h2>
          <ul className="mt-8 space-y-4">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-white/80">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10 text-accent-glow">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Receipt tear: the till's signature edge, used once here. */}
        <div aria-hidden className="pointer-events-none absolute -bottom-6 end-10 w-56 rotate-[-4deg] rounded-t-lg bg-white/[0.06] px-5 pb-10 pt-5">
          {[72, 54, 64, 40].map((width, index) => (
            <div key={index} className="mb-3 flex justify-between gap-4">
              <span className="h-2 rounded-full bg-white/15" style={{ width: `${width}%` }} />
              <span className="h-2 w-8 rounded-full bg-white/15" />
            </div>
          ))}
          <div className="mt-5 flex justify-between border-t border-dashed border-white/15 pt-4">
            <span className="h-2.5 w-14 rounded-full bg-accent-glow/50" />
            <span className="h-2.5 w-16 rounded-full bg-accent-glow/50" />
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 lg:invisible">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-white">
              <Store className="h-[18px] w-[18px]" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight">SmartShop</span>
          </div>
          <LanguageToggle compact />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-semibold tracking-tight">{t('auth.title')}</h1>
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
                className="h-11"
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
                  className="h-11 pe-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  aria-pressed={showPassword}
                  className="absolute bottom-1.5 end-1.5 flex h-8 w-8 items-center justify-center rounded-md text-brand-400 hover:bg-brand-100 hover:text-brand-700 focus-ring dark:hover:bg-brand-800"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  {error}
                </p>
              )}
              <Button variant="accent" size="lg" type="submit" className="w-full" loading={loading}>{t('auth.signIn')}</Button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
