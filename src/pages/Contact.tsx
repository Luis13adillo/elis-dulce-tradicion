/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef } from 'react';
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
import { MessageCircle, Upload, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useSubmitContactForm } from '@/lib/hooks/useSupport';
import { uploadReferenceImage } from '@/lib/storage';
import { isValidImageType, isValidFileSize } from '@/lib/imageCompression';

const Contact = () => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isSpanish = language === 'es';

  // Pre-fill from URL params (for order-specific help)
  const orderNumber = searchParams.get('orderNumber') || '';
  const prefillSubject = searchParams.get('subject') || '';

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: (prefillSubject || 'General') as 'General' | 'Order Issue' | 'Custom Request' | 'Feedback',
    message: '',
    honeypot: '', // Spam protection - hidden field
  });

  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Idempotency token: stable across retries of the same message (double
  // click, flaky network), regenerated only after a successful submission —
  // so a retry can never create a duplicate row.
  const clientTokenRef = useRef<string>(crypto.randomUUID());

  const submitMutation = useSubmitContactForm();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!isValidImageType(file)) {
      toast.error(
        t(
          'Tipo de archivo no válido. Solo se permiten imágenes.',
          'Invalid file type. Only images are allowed.'
        )
      );
      return;
    }

    // Validate file size (max 5MB)
    if (!isValidFileSize(file, 5 * 1024 * 1024)) {
      toast.error(
        t(
          'El archivo es demasiado grande. Tamaño máximo: 5MB',
          'File is too large. Maximum size: 5MB'
        )
      );
      return;
    }

    setAttachment(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setAttachmentPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeAttachment = () => {
    setAttachment(null);
    setAttachmentPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim()) {
      toast.error(t('Por favor ingrese su nombre', 'Please enter your name'));
      return;
    }

    if (!formData.email.trim() || !formData.email.includes('@')) {
      toast.error(t('Por favor ingrese un email válido', 'Please enter a valid email'));
      return;
    }

    if (!formData.message.trim()) {
      toast.error(t('Por favor ingrese un mensaje', 'Please enter a message'));
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload attachment if present. An upload failure ABORTS the submit —
      // never silently drop the customer's photo and pretend everything is
      // fine. They can retry or remove the attachment.
      let attachmentPath: string | undefined;
      if (attachment) {
        setIsUploading(true);
        const uploadResult = await uploadReferenceImage(attachment, 'contact-attachments');
        setIsUploading(false);
        if (!uploadResult.success || !uploadResult.path) {
          console.error('Error uploading attachment:', uploadResult.error);
          toast.error(
            t(
              'No se pudo subir la imagen. Intente de nuevo o quite el adjunto.',
              'Could not upload the image. Try again or remove the attachment.'
            )
          );
          setIsSubmitting(false);
          return;
        }
        attachmentPath = uploadResult.path;
      }

      // Submit form
      const submission = await submitMutation.mutateAsync({
        name: formData.name,
        email: formData.email,
        phone: formData.phone || undefined,
        subject: formData.subject,
        message: formData.message,
        attachment_path: attachmentPath,
        order_number: orderNumber || undefined,
        client_token: clientTokenRef.current,
        honeypot: formData.honeypot,
      });

      if (submission) {
        // Fresh token for the next (different) message.
        clientTokenRef.current = crypto.randomUUID();
        toast.success(
          t(
            '¡Mensaje enviado! Nos pondremos en contacto pronto.',
            'Message sent! We\'ll get back to you soon.'
          )
        );

        // Reset form
        setFormData({
          name: '',
          email: '',
          phone: '',
          subject: 'General',
          message: '',
          honeypot: '',
        });
        removeAttachment();

        // Navigate after a short delay
        setTimeout(() => {
          navigate('/');
        }, 2000);
      }
    } catch (error: any) {
      console.error('Error submitting contact form:', error);
      const messages: Record<string, [string, string]> = {
        rate_limited: [
          'Demasiados mensajes en poco tiempo. Intente de nuevo en una hora.',
          'Too many messages in a short time. Please try again in an hour.',
        ],
        validation_failed: [
          'Revise los campos del formulario e intente nuevamente.',
          'Please check the form fields and try again.',
        ],
        network_error: [
          'Problema de conexión. Su mensaje NO fue enviado — intente nuevamente.',
          'Connection problem. Your message was NOT sent — please try again.',
        ],
      };
      const known = messages[error?.message as string];
      toast.error(
        known
          ? t(known[0], known[1])
          : t(
            'Error al enviar el mensaje. Por favor intente nuevamente.',
            'Error sending message. Please try again.'
          )
      );
    } finally {
      setIsSubmitting(false);
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#C6A649]/30">
      <Navbar />

      <main className="pt-48 pb-32 overflow-hidden relative">
        {/* Background Glows */}
        <div className="absolute top-1/4 left-1/4 -translate-y-1/2 w-[500px] h-[500px] bg-[#C6A649]/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="mx-auto max-w-4xl text-center mb-20">
            <span className="inline-block px-4 py-1 rounded-full border border-[#C6A649]/30 bg-[#C6A649]/10 text-[#C6A649] text-sm font-bold tracking-[0.2em] uppercase mb-8 animate-fade-in shadow-[0_0_20px_rgba(198,166,73,0.15)]">
              {t('Conéctate', 'Connect')}
            </span>
            <h1 className="mb-8 font-display text-5xl md:text-7xl font-black tracking-tight animate-fade-in">
              {t('Estamos', 'We are')} <span className="text-[#C6A649] drop-shadow-[0_0_15px_rgba(198,166,73,0.3)]">{t('Aquí', 'Here')}</span>
            </h1>
            <div className="mx-auto mb-10 h-1.5 w-32 rounded-full bg-gradient-to-r from-transparent via-[#C6A649] to-transparent shadow-[0_0_10px_rgba(198,166,73,0.5)]" />
            <p className="mx-auto max-w-2xl font-sans text-xl text-gray-400 font-light leading-relaxed animate-fade-in animation-delay-300">
              {t(
                '¿Tienes una pregunta sobre un pedido, un evento especial o simplemente quieres decir hola? Nos encantaría escucharte.',
                'Have a question about an order, a special event, or just want to say hi? We\'d love to hear from you.'
              )}
            </p>
          </div>

          <div className="mx-auto max-w-5xl">
            {orderNumber && (
              <div className="mb-8 relative group">
                <div className="absolute -inset-1 bg-primary/20 rounded-3xl blur-lg opacity-50 group-hover:opacity-100 transition duration-500" />
                <div className="relative rounded-2xl border border-primary/20 bg-primary/10 backdrop-blur-3xl p-6">
                  <div className="flex items-start gap-4">
                    <AlertCircle className="h-6 w-6 text-primary mt-0.5" />
                    <div>
                      <p className="font-bold text-lg text-white mb-1">
                        {t('Ayuda con tu pedido', 'Help with your order')}
                      </p>
                      <p className="text-gray-300 uppercase tracking-widest text-xs font-black">
                        {t('Orden N°: ', 'Order #: ')}
                        <span className="text-primary">{orderNumber}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-8 lg:grid-cols-5">
              {/* Contact Form Column */}
              <div className="lg:col-span-3">
                <div className="relative group h-full">
                  <div className="absolute -inset-1 bg-gradient-to-br from-[#C6A649]/20 to-transparent rounded-[2.5rem] blur-xl opacity-50 transition duration-500" />
                  <div className="relative h-full rounded-[2rem] border border-white/10 bg-white/5 backdrop-blur-2xl p-8 md:p-10 shadow-2xl">
                    <form onSubmit={handleSubmit} className="space-y-8">
                      {/* Honeypot field - hidden from users */}
                      <div className="hidden">
                        <Label htmlFor="honeypot">{t('No completar este campo', 'Do not fill this field')}</Label>
                        <Input
                          id="honeypot"
                          type="text"
                          value={formData.honeypot}
                          onChange={(e) => handleInputChange('honeypot', e.target.value)}
                          tabIndex={-1}
                          autoComplete="off"
                        />
                      </div>

                      <div className="grid gap-8 md:grid-cols-2">
                        <div className="space-y-3">
                          <Label htmlFor="name" className="text-xs font-black uppercase tracking-widest text-gray-400 pl-1">
                            {t('Nombre', 'Name')} <span className="text-[#C6A649]">*</span>
                          </Label>
                          <Input
                            id="name"
                            type="text"
                            required
                            value={formData.name}
                            onChange={(e) => handleInputChange('name', e.target.value)}
                            placeholder={t('Tu nombre completo', 'Your full name')}
                            className="h-14 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-[#C6A649] focus:ring-1 focus:ring-[#C6A649] rounded-2xl transition-all"
                          />
                        </div>

                        <div className="space-y-3">
                          <Label htmlFor="email" className="text-xs font-black uppercase tracking-widest text-gray-400 pl-1">
                            {t('Email', 'Email')} <span className="text-[#C6A649]">*</span>
                          </Label>
                          <Input
                            id="email"
                            type="email"
                            required
                            value={formData.email}
                            onChange={(e) => handleInputChange('email', e.target.value)}
                            placeholder="tu@email.com"
                            className="h-14 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-[#C6A649] focus:ring-1 focus:ring-[#C6A649] rounded-2xl transition-all"
                          />
                        </div>
                      </div>

                      <div className="grid gap-8 md:grid-cols-2">
                        <div className="space-y-3">
                          <Label htmlFor="phone" className="text-xs font-black uppercase tracking-widest text-gray-400 pl-1">
                            {t('Teléfono', 'Phone')} <span className="text-gray-600 font-medium">({t('opcional', 'optional')})</span>
                          </Label>
                          <Input
                            id="phone"
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => handleInputChange('phone', e.target.value)}
                            placeholder="(610) 910-9067"
                            className="h-14 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-[#C6A649] focus:ring-1 focus:ring-[#C6A649] rounded-2xl transition-all"
                          />
                        </div>

                        <div className="space-y-3">
                          <Label htmlFor="subject" className="text-xs font-black uppercase tracking-widest text-gray-400 pl-1">
                            {t('Asunto', 'Subject')} <span className="text-[#C6A649]">*</span>
                          </Label>
                          <Select
                            value={formData.subject}
                            onValueChange={(value: any) => handleInputChange('subject', value)}
                          >
                            <SelectTrigger className="h-14 bg-white/5 border-white/10 text-white rounded-2xl focus:border-[#C6A649] focus:ring-[#C6A649] transition-all">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-neutral-900 border-white/10 text-white">
                              <SelectItem value="General">{t('General', 'General')}</SelectItem>
                              <SelectItem value="Order Issue">{t('Problema con Pedido', 'Order Issue')}</SelectItem>
                              <SelectItem value="Custom Request">{t('Solicitud Personalizada', 'Custom Request')}</SelectItem>
                              <SelectItem value="Feedback">{t('Comentarios', 'Feedback')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label htmlFor="message" className="text-xs font-black uppercase tracking-widest text-gray-400 pl-1">
                          {t('Mensaje', 'Message')} <span className="text-[#C6A649]">*</span>
                        </Label>
                        <Textarea
                          id="message"
                          required
                          rows={6}
                          value={formData.message}
                          onChange={(e) => handleInputChange('message', e.target.value)}
                          placeholder={t('Escribe tu mensaje aquí...', 'Write your message here...')}
                          className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-[#C6A649] focus:ring-1 focus:ring-[#C6A649] rounded-2xl transition-all resize-none"
                        />
                      </div>

                      <div className="space-y-4">
                        <Label className="text-xs font-black uppercase tracking-widest text-gray-400 pl-1">
                          {t('Adjuntar Imagen', 'Attach Image')} <span className="text-gray-600 font-medium">({t('opcional', 'optional')})</span>
                        </Label>
                        <div className="flex flex-col sm:flex-row gap-6 items-start">
                          <div className="relative group/upload">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isUploading || isSubmitting}
                              className="h-14 px-8 rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-[#C6A649] transition-all"
                            >
                              <Upload className="mr-3 h-5 w-5 text-[#C6A649]" />
                              {t('Seleccionar Archivo', 'Select File')}
                            </Button>
                          </div>

                          {attachmentPreview && (
                            <div className="relative group/preview">
                              <div className="absolute -inset-1 bg-[#C6A649]/20 rounded-xl blur opacity-0 group-hover/preview:opacity-100 transition duration-300" />
                              <div className="relative rounded-xl overflow-hidden border border-white/10 h-14 w-14">
                                <img
                                  src={attachmentPreview}
                                  alt="Preview"
                                  className="h-full w-full object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={removeAttachment}
                                  className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity"
                                >
                                  <AlertCircle className="h-5 w-5 text-red-500" />
                                </button>
                              </div>
                            </div>
                          )}

                          {isUploading && (
                            <div className="flex items-center gap-3 h-14 text-[#C6A649] font-bold text-sm">
                              <Loader2 className="h-5 w-5 animate-spin" />
                              {t('Subiendo...', 'Uploading...')}
                            </div>
                          )}
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          id="attachment"
                          accept="image/*"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={isSubmitting || isUploading}
                        className="w-full h-16 rounded-2xl bg-[#C6A649] text-black font-black text-lg transition-all hover:scale-[1.02] hover:bg-white hover:shadow-[0_0_30px_rgba(198,166,73,0.3)] shadow-glow disabled:opacity-50"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                            {t('Enviando...', 'Sending...')}
                          </>
                        ) : (
                          <>
                            <Send className="mr-3 h-6 w-6" />
                            {t('Enviar Mensaje', 'Send Message')}
                          </>
                        )}
                      </Button>
                    </form>
                  </div>
                </div>
              </div>

              {/* Info Column */}
              <div className="lg:col-span-2 space-y-8">
                {/* Contact Methods */}
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-br from-amber-500/10 to-transparent rounded-[2.5rem] blur-xl opacity-30 group-hover:opacity-50 transition duration-500" />
                  <div className="relative rounded-[2rem] border border-white/10 bg-white/5 backdrop-blur-2xl p-8 md:p-10 shadow-2xl h-full space-y-10">
                    <h3 className="text-2xl font-black text-white uppercase tracking-tight relative pb-4">
                      {t('Contacto Directo', 'Direct Contact')}
                      <div className="absolute bottom-0 left-0 h-1 w-12 bg-[#C6A649] rounded-full" />
                    </h3>

                    <div className="space-y-8">
                      <div className="group/item flex items-start gap-5">
                        <div className="h-12 w-12 rounded-xl bg-[#C6A649]/10 border border-[#C6A649]/20 flex items-center justify-center text-[#C6A649] group-hover/item:bg-[#C6A649] group-hover/item:text-black transition-all duration-300">
                          <MessageCircle className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-1">{t('WhatsApp / Teléfono', 'WhatsApp / Phone')}</p>
                          <a href="tel:+16102796200" className="text-xl font-bold text-white hover:text-[#C6A649] transition-colors block">(610) 279-6200</a>
                          <a href="https://wa.me/16102796200" target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-[#25D366] hover:underline mt-1 block">Chat en vivo</a>
                        </div>
                      </div>

                      <div className="group/item flex items-start gap-5">
                        <div className="h-12 w-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 group-hover/item:bg-blue-500 group-hover/item:text-white transition-all duration-300">
                          <CheckCircle2 className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-1">{t('Ubicación', 'Location')}</p>
                          <p className="text-xl font-bold text-white">324 W Marshall St</p>
                          <p className="text-gray-400">Norristown, PA 19401</p>
                        </div>
                      </div>

                      <div className="group/item flex items-start gap-5">
                        <div className="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 group-hover/item:bg-amber-500 group-hover/item:text-white transition-all duration-300">
                          <Loader2 className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-1">{t('Horario Diarios', 'Daily Hours')}</p>
                          <p className="text-xl font-bold text-white">5:00 AM - 10:00 PM</p>
                          <p className="text-[#C6A649] font-bold text-sm tracking-widest uppercase mt-1">Abierto los 365 días</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Map Card / Visual Branding */}
                <div className="relative rounded-[2rem] overflow-hidden group h-48 border border-white/10">
                  <img
                    src="/src/assets/brand/bakery-ext.png"
                    alt="Eli's Bakery Front"
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-60" />
                  <div className="absolute bottom-6 left-6 flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)] animate-pulse" />
                    <span className="text-white font-black uppercase tracking-widest text-xs">{t('Estamos Abiertos', 'We Are Open')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Contact;

