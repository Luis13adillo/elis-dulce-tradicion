import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Users, MessageSquare, Send, Loader2, CheckCircle2, User, Mail, Phone, Heart } from 'lucide-react';
import { toast } from 'sonner';
import { useSubmitContactForm } from '@/lib/hooks/useSupport';

const EventBookingForm = () => {
    const { t } = useLanguage();
    const submitMutation = useSubmitContactForm();
    // Idempotency token: reused across retries of the same inquiry, rotated after success.
    const clientTokenRef = useRef<string>(crypto.randomUUID());

    const [isSubmitted, setIsSubmitted] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        eventType: '',
        eventDate: '',
        guestCount: '',
        message: '',
    });

    const handleInputChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!formData.name.trim() || !formData.email.trim() || !formData.eventType) {
            toast.error(t('Por favor complete todos los campos obligatorios', 'Please fill in all required fields'));
            return;
        }

        // Prepare message for contact form
        const fullMessage = `
--- Event Hosting Inquiry ---
Event Type: ${formData.eventType}
Requested Date: ${formData.eventDate || 'Not specified'}
Expected Guests: ${formData.guestCount || 'Not specified'}

Message:
${formData.message}
    `.trim();

        try {
            await submitMutation.mutateAsync({
                name: formData.name,
                email: formData.email,
                phone: formData.phone || undefined,
                subject: 'Custom Request',
                message: fullMessage,
                client_token: clientTokenRef.current,
            });
            clientTokenRef.current = crypto.randomUUID();

            setIsSubmitted(true);
            toast.success(t('¡Solicitud enviada con éxito!', 'Inquiry sent successfully!'));
        } catch (error) {
            console.error('Error submitting event inquiry:', error);
            toast.error(t('Error al enviar la solicitud. Por favor intente de nuevo.', 'Error sending inquiry. Please try again.'));
        }
    };

    if (isSubmitted) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-20 px-8 bg-white/5 backdrop-blur-3xl rounded-[3rem] border border-[#C6A649]/30 mt-12"
            >
                <div className="flex justify-center mb-8">
                    <div className="relative">
                        <div className="absolute inset-0 bg-[#C6A649] blur-2xl opacity-20 rounded-full animate-pulse" />
                        <div className="relative h-24 w-24 bg-gradient-to-br from-[#C6A649] to-amber-600 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(198,166,73,0.4)]">
                            <CheckCircle2 className="h-12 w-12 text-black" />
                        </div>
                    </div>
                </div>
                <h3 className="font-display text-4xl font-black text-white mb-6 uppercase tracking-tight">
                    {t('¡Gracias por elegirnos!', 'Thank You for Choosing Us!')}
                </h3>
                <p className="text-xl text-gray-400 font-light max-w-xl mx-auto leading-relaxed">
                    {t(
                        'Hemos recibido tu solicitud de evento. Nuestro equipo revisará los detalles y te contactará muy pronto para hacerlo realidad.',
                        'We\'ve received your event inquiry. Our team will review the details and contact you very soon to make it happen.'
                    )}
                </p>
                <Button
                    variant="outline"
                    onClick={() => setIsSubmitted(false)}
                    className="mt-12 rounded-full px-10 h-14 border-[#C6A649] text-[#C6A649] hover:bg-[#C6A649] hover:text-black transition-all font-bold"
                >
                    {t('Enviar otra solicitud', 'Send Another Inquiry')}
                </Button>
            </motion.div>
        );
    }

    return (
        <div className="mt-12 relative group">
            {/* Premium Glow Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-[#C6A649]/20 via-[#C6A649]/5 to-[#C6A649]/20 rounded-[3rem] blur-2xl opacity-50 group-hover:opacity-100 transition duration-1000" />

            <div className="relative rounded-[3rem] border border-white/10 bg-black/40 backdrop-blur-3xl p-8 md:p-16 overflow-hidden">
                {/* Background Decorative Elements */}
                <div className="absolute -right-40 -bottom-40 h-96 w-96 bg-[#C6A649]/5 rounded-full blur-[120px]" />
                <div className="absolute -left-20 -top-20 h-64 w-64 bg-[#C6A649]/5 rounded-full blur-[100px]" />

                <div className="relative z-10 grid lg:grid-cols-5 gap-16">
                    {/* Left Side: Text & Info */}
                    <div className="lg:col-span-2 space-y-8 self-center">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#C6A649]/10 border border-[#C6A649]/20 text-[#C6A649] text-xs font-black uppercase tracking-[0.2em]">
                            <Heart className="w-3 h-3 fill-current" />
                            {t('Eventos Inolvidables', 'Unforgettable Events')}
                        </div>
                        <h3 className="font-display text-4xl md:text-5xl font-black text-white uppercase tracking-tighter leading-none">
                            {t('Hagamos tu evento', 'Let\'s Host Your')} <br />
                            <span className="text-gradient-gold">{t('realidad', 'Event')}</span>
                        </h3>
                        <p className="text-lg text-gray-400 font-light leading-relaxed">
                            {t(
                                'Desde bodas íntimas hasta grandes celebraciones corporativas, Eli\'s Bakery ofrece un servicio de catering y hostelería excepcional que cautivará a tus invitados.',
                                'From intimate weddings to grand corporate celebrations, Eli\'s Bakery offers exceptional catering and hosting services that will captivate your guests.'
                            )}
                        </p>

                        <div className="space-y-6 pt-4">
                            <div className="flex items-center gap-4 group/info">
                                <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#C6A649] group-hover/info:bg-[#C6A649] group-hover/info:text-black transition-all duration-500">
                                    <CheckCircle2 className="w-6 h-6" />
                                </div>
                                <p className="text-gray-300 font-medium">{t('Servicio de catering personalizado', 'Custom catering services')}</p>
                            </div>
                            <div className="flex items-center gap-4 group/info">
                                <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#C6A649] group-hover/info:bg-[#C6A649] group-hover/info:text-black transition-all duration-500">
                                    <CheckCircle2 className="w-6 h-6" />
                                </div>
                                <p className="text-gray-300 font-medium">{t('Mesas de postres temáticas', 'Themed dessert tables')}</p>
                            </div>
                            <div className="flex items-center gap-4 group/info">
                                <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#C6A649] group-hover/info:bg-[#C6A649] group-hover/info:text-black transition-all duration-500">
                                    <CheckCircle2 className="w-6 h-6" />
                                </div>
                                <p className="text-gray-300 font-medium">{t('Atención al detalle inigualable', 'Unmatched attention to detail')}</p>
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Form */}
                    <div className="lg:col-span-3">
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="name" className="text-xs uppercase font-bold tracking-widest text-[#C6A649] ml-4">
                                        {t('Nombre Completo', 'Full Name')} *
                                    </Label>
                                    <div className="relative">
                                        <User className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 transition-colors" />
                                        <Input
                                            id="name"
                                            placeholder={t('Tu nombre', 'Your name')}
                                            required
                                            value={formData.name}
                                            onChange={(e) => handleInputChange('name', e.target.value)}
                                            className="h-16 pl-14 rounded-3xl bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#C6A649]/50 focus:ring-[#C6A649]/20 transition-all text-base"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-xs uppercase font-bold tracking-widest text-[#C6A649] ml-4">
                                        {t('Email de Contacto', 'Contact Email')} *
                                    </Label>
                                    <div className="relative">
                                        <Mail className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 transition-colors" />
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="tu@email.com"
                                            required
                                            value={formData.email}
                                            onChange={(e) => handleInputChange('email', e.target.value)}
                                            className="h-16 pl-14 rounded-3xl bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#C6A649]/50 focus:ring-[#C6A649]/20 transition-all text-base"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="phone" className="text-xs uppercase font-bold tracking-widest text-[#C6A649] ml-4">
                                        {t('Teléfono', 'Phone')}
                                    </Label>
                                    <div className="relative">
                                        <Phone className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 transition-colors" />
                                        <Input
                                            id="phone"
                                            type="tel"
                                            placeholder="(000) 000-0000"
                                            value={formData.phone}
                                            onChange={(e) => handleInputChange('phone', e.target.value)}
                                            className="h-16 pl-14 rounded-3xl bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#C6A649]/50 focus:ring-[#C6A649]/20 transition-all text-base"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="eventType" className="text-xs uppercase font-bold tracking-widest text-[#C6A649] ml-4">
                                        {t('Tipo de Evento', 'Event Type')} *
                                    </Label>
                                    <Select onValueChange={(value) => handleInputChange('eventType', value)}>
                                        <SelectTrigger className="h-16 px-6 rounded-3xl bg-white/5 border-white/10 text-white focus:border-[#C6A649]/50 focus:ring-[#C6A649]/20 transition-all text-base">
                                            <SelectValue placeholder={t('Seleccionar...', 'Select...')} />
                                        </SelectTrigger>
                                        <SelectContent className="bg-black/90 backdrop-blur-3xl border-white/10 text-white">
                                            <SelectItem value="Wedding">{t('Boda', 'Wedding')}</SelectItem>
                                            <SelectItem value="Quinceañera">{t('Quinceañera', 'Quinceañera')}</SelectItem>
                                            <SelectItem value="Corporate">{t('Corporativo', 'Corporate')}</SelectItem>
                                            <SelectItem value="Birthday">{t('Cumpleaños', 'Birthday')}</SelectItem>
                                            <SelectItem value="Other">{t('Otro', 'Other')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="eventDate" className="text-xs uppercase font-bold tracking-widest text-[#C6A649] ml-4">
                                        {t('Fecha Estimada', 'Estimated Date')}
                                    </Label>
                                    <div className="relative">
                                        <Calendar className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 transition-colors" />
                                        <Input
                                            id="eventDate"
                                            type="date"
                                            value={formData.eventDate}
                                            onChange={(e) => handleInputChange('eventDate', e.target.value)}
                                            className="h-16 pl-14 rounded-3xl bg-white/5 border-white/10 text-white focus:border-[#C6A649]/50 focus:ring-[#C6A649]/20 transition-all text-base"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="guestCount" className="text-xs uppercase font-bold tracking-widest text-[#C6A649] ml-4">
                                        {t('Número de Invitados', 'Expected Guests')}
                                    </Label>
                                    <div className="relative">
                                        <Users className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 transition-colors" />
                                        <Input
                                            id="guestCount"
                                            type="number"
                                            placeholder="20"
                                            value={formData.guestCount}
                                            onChange={(e) => handleInputChange('guestCount', e.target.value)}
                                            className="h-16 pl-14 rounded-3xl bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#C6A649]/50 focus:ring-[#C6A649]/20 transition-all text-base"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="message" className="text-xs uppercase font-bold tracking-widest text-[#C6A649] ml-4">
                                    {t('Detalles del Evento', 'Event Details')}
                                </Label>
                                <div className="relative">
                                    <MessageSquare className="absolute left-6 top-6 h-5 w-5 text-gray-500 transition-colors" />
                                    <Textarea
                                        id="message"
                                        placeholder={t('Cuéntanos más sobre lo que tienes en mente...', 'Tell us more about what you have in mind...')}
                                        rows={4}
                                        value={formData.message}
                                        onChange={(e) => handleInputChange('message', e.target.value)}
                                        className="pl-14 pt-5 rounded-[2rem] bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-[#C6A649]/50 focus:ring-[#C6A649]/20 transition-all text-base resize-none"
                                    />
                                </div>
                            </div>

                            <div className="pt-4">
                                <Button
                                    type="submit"
                                    disabled={submitMutation.isPending}
                                    className="w-full h-16 rounded-[2rem] bg-[#C6A649] text-black font-black text-xl hover:bg-white hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_40px_rgba(198,166,73,0.3)] shadow-glow"
                                >
                                    {submitMutation.isPending ? (
                                        <div className="flex items-center gap-3">
                                            <Loader2 className="h-6 w-6 animate-spin" />
                                            {t('Enviando...', 'Sending...')}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3">
                                            <Send className="h-6 w-6" />
                                            {t('Enviar Solicitud', 'Submit Inquiry')}
                                        </div>
                                    )}
                                </Button>
                                <p className="text-center text-xs text-gray-500 mt-6 font-medium italic">
                                    * {t('Responderemos a tu solicitud en un plazo de 24-48 horas hábiles.', 'We will respond to your inquiry within 24-48 business hours.')}
                                </p>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EventBookingForm;
