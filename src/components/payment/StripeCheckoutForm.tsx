import { useState } from 'react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface StripeCheckoutFormProps {
    amount: number;
    onSuccess: (paymentIntentId: string) => void;
    isProcessing?: boolean;
    // Tier A: pass pendingId so redirect-based methods (Cash App Pay, 3DS)
    // return to /order-confirmation?pendingId=X and hit the primary Tier A
    // verification path instead of the legacy fallback.
    pendingId?: string;
}

export const StripeCheckoutForm = ({ amount, onSuccess, isProcessing: externalProcessing, pendingId }: StripeCheckoutFormProps) => {
    const stripe = useStripe();
    const elements = useElements();
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [localProcessing, setLocalProcessing] = useState(false);
    const [elementReady, setElementReady] = useState(false);
    const [elementError, setElementError] = useState<string | null>(null);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!stripe || !elements) {
            return;
        }

        setLocalProcessing(true);
        setErrorMessage(null);

        // Confirm Payment. return_url is where redirect-based methods
        // (Cash App Pay, 3DS cards, Klarna, etc.) land after completing in the
        // external app/bank flow. Including pendingId here means those flows
        // hit the primary Tier A verification path on return.
        const returnUrl = pendingId
            ? `${window.location.origin}/order-confirmation?pendingId=${encodeURIComponent(pendingId)}`
            : `${window.location.origin}/order-confirmation`;
        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: returnUrl,
            },
            redirect: "if_required",
        });

        if (error) {
            setErrorMessage(error.message || 'Payment failed');
            toast.error(error.message || 'Payment failed');
            setLocalProcessing(false);
        } else if (paymentIntent && paymentIntent.status === 'succeeded') {
            onSuccess(paymentIntent.id);
        } else {
            setLocalProcessing(false);
        }
    };

    const isBusy = localProcessing || externalProcessing;

    return (
        <form onSubmit={handleSubmit} className="w-full space-y-6">
            <div className="p-1 rounded-xl">
                {!elementReady && !elementError && (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-[#C6A649]" />
                        <span className="ml-2 text-sm text-gray-400">Loading payment form...</span>
                    </div>
                )}
                {elementError && (
                    <div className="p-4 text-sm text-red-400 bg-red-500/10 rounded-lg border border-red-500/20">
                        {elementError}. Please refresh the page.
                    </div>
                )}
                <div className={!elementReady && !elementError ? 'sr-only' : ''}>
                    <PaymentElement
                        onReady={() => setElementReady(true)}
                        onLoadError={(e) => setElementError(e.error.message || 'Failed to load payment form')}
                    />
                </div>
            </div>

            {errorMessage && (
                <div className="p-3 text-sm text-red-400 bg-red-500/10 rounded-lg border border-red-500/20">
                    {errorMessage}
                </div>
            )}

            <Button
                type="submit"
                disabled={!stripe || !elementReady || isBusy}
                className="w-full h-12 text-base font-semibold bg-[#2a2a2a] hover:bg-black text-white rounded-xl shadow-lg hover:shadow-xl transition-all"
            >
                {isBusy ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                    </>
                ) : (
                    <>
                        <Lock className="mr-2 h-4 w-4" />
                        Pay ${amount.toFixed(2)}
                    </>
                )}
            </Button>

            <div className="flex justify-center items-center gap-2 text-xs text-gray-400">
                <Lock className="w-3 h-3" />
                <span>Payments secured by Stripe</span>
            </div>
        </form>
    );
};
