/**
 * Delivery Zone Management Component
 * Admin UI for managing delivery zones
 */

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Edit, Loader2, Truck } from 'lucide-react';

interface DeliveryZone {
  id: string;
  name: string;
  zip_codes: string[];
  base_fee: number;
  per_mile_fee: number;
  max_distance_miles: number;
  active: boolean;
}

const emptyForm = {
  name: '',
  zip_codes: '',
  base_fee: 0,
  per_mile_fee: 0,
  max_distance_miles: 0,
  active: true,
};

export function DeliveryZoneManager() {
  const { t, language } = useLanguage();
  const isSpanish = language === 'es';

  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  const fetchZones = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('delivery_zones')
      .select('*')
      .order('name');
    if (error) {
      toast.error(isSpanish ? 'Error al cargar zonas' : 'Error loading zones');
    } else {
      setZones(data ?? []);
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchZones(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openDialog = (zone?: DeliveryZone) => {
    if (zone) {
      setEditingZone(zone);
      setFormData({
        name: zone.name,
        zip_codes: zone.zip_codes.join(', '),
        base_fee: zone.base_fee,
        per_mile_fee: zone.per_mile_fee,
        max_distance_miles: zone.max_distance_miles,
        active: zone.active,
      });
    } else {
      setEditingZone(null);
      setFormData(emptyForm);
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error(isSpanish ? 'El nombre es requerido' : 'Name is required');
      return;
    }

    const zip_codes = formData.zip_codes
      .split(',')
      .map((z) => z.trim())
      .filter(Boolean);

    const payload = {
      name: formData.name.trim(),
      zip_codes,
      base_fee: Number(formData.base_fee),
      per_mile_fee: Number(formData.per_mile_fee),
      max_distance_miles: Number(formData.max_distance_miles),
      active: formData.active,
    };

    setIsSaving(true);
    let error;

    if (editingZone) {
      ({ error } = await supabase
        .from('delivery_zones')
        .update(payload)
        .eq('id', editingZone.id));
    } else {
      ({ error } = await supabase.from('delivery_zones').insert(payload));
    }

    setIsSaving(false);

    if (error) {
      toast.error(isSpanish ? 'Error al guardar' : 'Error saving zone');
    } else {
      toast.success(isSpanish ? 'Zona guardada' : 'Zone saved');
      setIsDialogOpen(false);
      fetchZones();
    }
  };

  const handleToggleActive = async (zone: DeliveryZone) => {
    const { error } = await supabase
      .from('delivery_zones')
      .update({ active: !zone.active })
      .eq('id', zone.id);

    if (error) {
      toast.error(isSpanish ? 'Error al actualizar' : 'Error updating zone');
    } else {
      setZones((prev) =>
        prev.map((z) => (z.id === zone.id ? { ...z, active: !z.active } : z))
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            {isSpanish ? 'Zonas de Entrega' : 'Delivery Zones'}
          </CardTitle>
          <Button size="sm" onClick={() => openDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            {isSpanish ? 'Nueva Zona' : 'New Zone'}
          </Button>
        </CardHeader>
        <CardContent>
          {zones.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-8">
              {isSpanish ? 'No hay zonas configuradas.' : 'No delivery zones configured.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isSpanish ? 'Nombre' : 'Name'}</TableHead>
                  <TableHead>{isSpanish ? 'Códigos Postales' : 'ZIP Codes'}</TableHead>
                  <TableHead>{isSpanish ? 'Tarifa Base' : 'Base Fee'}</TableHead>
                  <TableHead>{isSpanish ? 'Por Milla' : 'Per Mile'}</TableHead>
                  <TableHead>{isSpanish ? 'Dist. Máx.' : 'Max Dist.'}</TableHead>
                  <TableHead>{isSpanish ? 'Activa' : 'Active'}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.map((zone) => (
                  <TableRow key={zone.id}>
                    <TableCell className="font-medium">{zone.name}</TableCell>
                    <TableCell className="text-sm text-gray-500 max-w-[200px] truncate">
                      {zone.zip_codes.join(', ') || '—'}
                    </TableCell>
                    <TableCell>${Number(zone.base_fee).toFixed(2)}</TableCell>
                    <TableCell>${Number(zone.per_mile_fee).toFixed(2)}</TableCell>
                    <TableCell>{zone.max_distance_miles} mi</TableCell>
                    <TableCell>
                      <button
                        onClick={() => handleToggleActive(zone)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          zone.active ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            zone.active ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => openDialog(zone)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingZone
                ? isSpanish ? 'Editar Zona' : 'Edit Zone'
                : isSpanish ? 'Nueva Zona' : 'New Zone'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>{isSpanish ? 'Nombre' : 'Name'}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={isSpanish ? 'Ej: Centro' : 'e.g. Downtown'}
              />
            </div>

            <div className="space-y-1">
              <Label>{isSpanish ? 'Códigos Postales (separados por coma)' : 'ZIP Codes (comma-separated)'}</Label>
              <Input
                value={formData.zip_codes}
                onChange={(e) => setFormData({ ...formData, zip_codes: e.target.value })}
                placeholder="78201, 78202, 78203"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>{isSpanish ? 'Tarifa Base ($)' : 'Base Fee ($)'}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.base_fee}
                  onChange={(e) => setFormData({ ...formData, base_fee: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label>{isSpanish ? 'Por Milla ($)' : 'Per Mile ($)'}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.per_mile_fee}
                  onChange={(e) => setFormData({ ...formData, per_mile_fee: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label>{isSpanish ? 'Dist. Máx. (mi)' : 'Max Dist. (mi)'}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.max_distance_miles}
                  onChange={(e) => setFormData({ ...formData, max_distance_miles: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="zone-active"
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="zone-active">
                {isSpanish ? 'Zona activa' : 'Zone active'}
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {isSpanish ? 'Guardar' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
