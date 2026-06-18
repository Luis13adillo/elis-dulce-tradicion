import { forwardRef } from 'react';
import { Order } from '@/types/order';
import { format } from 'date-fns';

interface ReceiptTemplateProps {
    order: Order;
}

export const ReceiptTemplate = forwardRef<HTMLDivElement, ReceiptTemplateProps>(({ order }, ref) => {
    return (
        <div ref={ref} className="bg-white text-black p-4 font-mono text-sm w-[80mm] mx-auto hidden print:block">
            <style>{`
        @media print {
          @page { margin: 0; size: 80mm auto; }
          body { -webkit-print-color-adjust: exact; }
          .print-hidden { display: none !important; }
        }
      `}</style>

            {/* HEADER */}
            <div className="text-center border-b-2 border-dashed border-black pb-4 mb-4">
                <div className="font-bold text-xl mb-1">ELI'S</div>
                <div className="text-xs uppercase tracking-widest mb-2">Dulce Tradición</div>
                <div className="text-xs">{format(new Date(), 'MM/dd/yyyy HH:mm')}</div>
                <div className="font-bold text-lg mt-2">#{order.order_number}</div>
            </div>

            {/* BIG INFO */}
            <div className="border-b border-black pb-4 mb-4">
                <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                    <span className="font-bold">DUE DATE:</span>
                    <span className="text-right">{order.date_needed}</span>
                </div>
                <div className="text-center font-bold text-2xl my-2">
                    {order.time_needed}
                </div>
                <div className="text-center font-bold border border-black p-1 uppercase">
                    {order.delivery_option === 'delivery' ? 'DELIVERY' : 'PICKUP'}
                </div>
            </div>

            {/* ALLERGIES — prominent, only when present */}
            {order.allergies && (
                <div className="border-4 border-black p-2 mb-4 text-center">
                    <div className="font-bold uppercase tracking-widest text-xs mb-1">
                        ⚠ ALLERGIES ⚠
                    </div>
                    <div className="font-bold text-base uppercase whitespace-pre-wrap break-words">
                        {order.allergies}
                    </div>
                </div>
            )}

            {/* ITEMS */}
            <div className="border-b border-black pb-4 mb-4">
                <div className="font-bold mb-2">ORDER DETAILS</div>
                <div className="flex justify-between mb-1">
                    <span>Size:</span>
                    <span className="font-bold text-right">{order.cake_size}</span>
                </div>
                {order.servings && (
                    <div className="flex justify-between mb-1">
                        <span>Servings:</span>
                        <span className="font-bold text-right">{order.servings}</span>
                    </div>
                )}
                {order.bread_type && (
                    <div className="flex justify-between mb-1">
                        <span>Bread:</span>
                        <span className="font-bold text-right">{order.bread_type}</span>
                    </div>
                )}
                <div className="flex justify-between mb-1">
                    <span>Flavor:</span>
                    <span className="font-bold text-right">{order.filling}</span>
                </div>
                {order.recipient_name && (
                    <div className="flex justify-between mb-1">
                        <span>For:</span>
                        <span className="font-bold text-right">{order.recipient_name}</span>
                    </div>
                )}
            </div>

            {/* CUSTOM */}
            <div className="border-b border-black pb-4 mb-4">
                <div className="font-bold mb-2">DESIGN / NOTES</div>
                <div className="whitespace-pre-wrap">{order.theme}</div>
                {order.dedication && (
                    <div className="mt-2 italic">"{order.dedication}"</div>
                )}
            </div>

            {/* CUSTOMER */}
            <div className="text-center border-b-2 border-dashed border-black pb-4 mb-4">
                <div className="font-bold text-lg">{order.customer_name}</div>
                <div>{order.customer_phone}</div>
                {order.delivery_address && (
                    <div className="mt-2 text-xs">{order.delivery_address}</div>
                )}
            </div>

            {/* FOOTER */}
            <div className="text-center text-xs">
                Thank you for choosing<br />Eli's Dulce Tradición
            </div>
        </div>
    );
});

ReceiptTemplate.displayName = 'ReceiptTemplate';
