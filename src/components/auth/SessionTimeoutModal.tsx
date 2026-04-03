import { useLanguage } from '@/contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface SessionTimeoutModalProps {
  isOpen: boolean;
  onStayLoggedIn: () => void;
  onLogOut: () => void;
  secondsRemaining: number;
}

/**
 * Non-dismissable blocking modal warning the user their session is about to expire.
 * Users can choose to stay logged in (resets timer) or sign out immediately.
 */
export function SessionTimeoutModal({
  isOpen,
  onStayLoggedIn,
  onLogOut,
  secondsRemaining,
}: SessionTimeoutModalProps) {
  const { t } = useLanguage();

  return (
    <Dialog open={isOpen} onOpenChange={() => {/* non-dismissable: do not allow close via overlay */}}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {t('Tu sesión expirará pronto', 'Your session will expire soon')}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-gray-600">
            {t(
              `Tu sesión expirará en ${secondsRemaining} segundos por inactividad.`,
              `Your session will expire in ${secondsRemaining} seconds due to inactivity.`
            )}
          </p>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-end">
          <Button variant="outline" onClick={onLogOut}>
            {t('Cerrar sesión', 'Sign Out')}
          </Button>
          <Button onClick={onStayLoggedIn}>
            {t('Seguir conectado', 'Stay Logged In')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
