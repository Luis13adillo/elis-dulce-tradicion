import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Image as ImageIcon, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download,
  X,
  Maximize2
} from 'lucide-react';
import { resolveReferenceImageUrl } from '@/lib/storage';

interface ReferenceImageViewerProps {
  imagePath?: string;
  orderNumber?: string;
  theme?: string;
}

const ReferenceImageViewer = ({ 
  imagePath, 
  orderNumber,
  theme 
}: ReferenceImageViewerProps) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [imageError, setImageError] = useState(false);

  // Resolve via the shared helper (handles full URLs, absolute paths, and
  // bucket-relative storage paths; follows VITE_SUPABASE_URL).
  const imageUrl = resolveReferenceImageUrl(imagePath);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  const handleDownload = async () => {
    if (!imageUrl) return;
    
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reference-${orderNumber || 'image'}.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading image:', error);
    }
  };

  if (!imagePath) {
    return null;
  }

  return (
    <>
      {/* Thumbnail Trigger */}
      <Button
        variant="outline"
        size="sm"
        className="gap-2 h-8"
        onClick={() => setIsOpen(true)}
      >
        <ImageIcon className="h-4 w-4" />
        {t('Ver Referencia', 'View Reference')}
      </Button>

      {/* Lightbox Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                {t('Imagen de Referencia', 'Reference Image')}
                {orderNumber && (
                  <Badge variant="outline" className="ml-2">#{orderNumber}</Badge>
                )}
              </DialogTitle>
            </div>
            {theme && (
              <p className="text-sm text-muted-foreground mt-1">
                {t('Tema', 'Theme')}: {theme}
              </p>
            )}
          </DialogHeader>

          {/* Image Container */}
          <div className="flex-1 overflow-hidden bg-black/5 dark:bg-black/20 flex items-center justify-center relative">
            {imageUrl && !imageError ? (
              <div 
                className="transition-transform duration-200 ease-out"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                }}
              >
                <img
                  src={imageUrl}
                  alt={t('Imagen de referencia', 'Reference image')}
                  className="max-w-full max-h-[calc(90vh-120px)] object-contain"
                  onError={() => setImageError(true)}
                />
              </div>
            ) : (
              <div className="text-center text-muted-foreground">
                <ImageIcon className="h-16 w-16 mx-auto mb-4 opacity-30" />
                <p>{t('No se pudo cargar la imagen', 'Could not load image')}</p>
                <p className="text-xs mt-2 font-mono opacity-50">{imagePath}</p>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="px-4 py-3 border-t flex items-center justify-between flex-shrink-0 bg-background">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomOut}
                disabled={zoom <= 0.5}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm font-mono w-16 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomIn}
                disabled={zoom >= 3}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-border mx-2" />
              <Button
                variant="outline"
                size="sm"
                onClick={handleRotate}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={!imageUrl}
              >
                <Download className="h-4 w-4 mr-2" />
                {t('Descargar', 'Download')}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsOpen(false)}
              >
                {t('Cerrar', 'Close')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ReferenceImageViewer;

