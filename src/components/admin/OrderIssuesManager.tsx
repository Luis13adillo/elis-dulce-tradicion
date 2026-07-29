/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrderIssues, useUpdateOrderIssueStatus } from '@/lib/hooks/useSupport';
import { toast } from 'sonner';
import { AlertCircle, Eye, CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { useReferenceImageUrl } from '@/hooks/useReferenceImageUrl';

// Issue photos are stored as private-bucket paths (reference-images bucket,
// private since 2026-07-28) — staff viewers resolve them to short-lived
// signed URLs. Legacy rows holding absolute URLs pass through unchanged.
const IssuePhoto = ({ path, index }: { path: string; index: number }) => {
  const url = useReferenceImageUrl(path);
  if (!url) {
    return <div className="w-full h-32 rounded-lg border bg-muted animate-pulse" />;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <img
        src={url}
        alt={`Issue photo ${index + 1}`}
        className="w-full h-32 object-cover rounded-lg border"
      />
    </a>
  );
};

const OrderIssuesManager = () => {
  const { t, language } = useLanguage();
  const isSpanish = language === 'es';
  const [statusFilter, setStatusFilter] = useState<'open' | 'investigating' | 'resolved' | 'closed' | 'all'>('all');
  const [selectedIssue, setSelectedIssue] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [adminResponse, setAdminResponse] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  
  const { data: issues = [], isLoading, refetch } = useOrderIssues();
  const updateStatus = useUpdateOrderIssueStatus();
  
  const filteredIssues = statusFilter === 'all' 
    ? issues 
    : issues.filter(i => i.status === statusFilter);
  
  const handleStatusChange = async (id: number, newStatus: any) => {
    try {
      await updateStatus.mutateAsync({
        id,
        status: newStatus,
        admin_response: adminResponse || undefined,
        resolution_notes: resolutionNotes || undefined,
      });
      toast.success(
        t('Estado actualizado', 'Status updated')
      );
      setShowDetails(false);
      setSelectedIssue(null);
      setAdminResponse('');
      setResolutionNotes('');
      refetch();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error(
        t('Error al actualizar el estado', 'Error updating status')
      );
    }
  };
  
  const handleViewDetails = (issue: any) => {
    setSelectedIssue(issue);
    setAdminResponse(issue.admin_response || '');
    setResolutionNotes(issue.resolution_notes || '');
    setShowDetails(true);
  };
  
  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      open: { variant: 'destructive' as const, icon: AlertCircle, label: t('Abierto', 'Open') },
      investigating: { variant: 'secondary' as const, icon: AlertTriangle, label: t('Investigando', 'Investigating') },
      resolved: { variant: 'default' as const, icon: CheckCircle2, label: t('Resuelto', 'Resolved') },
      closed: { variant: 'outline' as const, icon: XCircle, label: t('Cerrado', 'Closed') },
    };
    
    const config = variants[status] || variants.open;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant}>
        <Icon className="mr-1 h-3 w-3" />
        {config.label}
      </Badge>
    );
  };
  
  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      low: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      urgent: 'bg-red-100 text-red-800',
    };
    
    return (
      <Badge className={colors[priority] || colors.medium}>
        {t(priority.charAt(0).toUpperCase() + priority.slice(1), priority.charAt(0).toUpperCase() + priority.slice(1))}
      </Badge>
    );
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('Problemas con Pedidos', 'Order Issues')}</h2>
          <p className="text-muted-foreground">
            {t('Gestiona los problemas reportados por los clientes', 'Manage issues reported by customers')}
          </p>
        </div>
        <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('Todos', 'All')}</SelectItem>
            <SelectItem value="open">{t('Abiertos', 'Open')}</SelectItem>
            <SelectItem value="investigating">{t('Investigando', 'Investigating')}</SelectItem>
            <SelectItem value="resolved">{t('Resueltos', 'Resolved')}</SelectItem>
            <SelectItem value="closed">{t('Cerrados', 'Closed')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredIssues.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {t('No hay problemas reportados', 'No issues reported')}
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
                  <TableHead>{t('Orden', 'Order')}</TableHead>
                  <TableHead>{t('Cliente', 'Customer')}</TableHead>
                  <TableHead>{t('Categoría', 'Category')}</TableHead>
                  <TableHead>{t('Prioridad', 'Priority')}</TableHead>
                  <TableHead>{t('Estado', 'Status')}</TableHead>
                  <TableHead>{t('Acciones', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIssues.map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell>
                      {format(new Date(issue.created_at), 'MMM d, yyyy HH:mm')}
                    </TableCell>
                    <TableCell className="font-mono font-medium">{issue.order_number}</TableCell>
                    <TableCell>{issue.customer_name}</TableCell>
                    <TableCell>{issue.issue_category}</TableCell>
                    <TableCell>{getPriorityBadge(issue.priority)}</TableCell>
                    <TableCell>{getStatusBadge(issue.status)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(issue)}
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('Detalles del Problema', 'Issue Details')}</DialogTitle>
            <DialogDescription>
              {t('Revisa y gestiona este problema', 'Review and manage this issue')}
            </DialogDescription>
          </DialogHeader>
          
          {selectedIssue && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">{t('Número de Orden', 'Order Number')}</p>
                  <p className="font-mono font-bold">{selectedIssue.order_number}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">{t('Cliente', 'Customer')}</p>
                  <p>{selectedIssue.customer_name}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">{t('Email', 'Email')}</p>
                  <p>{selectedIssue.customer_email}</p>
                </div>
                {selectedIssue.customer_phone && (
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">{t('Teléfono', 'Phone')}</p>
                    <p>{selectedIssue.customer_phone}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">{t('Categoría', 'Category')}</p>
                  <p>{selectedIssue.issue_category}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">{t('Prioridad', 'Priority')}</p>
                  {getPriorityBadge(selectedIssue.priority)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">{t('Estado', 'Status')}</p>
                  {getStatusBadge(selectedIssue.status)}
                </div>
              </div>
              
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-2">{t('Descripción del Problema', 'Issue Description')}</p>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="whitespace-pre-wrap">{selectedIssue.issue_description}</p>
                </div>
              </div>
              
              {selectedIssue.photo_urls && selectedIssue.photo_urls.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-2">{t('Fotos', 'Photos')}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedIssue.photo_urls.map((path: string, index: number) => (
                      <IssuePhoto key={index} path={path} index={index} />
                    ))}
                  </div>
                </div>
              )}
              
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-2">{t('Respuesta del Admin', 'Admin Response')}</p>
                <Textarea
                  value={adminResponse}
                  onChange={(e) => setAdminResponse(e.target.value)}
                  rows={4}
                  placeholder={t('Escribe tu respuesta...', 'Write your response...')}
                />
              </div>
              
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-2">{t('Notas de Resolución', 'Resolution Notes')}</p>
                <Textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={3}
                  placeholder={t('Agregar notas de resolución...', 'Add resolution notes...')}
                />
              </div>
              
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => handleStatusChange(selectedIssue.id, 'investigating')}
                  disabled={updateStatus.isPending}
                >
                  {t('Marcar como Investigando', 'Mark as Investigating')}
                </Button>
                <Button
                  onClick={() => handleStatusChange(selectedIssue.id, 'resolved')}
                  disabled={updateStatus.isPending}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {t('Resolver', 'Resolve')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleStatusChange(selectedIssue.id, 'closed')}
                  disabled={updateStatus.isPending}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  {t('Cerrar', 'Close')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrderIssuesManager;

