/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useContactSubmissions, useUpdateContactSubmissionStatus } from '@/lib/hooks/useSupport';
import { useResponseTemplates } from '@/lib/hooks/useSupport';
import { toast } from 'sonner';
import { MessageCircle, Eye, CheckCircle2, XCircle, Mail, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useReferenceImageUrl } from '@/hooks/useReferenceImageUrl';

// Attachments are stored as private-bucket paths (reference-images bucket,
// private since 2026-07-28) — staff viewers resolve them to short-lived
// signed URLs. Legacy rows holding absolute URLs pass through unchanged.
const AttachmentLink = ({ path }: { path: string }) => {
  const { t } = useLanguage();
  const url = useReferenceImageUrl(path);
  if (!url) {
    return <p className="text-sm text-muted-foreground">{t('Cargando adjunto...', 'Loading attachment...')}</p>;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
      {t('Ver adjunto', 'View attachment')}
    </a>
  );
};

const ContactSubmissionsManager = () => {
  const { t, language } = useLanguage();
  const isSpanish = language === 'es';
  const [statusFilter, setStatusFilter] = useState<'new' | 'read' | 'responded' | 'resolved' | 'all'>('all');
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  
  const { data: submissions = [], isLoading, refetch } = useContactSubmissions();
  const updateStatus = useUpdateContactSubmissionStatus();
  const { data: templates = [] } = useResponseTemplates('contact');
  
  const filteredSubmissions = statusFilter === 'all' 
    ? submissions 
    : submissions.filter(s => s.status === statusFilter);
  
  const handleStatusChange = async (id: number, newStatus: any) => {
    try {
      await updateStatus.mutateAsync({
        id,
        status: newStatus,
        admin_notes: adminNotes || undefined,
      });
      toast.success(
        t('Estado actualizado', 'Status updated')
      );
      setShowDetails(false);
      setSelectedSubmission(null);
      setAdminNotes('');
      refetch();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error(
        t('Error al actualizar el estado', 'Error updating status')
      );
    }
  };
  
  const handleViewDetails = (submission: any) => {
    setSelectedSubmission(submission);
    setAdminNotes(submission.admin_notes || '');
    setShowDetails(true);
  };
  
  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id.toString() === templateId);
    if (template) {
      setAdminNotes(isSpanish ? template.body_es || template.body_en : template.body_en);
      setSelectedTemplate(templateId);
    }
  };
  
  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      new: { variant: 'default' as const, icon: MessageCircle, label: t('Nuevo', 'New') },
      read: { variant: 'secondary' as const, icon: Eye, label: t('Leído', 'Read') },
      responded: { variant: 'default' as const, icon: Mail, label: t('Respondido', 'Responded') },
      resolved: { variant: 'default' as const, icon: CheckCircle2, label: t('Resuelto', 'Resolved') },
    };
    
    const config = variants[status] || variants.new;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant}>
        <Icon className="mr-1 h-3 w-3" />
        {config.label}
      </Badge>
    );
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('Envíos de Contacto', 'Contact Submissions')}</h2>
          <p className="text-muted-foreground">
            {t('Gestiona los mensajes de contacto de los clientes', 'Manage customer contact messages')}
          </p>
        </div>
        <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('Todos', 'All')}</SelectItem>
            <SelectItem value="new">{t('Nuevos', 'New')}</SelectItem>
            <SelectItem value="read">{t('Leídos', 'Read')}</SelectItem>
            <SelectItem value="responded">{t('Respondidos', 'Responded')}</SelectItem>
            <SelectItem value="resolved">{t('Resueltos', 'Resolved')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {t('No hay envíos de contacto', 'No contact submissions')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Fecha', 'Date')}</TableHead>
                  <TableHead>{t('Nombre', 'Name')}</TableHead>
                  <TableHead>{t('Email', 'Email')}</TableHead>
                  <TableHead>{t('Asunto', 'Subject')}</TableHead>
                  <TableHead>{t('Estado', 'Status')}</TableHead>
                  <TableHead>{t('Acciones', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubmissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell>
                      {format(new Date(submission.created_at), 'MMM d, yyyy HH:mm')}
                    </TableCell>
                    <TableCell className="font-medium">{submission.name}</TableCell>
                    <TableCell>{submission.email}</TableCell>
                    <TableCell>{submission.subject}</TableCell>
                    <TableCell>{getStatusBadge(submission.status)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(submission)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        {t('Ver', 'View')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      
      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('Detalles del Envío', 'Submission Details')}</DialogTitle>
            <DialogDescription>
              {t('Revisa y gestiona este envío de contacto', 'Review and manage this contact submission')}
            </DialogDescription>
          </DialogHeader>
          
          {selectedSubmission && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">{t('Nombre', 'Name')}</p>
                  <p>{selectedSubmission.name}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">{t('Email', 'Email')}</p>
                  <p>{selectedSubmission.email}</p>
                </div>
                {selectedSubmission.phone && (
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">{t('Teléfono', 'Phone')}</p>
                    <p>{selectedSubmission.phone}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">{t('Asunto', 'Subject')}</p>
                  <p>{selectedSubmission.subject}</p>
                </div>
                {selectedSubmission.order_number && (
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">{t('Número de Orden', 'Order Number')}</p>
                    <p className="font-mono">{selectedSubmission.order_number}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">{t('Estado', 'Status')}</p>
                  {getStatusBadge(selectedSubmission.status)}
                </div>
              </div>
              
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-2">{t('Mensaje', 'Message')}</p>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="whitespace-pre-wrap">{selectedSubmission.message}</p>
                </div>
              </div>
              
              {selectedSubmission.attachment_url && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-2">{t('Adjunto', 'Attachment')}</p>
                  <AttachmentLink path={selectedSubmission.attachment_url} />
                </div>
              )}
              
              {templates.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-2">{t('Plantilla de Respuesta', 'Response Template')}</p>
                  <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('Seleccionar plantilla...', 'Select template...')} />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id.toString()}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-2">{t('Notas del Admin', 'Admin Notes')}</p>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={4}
                  placeholder={t('Agregar notas...', 'Add notes...')}
                />
              </div>
              
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => handleStatusChange(selectedSubmission.id, 'read')}
                  disabled={updateStatus.isPending}
                >
                  {t('Marcar como Leído', 'Mark as Read')}
                </Button>
                <Button
                  onClick={() => handleStatusChange(selectedSubmission.id, 'responded')}
                  disabled={updateStatus.isPending}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  {t('Marcar como Respondido', 'Mark as Responded')}
                </Button>
                <Button
                  variant="default"
                  onClick={() => handleStatusChange(selectedSubmission.id, 'resolved')}
                  disabled={updateStatus.isPending}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {t('Resolver', 'Resolve')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContactSubmissionsManager;

