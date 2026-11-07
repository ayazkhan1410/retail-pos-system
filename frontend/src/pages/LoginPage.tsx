import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import LanguageToggle from '@/components/layout/LanguageToggle';
import { Button, Input, BrandMark } from '@/components/ui';
import { apiErrorMessage } from '@/services';
import { homePath, useAuthStore } from '@/store';
import { useTranslation } from '@/i18n';

/** Static illustration of the Home screen. The login page is public, so it never shows the shop's real figures. */
function PreviewCard() {
  const { t } = useTranslation();
  const path = 'M0 52 C40 48 80 44 120 40 S200 30 240 26 300 16 340 14 400 6 438 2';
  const dashed = 'M0 54 C60 52 120 48 180 44 S300 36 360 32 438 26';
  return (
    <div className="relative" aria-hidden>
      <div className="rounded-xl border border-brand-200 bg-white p-5 shadow-elevated dark:border-brand-700 dark:bg-brand-900">
        <div className="flex items-start justify-between">
          <p className="text-[13px] text-brand-500">{t('pg.login.grossToday')}</p>
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">+18.4%</span>
        </div>
        <p className="num mt-1 text-3xl font-semibold text-brand-900 dark:text-white">Rs 184,250</p>
        <svg viewBox="0 0 438 60" className="mt-4 h-16 w-full" preserveAspectRatio="none">
          <path d={dashed} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" className="text-brand-300 dark:text-brand-600" />
          <path d={path} fill="none" stroke="rgb(var(--accent))" strokeWidth="2" />
        </svg>
        <div className="mt-4 grid grid-cols-3 border-t border-brand-100 pt-3 text-sm dark:border-brand-800">
          <div><p className="text-xs text-brand-500">{t('pg.login.registers')}</p><p className="font-medium text-brand-900 dark:text-white">{t('pg.login.registersOpen')}</p></div>
          <div><p className="text-xs text-brand-500">{t('pg.home.bills')}</p><p className="num font-medium text-brand-900 dark:text-white">212</p></div>
          <div><p className="text-xs text-brand-500">{t('pg.login.khata')}</p><p className="num font-medium text-brand-900 dark:text-white">Rs 38,400</p></div>
        </div>
      </div>
      <div className="absolute -bottom-10 end-0 w-64 rounded-xl border border-brand-200 bg-white px-4 py-3 shadow-elevated dark:border-brand-700 dark:bg-brand-900">
        <p className="flex items-center gap-2 text-sm text-brand-900 dark:text-white"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{t('pg.login.alertTitle')}</p>
        <p className="ms-3.5 text-xs text-brand-500">{t('pg.login.alertBody')}</p>
      </div>
      <span className="absolute -top-3 start-4 rounded bg-brand-900 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white dark:bg-white dark:text-brand-900">{t('pg.login.example')}</span>
    </div>
  );
}

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, pinLogin, pinSignIn } = useAuthStore();
  const [mode, setMode] = useState<'password' | 'pin'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setError('');
    if (mode === 'pin') pinRef.current?.focus();
  }, [mode]);

  const finish = () => navigate(homePath(useAuthStore.getState().user), { replace: true });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (mode === 'pin') await pinLogin(pin);
      else await login(email, password);
      finish();
    } catch (err) {
      setError(apiErrorMessage(err, t('auth.failed')));
      if (mode === 'pin') setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-[100dvh] bg-white lg:grid-cols-2 dark:bg-brand-950">
      <section className="flex flex-col px-6 py-8 sm:px-14">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <BrandMark size={30} />
            <span className="text-[15px] font-semibold text-brand-900 dark:text-white">Tijori</span>
          </span>
          <LanguageToggle compact />
        </div>

        <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-12">
          {mode === 'password' ? (
            <>
              <h1 className="text-[26px] font-semibold tracking-tight text-brand-900 dark:text-white">{t('pg.login.title')}</h1>
              <p className="mt-1.5 text-[13px] text-brand-500">{t('pg.login.subtitle')}</p>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setMode('password')} className="mb-4 inline-flex w-fit items-center gap-1.5 text-sm text-brand-500 hover:text-brand-900 focus-ring dark:hover:text-white">
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('pg.login.useEmail')}
              </button>
              <h1 className="text-[26px] font-semibold tracking-tight text-brand-900 dark:text-white">{t('pg.login.pinTitle')}</h1>
              <p className="mt-1.5 text-[13px] text-brand-500">{pinSignIn ? t('pg.login.pinSubtitle') : t('pg.login.pinNotTill')}</p>
            </>
          )}

          <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
            {mode === 'password' ? (
              <>
                <Input id="email" type="email" label={t('auth.email')} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" autoFocus />
                <div className="relative">
                  <Input id="password" type={showPassword ? 'text' : 'password'} label={t('auth.password')} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((show) => !show)}
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    className="absolute end-2 top-[34px] flex h-7 w-7 items-center justify-center rounded-md text-brand-400 hover:text-brand-700 focus-ring"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </>
            ) : (
              <Input
                ref={pinRef}
                id="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                label={t('pg.login.pin')}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                className="text-center text-xl tracking-[0.5em]"
                disabled={!pinSignIn}
              />
            )}

            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={loading}
              disabled={mode === 'pin' ? !pinSignIn || pin.length < 4 : !email || !password}
            >
              {t('pg.login.signIn')}
            </Button>
          </form>

          {mode === 'password' && (
            <>
              <div className="my-6 flex items-center gap-3 text-xs text-brand-400">
                <span className="h-px flex-1 bg-brand-200 dark:bg-brand-800" />{t('pg.login.or')}<span className="h-px flex-1 bg-brand-200 dark:bg-brand-800" />
              </div>
              <Button type="button" variant="outline" size="lg" className="w-full font-medium" onClick={() => setMode('pin')}>
                {t('pg.login.pinButton')}
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center justify-between text-[13px] text-brand-400">
          <span>© {new Date().getFullYear()} Tijori</span>
          <span>{t('pg.login.worksOffline')}</span>
        </div>
      </section>

      <section className="hidden flex-col justify-center bg-brand-50 px-14 xl:px-24 lg:flex dark:bg-[#0f1013]">
        <div className="max-w-[520px]">
          <p className="text-[13px] text-brand-500">{t('pg.login.rightNow')}</p>
          <h2 className="mt-2 text-[40px] font-semibold leading-[1.15] tracking-tight text-brand-900 dark:text-white">{t('auth.tagline')}</h2>
          <div className="mt-8 pb-10">
            <PreviewCard />
          </div>
        </div>
      </section>
    </main>
  );
}
