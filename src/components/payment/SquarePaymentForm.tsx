/**
 * Square Payment Form Component
 * Handles card input and digital wallet payments
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { initializeSquarePayments, createCardPayment, createGooglePay, createApplePay } from '@/lib/square';

interface SquarePaymentFormProps {
  amount: number;
  onPaymentSuccess: (token: string) => void;
  onPaymentError: (error: string) => void;
  disabled?: boolean;
}

export const SquarePaymentForm = ({
  amount,
  onPaymentSuccess,
  onPaymentError,
  disabled = false,
}: SquarePaymentFormProps) => {
  const [card, setCard] = useState<any>(null);
  const [googlePay, setGooglePay] = useState<any>(null);
  const [applePay, setApplePay] = useState<any>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initSquare = async () => {
      try {
        const payments = initializeSquarePayments();

        // Initialize card payment
        const cardPayment = await createCardPayment(payments);
        setCard(cardPayment);
        
        // Mount card element
        if (cardContainerRef.current) {
          await cardPayment.attach(cardContainerRef.current);
        }

        // Initialize Google Pay if available
        try {
          const googlePayPayment = await createGooglePay(payments);
          setGooglePay(googlePayPayment);
        } catch (err) {
          console.log('Google Pay not available');
        }

        // Initialize Apple Pay if available
        try {
          const applePayPayment = await createApplePay(payments);
          setApplePay(applePayPayment);
        } catch (err) {
          console.log('Apple Pay not available');
        }

        setIsInitializing(false);
      } catch (err) {
        console.error('Error initializing Square Payments:', err);
        onPaymentError('Failed to initialize payment system');
        setIsInitializing(false);
      }
    };

    initSquare();

    // Cleanup
    return () => {
      if (card) {
        card.destroy().catch(console.error);
      }
    };
  }, []);

  const handleCardSubmit = async () => {
    if (!card || disabled) return;

    try {
      const tokenResult = await card.tokenize();
      
      if (tokenResult.status === 'OK') {
        onPaymentSuccess(tokenResult.token);
      } else {
        const error = tokenResult.errors?.[0]?.detail || 'Card tokenization failed';
        onPaymentError(error);
      }
    } catch (err: any) {
      onPaymentError(err.message || 'Payment processing failed');
    }
  };

  const handleDigitalWallet = async (wallet: any) => {
    if (!wallet || disabled) return;

    try {
      const tokenResult = await wallet.tokenize();
      
      if (tokenResult.status === 'OK') {
        onPaymentSuccess(tokenResult.token);
      } else {
        const error = tokenResult.errors?.[0]?.detail || 'Digital wallet payment failed';
        onPaymentError(error);
      }
    } catch (err: any) {
      onPaymentError(err.message || 'Digital wallet payment failed');
    }
  };

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Digital Wallets */}
      {(googlePay || applePay) && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Quick Payments</p>
          <div className="flex gap-3">
            {googlePay && (
              <button
                type="button"
                onClick={() => handleDigitalWallet(googlePay)}
                disabled={disabled}
                className="flex-1 rounded-lg border-2 border-border bg-background px-4 py-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Google Pay
              </button>
            )}
            {applePay && (
              <button
                type="button"
                onClick={() => handleDigitalWallet(applePay)}
                disabled={disabled}
                className="flex-1 rounded-lg border-2 border-border bg-background px-4 py-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Apple Pay
              </button>
            )}
          </div>
        </div>
      )}

      {/* Card Input */}
      <div className="space-y-4">
        <p className="text-sm font-medium">Credit Card</p>
        <div 
          id="card-container" 
          ref={cardContainerRef}
          className="min-h-[200px] rounded-lg border bg-background p-4"
        />
        <button
          type="button"
          onClick={handleCardSubmit}
          disabled={disabled || !card}
          className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-secondary hover:bg-primary/90 disabled:opacity-50"
        >
          Pay ${amount.toFixed(2)}
        </button>
      </div>
    </div>
  );
};
