/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertCircle, Upload, Send, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useSubmitOrderIssue } from '@/lib/hooks/useSupport';
import { uploadReferenceImage } from '@/lib/storage';
import { isValidImageType, isValidFileSize } from '@/lib/imageCompression';
import { api } from '@/lib/api';

const OrderIssue = () => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isSpanish = language === 'es';

  const orderNumber = searchParams.get('orderNumber') || '';

  const [order, setOrder] = useState<any>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    issue_category: 'Other' as 'Wrong order' | 'Quality issue' | 'Late delivery' | 'Other',
    issue_description: '',
  });

  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Idempotency token: stable across retries of the same report, regenerated
  // only after a successful submission — a retry can never create a duplicate.
  const clientTokenRef = useRef<string>(crypto.randomUUID());

  const submitMutation = useSubmitOrderIssue();

  // Load order details if order number is provided
  useEffect(() => {
    if (orderNumber) {
      loadOrder();
    }
  }, [orderNumber]);

  const loadOrder = async () => {
    setLoadingOrder(true);
    try {
      // Public, rate-limited lookup that returns only customer-safe fields.
      // (The old code called the staff-wide getAllOrders() here, which anon
      // customers have no permission to run — the form never rendered.)
      const foundOrder = await api.getOrderByNumber(orderNumber.trim());

      if (foundOrder) {
        setOrder(foundOrder);
      } else {
        setOrder(null);
        toast.error(
          t(
            'No se encontró una orden con ese número',
            'No order found with that number'
          )
        );
      }
    } catch (error) {
      console.error('Error loading order:', error);
      toast.error(
        t(
          'Error al cargar la orden',
          'Error loading order'
        )
      );
    } finally {
      setLoadingOrder(false);
    }
  };
  
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    // Validate files
    for (const file of files) {
      if (!isValidImageType(file)) {
        toast.error(
          t(
            'Tipo de archivo no válido. Solo se permiten imágenes.',
            'Invalid file type. Only images are allowed.'
          )
        );
        return;
      }
      
      if (!isValidFileSize(file, 5 * 1024 * 1024)) {
        toast.error(
          t(
            'El archivo es demasiado grande. Tamaño máximo: 5MB',
            'File is too large. Maximum size: 5MB'
          )
        );
        return;
      }
    }
    
    // Limit to 3 photos
    if (photos.length + files.length > 3) {
      toast.error(
        t(
          'Máximo 3 fotos permitidas',
          'Maximum 3 photos allowed'
        )
      );
      return;
    }
    
    setPhotos(prev => [...prev, ...files]);
    
    // Create previews
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };
  
  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!order) {
      toast.error(
        t(
          'Por favor ingrese un número de orden válido',
          'Please enter a valid order number'
        )
      );
      return;
    }

    if (!formData.email.trim() || !formData.email.includes('@')) {
      toast.error(
        t(
          'Ingrese el email con el que hizo el pedido',
          'Enter the email you used when placing the order'
        )
      );
      return;
    }

    if (!formData.issue_description.trim()) {
      toast.error(
        t(
          'Por favor describa el problema',
          'Please describe the issue'
        )
      );
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload photos. A failed upload ABORTS the submit — never silently
      // drop the customer's evidence photos and report success anyway.
      const photoPaths: string[] = [];
      if (photos.length > 0) {
        setIsUploading(true);
        const results = await Promise.all(
          photos.map(photo => uploadReferenceImage(photo, 'order-issues'))
        );
        setIsUploading(false);
        const failed = results.find(r => !r.success || !r.path);
        if (failed) {
          console.error('Error uploading photos:', failed.error);
          toast.error(
            t(
              'No se pudieron subir las fotos. Intente de nuevo o quítelas.',
              'Could not upload the photos. Try again or remove them.'
            )
          );
          setIsSubmitting(false);
          return;
        }
        results.forEach(r => photoPaths.push(r.path as string));
      }

      // Submit issue. The server verifies order number + email and fills in
      // the customer identity from the order row.
      const issue = await submitMutation.mutateAsync({
        order_number: order.order_number,
        email: formData.email,
        issue_category: formData.issue_category,
        issue_description: formData.issue_description,
        photo_paths: photoPaths.length > 0 ? photoPaths : undefined,
        client_token: clientTokenRef.current,
      });

      if (issue) {
        clientTokenRef.current = crypto.randomUUID();
        toast.success(
          t(
            '¡Problema reportado! Revisaremos tu caso pronto.',
            'Issue reported! We\'ll review your case soon.'
          )
        );

        // Navigate to order tracking
        setTimeout(() => {
          navigate(`/order-tracking?orderNumber=${order.order_number}`);
        }, 2000);
      }
    } catch (error: any) {
      console.error('Error submitting order issue:', error);
      const messages: Record<string, [string, string]> = {
        order_not_found_or_email_mismatch: [
          'No pudimos verificar ese email para esta orden. Use el email con el que hizo el pedido.',
          'We couldn\'t match that email to this order. Use the email you used when placing the order.',
        ],
        rate_limited: [
          'Demasiados intentos en poco tiempo. Intente de nuevo en una hora.',
          'Too many attempts in a short time. Please try again in an hour.',
        ],
        validation_failed: [
          'Revise los campos del formulario e intente nuevamente.',
          'Please check the form fields and try again.',
        ],
        network_error: [
          'Problema de conexión. Su reporte NO fue enviado — intente nuevamente.',
          'Connection problem. Your report was NOT sent — please try again.',
        ],
      };
      const known = messages[error?.message as string];
      toast.error(
        known
          ? t(known[0], known[1])
          : t(
            'Error al reportar el problema. Por favor intente nuevamente.',
            'Error reporting issue. Please try again.'
          )
      );
    } finally {
      setIsSubmitting(false);
      setIsUploading(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="pt-32 pb-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <div className="mb-12 text-center">
              <div className="mb-4 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
              </div>
              <h1 className="mb-4 font-display text-4xl font-bold text-gradient-gold md:text-5xl">
                {t('Reportar Problema con Pedido', 'Report Order Issue')}
              </h1>
              <div className="mx-auto mb-6 h-1 w-24 rounded-full bg-gradient-to-r from-primary to-accent" />
              <p className="font-sans text-lg text-muted-foreground">
                {t(
                  'Describe el problema con tu pedido y lo revisaremos lo antes posible.',
                  'Describe the issue with your order and we\'ll review it as soon as possible.'
                )}
              </p>
            </div>
            
            {/* Order Search if no order number */}
            {!orderNumber && !order && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>{t('Buscar Orden', 'Search Order')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3">
                    <Input
                      type="text"
                      placeholder={t('Número de orden', 'Order number')}
                      value={orderNumber}
                      onChange={(e) => {
                        if (e.target.value) {
                          navigate(`/order-issue?orderNumber=${e.target.value}`);
                        }
                      }}
                    />
                    <Button onClick={loadOrder} disabled={loadingOrder}>
                      {loadingOrder ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t('Buscar', 'Search')
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Order Info */}
            {order && (
              <Card className="mb-6 border-primary/20 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    <p className="font-semibold">
                      {t('Orden:', 'Order:')} <span className="font-mono">{order.order_number}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('Cliente:', 'Customer:')} {order.customer_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('Fecha:', 'Date:')} {order.date_needed} {order.time_needed}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Issue Form */}
            {order && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('Detalles del Problema', 'Issue Details')}</CardTitle>
                  <CardDescription>
                    {t(
                      'Proporciona toda la información relevante sobre el problema.',
                      'Provide all relevant information about the issue.'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <Label htmlFor="issue_email">
                        {t('Email del Pedido', 'Order Email')} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="issue_email"
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder={t(
                          'El email con el que hizo el pedido',
                          'The email you used when placing the order'
                        )}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t(
                          'Lo usamos para verificar que el pedido es tuyo.',
                          'We use this to verify the order is yours.'
                        )}
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="issue_category">
                        {t('Categoría del Problema', 'Issue Category')} <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={formData.issue_category}
                        onValueChange={(value: any) => handleInputChange('issue_category', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Wrong order">
                            {t('Pedido Incorrecto', 'Wrong Order')}
                          </SelectItem>
                          <SelectItem value="Quality issue">
                            {t('Problema de Calidad', 'Quality Issue')}
                          </SelectItem>
                          <SelectItem value="Late delivery">
                            {t('Entrega Tardía', 'Late Delivery')}
                          </SelectItem>
                          <SelectItem value="Other">
                            {t('Otro', 'Other')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label htmlFor="issue_description">
                        {t('Descripción del Problema', 'Issue Description')} <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        id="issue_description"
                        required
                        rows={6}
                        value={formData.issue_description}
                        onChange={(e) => handleInputChange('issue_description', e.target.value)}
                        placeholder={t(
                          'Describe el problema en detalle...',
                          'Describe the issue in detail...'
                        )}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="photos">
                        {t('Fotos del Problema', 'Issue Photos')} (opcional, máximo 3)
                      </Label>
                      <div className="mt-2 space-y-3">
                        <div className="flex gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading || isSubmitting || photos.length >= 3}
                          >
                            <Upload className="mr-2 h-4 w-4" />
                            {t('Agregar Fotos', 'Add Photos')}
                          </Button>
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          id="photos"
                          accept="image/*"
                          multiple
                          onChange={handleFileChange}
                          className="hidden"
                          disabled={isUploading || isSubmitting || photos.length >= 3}
                        />
                        {photoPreviews.length > 0 && (
                          <div className="grid grid-cols-3 gap-3">
                            {photoPreviews.map((preview, index) => (
                              <div key={index} className="relative">
                                <img
                                  src={preview}
                                  alt={`Preview ${index + 1}`}
                                  className="h-32 w-full rounded-lg object-cover border"
                                />
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  className="absolute top-1 right-1 h-6 w-6 p-0"
                                  onClick={() => removePhoto(index)}
                                  disabled={isUploading || isSubmitting}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        {isUploading && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('Subiendo fotos...', 'Uploading photos...')}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-3">
                      <Button
                        type="submit"
                        disabled={isSubmitting || isUploading}
                        className="flex-1"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t('Enviando...', 'Submitting...')}
                          </>
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            {t('Reportar Problema', 'Report Issue')}
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default OrderIssue;

