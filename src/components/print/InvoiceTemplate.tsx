import { forwardRef } from 'react';
import { Order } from '@/types/order';
import { format } from 'date-fns';
import { Upload, MapPin, Phone, Mail, Globe, Crown } from 'lucide-react';
import TransparentLogo from '@/assets/brand/logo.png';
import { useAuth } from '@/contexts/AuthContext';

interface InvoiceTemplateProps {
    order: Order;
}

export const InvoiceTemplate = forwardRef<HTMLDivElement, InvoiceTemplateProps>(({ order }, ref) => {
    const total = parseFloat(order.total_amount?.toString() || '0');
    const { hasRole } = useAuth();
    const isOwner = hasRole('owner');

    return (
        <div ref={ref} className="bg-white text-slate-800 p-12 font-sans w-[210mm] min-h-[297mm] mx-auto hidden print:block relative">
            <style>{`
        @media print {
          @page { margin: 0; size: A4; }
          body { -webkit-print-color-adjust: exact; }
          .print-block { display: block !important; }
        }
      `}</style>

            {/* WATERMARK */}
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none z-0">
                <img src={TransparentLogo} className="w-[80%]" />
            </div>

            {/* HEADER */}
            <div className="relative z-10 flex justify-between items-start mb-12 border-b border-amber-500/20 pb-8">
                <div className="flex items-center gap-4">
                    <img src={TransparentLogo} className="h-24 w-auto object-contain" />
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">ELI'S</h1>
                        <p className="text-amber-600 font-medium uppercase tracking-widest text-sm">Dulce Tradición</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="inline-block bg-amber-50 rounded-lg px-4 py-2 border border-amber-100">
                        <div className="text-xs text-amber-800 font-bold uppercase tracking-wider mb-1">Order #</div>
                        <div className="text-2xl font-black text-amber-600">{order.order_number}</div>
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                        {format(new Date(), 'MMMM dd, yyyy')}
                    </div>
                </div>
            </div>

            {/* INFO GRID */}
            <div className="relative z-10 grid grid-cols-2 gap-12 mb-12">
                <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Bill To</h3>
                    <div className="text-lg font-bold text-slate-900 mb-1">{order.customer_name}</div>
                    {order.recipient_name && (
                        <div className="text-sm text-slate-600 mb-1">For: <span className="font-semibold text-slate-900">{order.recipient_name}</span></div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                        <Phone className="h-3 w-3" /> {order.customer_phone}
                    </div>
                    {order.customer_email && (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Mail className="h-3 w-3" /> {order.customer_email}
                        </div>
                    )}
                    {order.delivery_address && (
                        <div className="flex items-start gap-2 text-sm text-slate-600 mt-2 p-3 bg-slate-50 rounded-lg">
                            <MapPin className="h-3 w-3 mt-1" />
                            <div>
                                <span className="font-bold text-slate-900">Delivery Address:</span><br />
                                {order.delivery_address}
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-slate-50 p-6 rounded-xl border border-slate-100">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Event Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-xs text-slate-500">Date Needed</div>
                            <div className="font-bold text-slate-900">{order.date_needed}</div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-500">Time</div>
                            <div className="font-bold text-slate-900">{order.time_needed}</div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-500">Service Type</div>
                            <div className="font-bold text-amber-600 uppercase">{order.delivery_option}</div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-500">Status</div>
                            <div className="font-bold text-slate-900 capitalize">{order.status}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* LINE ITEMS */}
            <div className="relative z-10 mb-12">
                <table className="w-full">
                    <thead>
                        <tr className="border-b-2 border-slate-100">
                            <th className="text-left py-3 text-xs font-bold text-slate-400 uppercase tracking-wider w-1/2">Item Description</th>
                            <th className="text-left py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Details</th>
                            <th className="text-right py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-b border-slate-50">
                            <td className="py-6">
                                <div className="font-bold text-lg text-slate-900">Custom Cake Order</div>
                                <div className="text-sm text-slate-500 mt-1">{order.theme} Theme</div>
                            </td>
                            <td className="py-6">
                                <div className="space-y-1 text-sm text-slate-600">
                                    <div><span className="font-medium text-slate-900">Size:</span> {order.cake_size}</div>
                                    {order.servings && (
                                        <div><span className="font-medium text-slate-900">Servings:</span> {order.servings}</div>
                                    )}
                                    {order.bread_type && (
                                        <div><span className="font-medium text-slate-900">Bread:</span> {order.bread_type}</div>
                                    )}
                                    <div><span className="font-medium text-slate-900">Flavor:</span> {order.filling}</div>
                                </div>
                            </td>
                            <td className="py-6 text-right font-bold text-slate-900">
                                ${total.toFixed(2)}
                            </td>
                        </tr>
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colSpan={2} className="pt-6 text-right text-sm font-medium text-slate-500">Subtotal</td>
                            <td className="pt-6 text-right font-bold text-slate-900">${total.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td colSpan={2} className="pt-2 text-right text-sm font-medium text-slate-500">Tax</td>
                            <td className="pt-2 text-right font-bold text-slate-900">$0.00</td>
                        </tr>
                        <tr>
                            <td colSpan={2} className="pt-4 text-right">
                                <span className="text-lg font-bold text-amber-600">Total Due</span>
                            </td>
                            <td className="pt-4 text-right">
                                <span className="text-2xl font-black text-amber-600">${total.toFixed(2)}</span>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* ALLERGIES — prominent, only when present */}
            {order.allergies && (
                <div className="relative z-10 bg-red-50 p-6 rounded-xl border-2 border-red-500 mb-6">
                    <h3 className="text-xs font-bold text-red-700 uppercase tracking-widest mb-2">⚠ Allergies</h3>
                    <p className="text-base font-bold text-red-700 uppercase whitespace-pre-wrap">
                        {order.allergies}
                    </p>
                </div>
            )}

            {/* NOTES */}
            {(order.special_instructions || order.dedication) && (
                <div className="relative z-10 bg-amber-50/50 p-6 rounded-xl border border-amber-100 mb-12">
                    <h3 className="text-xs font-bold text-amber-800 uppercase tracking-widest mb-2">Special Instructions & Dedication</h3>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                        {order.dedication && <span className="block font-medium italic mb-2">"{order.dedication}"</span>}
                        {order.special_instructions}
                    </p>
                </div>
            )}

            {/* Owner/admin only — Stripe reference for refunds & disputes */}
            {isOwner && order.payment_intent_id && (
                <div className="relative z-10 text-[11px] text-slate-400 font-mono break-all mb-6">
                    Stripe: {order.payment_intent_id}
                </div>
            )}

            {/* FOOTER */}
            <div className="relative z-10 mt-auto pt-8 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
                <div className="flex items-center gap-6">
                    <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> www.elisdulcetradicion.com</span>
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> (555) 123-4567</span>
                </div>
                <div>
                    Printed on {format(new Date(), 'MM/dd/yyyy HH:mm')}
                </div>
            </div>
        </div>
    );
});

InvoiceTemplate.displayName = 'InvoiceTemplate';
