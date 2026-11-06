import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui';
import { apiErrorMessage, authApi } from '@/services';
import { useTranslation } from '@/i18n';
import { ROLE_LABEL_KEYS } from '@/utils';
import type { RoleMatrix } from '@/types';

export default function RolesCard() {
  const { t } = useTranslation();
  const [matrix, setMatrix] = useState<RoleMatrix | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    authApi.roles().then(({ data }) => setMatrix(data)).catch((err) => setError(apiErrorMessage(err, t('settings.staffSaveFailed'))));
  }, [t]);

  const toggle = async (role: string, code: string, on: boolean) => {
    if (!matrix) return;
    const permissions = on ? [...matrix.roles[role], code] : matrix.roles[role].filter((item) => item !== code);
    setError('');
    try {
      const { data } = await authApi.updateRole(role, permissions);
      setMatrix(data);
    } catch (err) {
      setError(apiErrorMessage(err, t('settings.staffSaveFailed')));
    }
  };

  const roles = matrix ? Object.keys(matrix.roles) : [];

  return (
    <Card hover>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> {t('settings.rolesTitle')}</CardTitle>
          <p className="mt-0.5 text-xs text-brand-500">{t('settings.rolesHint')}</p>
        </div>
      </CardHeader>
      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
      {matrix && (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="py-2 pr-3 font-medium">{t('settings.permission')}</th>
                {roles.map((role) => (
                  <th key={role} className="px-2 py-2 text-center font-medium">{t(ROLE_LABEL_KEYS[role])}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.permissions.map((code) => (
                <tr key={code} className="border-b border-brand-50 dark:border-brand-800/40">
                  <td className="py-1.5 pr-3">{t(`perms.${code.replace('.', '_')}`)}</td>
                  {roles.map((role) => (
                    <td key={role} className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${t(ROLE_LABEL_KEYS[role])}: ${t(`perms.${code.replace('.', '_')}`)}`}
                        className="h-4 w-4 accent-accent"
                        checked={matrix.roles[role].includes(code)}
                        onChange={(e) => void toggle(role, code, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
