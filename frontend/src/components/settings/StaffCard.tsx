import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Users } from 'lucide-react';
import { Badge, Button, Card, CardHeader, CardTitle, Input, Modal, Select } from '@/components/ui';
import { apiErrorMessage, authApi, type UserInput } from '@/services';
import { useAuthStore } from '@/store';
import { useTranslation } from '@/i18n';
import { ROLE_LABEL_KEYS } from '@/utils';
import type { User, UserRole } from '@/types';

const emptyForm = {
  email: '', full_name: '', role: 'cashier' as UserRole, password: '', pin: '', is_active: true,
};

/** `addRequest` opens the add form whenever it changes (Settings → Staff and roles → Invite staff). */
export default function StaffCard({ addRequest = 0 }: { addRequest?: number }) {
  const { t } = useTranslation();
  const me = useAuthStore((state) => state.user);
  const [users, setUsers] = useState<User[]>([]);
  const [editing, setEditing] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    authApi.users().then(({ data }) => setUsers(data)).catch(() => setError(t('settings.staffSaveFailed')));
  }, [t]);

  useEffect(load, [load]);

  const show = (user: User | null) => {
    setEditing(user);
    setForm(user ? { ...emptyForm, email: user.email, full_name: user.full_name, role: user.role, is_active: user.is_active } : emptyForm);
    setError('');
    setOpen(true);
  };

  useEffect(() => {
    if (addRequest) show(null);
    // Only when the request number changes.
  }, [addRequest]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const { password, pin, ...rest } = form;
    const payload: UserInput = { ...rest };
    if (password) payload.password = password;
    if (pin) payload.pin = pin;
    try {
      if (editing) await authApi.updateUser(editing.id, payload);
      else await authApi.createUser(payload);
      setOpen(false);
      load();
    } catch (err) {
      setError(apiErrorMessage(err, t('settings.staffSaveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const isMe = editing?.id === me?.id;

  return (
    <Card hover>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> {t('settings.staff')}</CardTitle>
        <Button variant="accent" size="sm" onClick={() => show(null)}>
          <Plus className="h-4 w-4" /> {t('settings.addStaff')}
        </Button>
      </CardHeader>
      <div className="divide-y divide-brand-100 dark:divide-brand-800">
        {users.map((user) => (
          <div key={user.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.full_name}</p>
              <p className="truncate text-xs text-brand-500">{user.email}</p>
            </div>
            <Badge variant={user.is_active ? 'success' : 'default'}>
              {user.is_active ? t(ROLE_LABEL_KEYS[user.role]) : t('common.inactive')}
            </Badge>
            <Button variant="ghost" size="sm" aria-label={t('settings.editStaff')} onClick={() => show(user)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        preventClose={saving}
        title={editing ? t('settings.editStaff') : t('settings.addStaff')}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>{t('common.cancel')}</Button>
            <Button variant="accent" type="submit" form="staff-form" loading={saving}>{t('common.save')}</Button>
          </>
        }
      >
        <form id="staff-form" onSubmit={submit} className="space-y-3">
          <Input id="staff-name" label={t('settings.fullName')} required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <Input id="staff-email" label={t('settings.email')} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input
            id="staff-password"
            label={editing ? t('settings.newPassword') : t('settings.password')}
            type="password"
            autoComplete="new-password"
            required={!editing}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Input
            id="staff-pin"
            label={editing ? t('settings.newPin') : t('settings.pin')}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
            placeholder={editing && users.find((u) => u.id === editing.id)?.has_pin ? t('settings.pinKeep') : t('settings.pinHint')}
          />
          <Select
            id="staff-role"
            label={t('settings.role')}
            value={form.role}
            disabled={isMe}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            options={[
              ...Object.entries(ROLE_LABEL_KEYS)
                .filter(([value]) => value !== 'owner' || me?.role === 'owner')
                .map(([value, key]) => ({ value, label: t(key) })),
            ]}
          />
          {!isMe && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              {t('common.active')}
            </label>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </form>
      </Modal>
    </Card>
  );
}
