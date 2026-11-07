import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { Panel, Toggle } from '@/components/ui/Kit';
import { apiErrorMessage, authApi } from '@/services';
import { useTranslation } from '@/i18n';
import { ROLE_LABEL_KEYS } from '@/utils';
import type { RoleMatrix } from '@/types';

const ROLE_ORDER = ['manager', 'cashier', 'stock_keeper', 'accountant'];

/** What each role can do. Owners always have everything, so that column is shown on and locked. */
export default function RolesCard({ onInvite }: { onInvite?: () => void }) {
  const { t } = useTranslation();
  const [matrix, setMatrix] = useState<RoleMatrix | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    authApi.roles().then(({ data }) => setMatrix(data)).catch((err) => setError(apiErrorMessage(err, t('settings.staffSaveFailed'))));
  }, [t]);

  const toggle = async (role: string, code: string, on: boolean) => {
    if (!matrix) return;
    const permissions = on ? [...matrix.roles[role], code] : matrix.roles[role].filter((item) => item !== code);
    setError('');
    setBusy(`${role}:${code}`);
    try {
      const { data } = await authApi.updateRole(role, permissions);
      setMatrix(data);
    } catch (err) {
      setError(apiErrorMessage(err, t('settings.staffSaveFailed')));
    } finally {
      setBusy('');
    }
  };

  const roles = matrix ? ROLE_ORDER.filter((role) => role in matrix.roles) : [];

  return (
    <Panel
      title={t('pg.settings.staffRoles')}
      subtitle={t('pg.settings.staffRolesHint')}
      action={onInvite && <Button variant="outline" size="sm" onClick={onInvite}><Plus className="h-4 w-4" /> {t('pg.settings.invite')}</Button>}
    >
      {error && <p role="alert" className="mx-5 mb-3 text-sm text-red-600">{error}</p>}
      {matrix && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-y border-brand-100 text-[13px] text-brand-500 dark:border-brand-800">
                <th className="px-5 py-2.5 text-start font-normal">{t('settings.permission')}</th>
                <th className="px-3 py-2.5 text-center font-normal">{t(ROLE_LABEL_KEYS.owner)}</th>
                {roles.map((role) => <th key={role} className="px-3 py-2.5 text-center font-normal">{t(ROLE_LABEL_KEYS[role])}</th>)}
              </tr>
            </thead>
            <tbody>
              {matrix.permissions.map((code) => {
                const label = t(`perms.${code.replace('.', '_')}`);
                return (
                  <tr key={code} className="border-b border-brand-100 last:border-0 dark:border-brand-800">
                    <td className="px-5 py-2.5 text-brand-900 dark:text-white">{label}</td>
                    <td className="px-3 py-2.5 text-center"><span className="inline-flex"><Toggle checked disabled label={`${t(ROLE_LABEL_KEYS.owner)}: ${label}`} onChange={() => undefined} /></span></td>
                    {roles.map((role) => (
                      <td key={role} className="px-3 py-2.5 text-center">
                        <span className="inline-flex">
                          <Toggle
                            checked={matrix.roles[role].includes(code)}
                            disabled={busy === `${role}:${code}`}
                            label={`${t(ROLE_LABEL_KEYS[role])}: ${label}`}
                            onChange={(on) => void toggle(role, code, on)}
                          />
                        </span>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
