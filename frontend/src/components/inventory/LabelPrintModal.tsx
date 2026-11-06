import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Printer } from 'lucide-react';
import { Modal, Button, Input } from '@/components/ui';
import { printProductLabels } from '@/utils/labelPrint';
import { LABEL_DPI, LABEL_HEIGHT_MM, LABEL_WIDTH_MM } from '@/utils/barcode';
import { formatCurrency } from '@/utils';
import type { Product } from '@/types';
import { useTranslation } from '@/i18n';

interface LabelPrintModalProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}

function getItemCode(product: Product): string {
  return product.aluCode || product.sku || product.barcode;
}

export default function LabelPrintModal({ product, open, onClose }: LabelPrintModalProps) {
  const { t } = useTranslation();
  const [copies, setCopies] = useState(1);
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!open || !product || !barcodeRef.current) return;
    const code = getItemCode(product);
    try {
      JsBarcode(barcodeRef.current, code, {
        format: 'CODE128',
        width: 1.2,
        height: 40,
        displayValue: true,
        fontSize: 12,
        margin: 4,
      });
    } catch {
      // invalid code — preview stays empty
    }
  }, [open, product]);

  if (!product) return null;

  const code = getItemCode(product);
  const showPrice = product.price > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('inventory.printLabel')}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('common.close')}</Button>
          <Button
            variant="accent"
            onClick={() => {
              printProductLabels(product, { copies });
              onClose();
            }}
          >
            <Printer className="h-4 w-4" /> {t('inventory.printNow')}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-brand-500">{t('inventory.labelPrintHint')}</p>

      <div className="mb-4 flex justify-center rounded-xl border border-dashed border-brand-200 bg-white p-4 dark:border-brand-700 dark:bg-brand-900">
        <div
          className="flex flex-col justify-between overflow-hidden border border-brand-100 bg-white text-brand-900 shadow-sm"
          style={{ width: `${LABEL_WIDTH_MM}mm`, height: `${LABEL_HEIGHT_MM}mm`, padding: '1.5mm 2mm' }}
        >
          <p className="line-clamp-2 text-[8pt] font-bold leading-tight">{product.name}</p>
          {showPrice && (
            <p className="text-[9pt] font-bold">{formatCurrency(product.price)}</p>
          )}
          <svg ref={barcodeRef} className="max-h-[11mm] w-full" />
        </div>
      </div>

      <p className="mb-3 text-center text-xs text-brand-500">
        {LABEL_WIDTH_MM}mm × {LABEL_HEIGHT_MM}mm · {LABEL_DPI} DPI · CODE128
      </p>

      <Input
        label={t('inventory.labelCopies')}
        type="number"
        min={1}
        max={99}
        value={copies}
        onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
      />

      <p className="mt-2 font-mono text-sm text-brand-600 dark:text-brand-400">{code}</p>
    </Modal>
  );
}
