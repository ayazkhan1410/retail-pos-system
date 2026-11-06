import { useState } from 'react';
import { Button, Input, Modal } from '@/components/ui';
import { apiErrorMessage } from '@/services';
import { useAuthStore } from '@/store';
import { useTranslation } from '@/i18n';

export default function PinSwitchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const switchPin = useAuthStore((state) => state.switchPin);
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pin.length < 4) return;
    setSaving(true);
    setError('');
    try {
      await switchPin(pin);
      setPin('');
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t('pos.pinSwitchFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      preventClose={saving}
      title={t('pos.switchCashier')}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button variant="accent" type="submit" form="pin-switch-form" loading={saving} disabled={pin.length < 4}>
            {t('pos.switchNow')}
          </Button>
        </>
      }
    >
      <form id="pin-switch-form" onSubmit={submit} className="space-y-3">
        <p className="text-sm text-brand-500">{t('pos.switchCashierHint')}</p>
        <Input
          id="pin-switch"
          label={t('pos.pin')}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}
