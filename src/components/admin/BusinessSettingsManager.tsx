/**
 * Business Settings Management Component
 * Admin UI for managing business configuration
 */

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useBusinessSettings, useUpdateBusinessSettings } from '@/lib/hooks/useCMS';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Save, Loader2 } from 'lucide-react';
import type { BusinessSettings } from '@/lib/cms';
import { supabase } from '@/lib/supabase';

export function BusinessSettingsManager() {
  const { t, language } = useLanguage();
  const isSpanish = language === 'es';
  const { data: settings, isLoading } = useBusinessSettings();
  const updateMutation = useUpdateBusinessSettings();

  const [formData, setFormData] = useState<Partial<BusinessSettings>>({});

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // FIX-06: If new capacity value is set, warn if it's below today's order count
    if (formData.max_daily_capacity !== undefined && supabase) {
      const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('date_needed', today)
        .neq('status', 'cancelled');

      if (count !== null && formData.max_daily_capacity < count) {
        // Non-blocking warning — show toast but continue with save
        toast.warning(
          isSpanish
            ? `Advertencia: Hay ${count} pedidos para hoy. La nueva capacidad (${formData.max_daily_capacity}) es menor que los pedidos actuales.`
            : `Warning: There are ${count} orders for today. New capacity (${formData.max_daily_capacity}) is below current order count.`
        );
        // Do NOT return — allow save to proceed
      }
    }

    try {
      await updateMutation.mutateAsync(formData);
      // Show targeted "Daily capacity updated" message if capacity field changed
      const capacityChanged = settings?.max_daily_capacity !== formData.max_daily_capacity;
      if (capacityChanged) {
        toast.success('Daily capacity updated');
      } else {
        toast.success(
          isSpanish ? 'Configuración guardada exitosamente' : 'Settings saved successfully'
        );
      }
    } catch (error) {
      toast.error(
        isSpanish ? 'Error al guardar configuración' : 'Error saving settings'
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general">
            {isSpanish ? 'General' : 'General'}
          </TabsTrigger>
          <TabsTrigger value="location">
            {isSpanish ? 'Ubicación' : 'Location'}
          </TabsTrigger>
          <TabsTrigger value="orders">
            {isSpanish ? 'Pedidos' : 'Orders'}
          </TabsTrigger>
          <TabsTrigger value="about">
            {isSpanish ? 'Sobre Nosotros' : 'About Us'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{isSpanish ? 'Información General' : 'General Information'}</CardTitle>
              <CardDescription>
                {isSpanish
                  ? 'Configura la información básica de tu negocio'
                  : 'Configure your business basic information'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="business_name">
                  {isSpanish ? 'Nombre del Negocio (Inglés)' : 'Business Name (English)'}
                </Label>
                <Input
                  id="business_name"
                  value={formData.business_name || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, business_name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="business_name_es">
                  {isSpanish ? 'Nombre del Negocio (Español)' : 'Business Name (Spanish)'}
                </Label>
                <Input
                  id="business_name_es"
                  value={formData.business_name_es || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, business_name_es: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tagline">
                  {isSpanish ? 'Eslogan (Inglés)' : 'Tagline (English)'}
                </Label>
                <Input
                  id="tagline"
                  value={formData.tagline || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, tagline: e.target.value })
                  }
                  placeholder={isSpanish ? 'Ej: Sabores que Celebran la Vida' : 'E.g., Flavors that Celebrate Life'}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tagline_es">
                  {isSpanish ? 'Eslogan (Español)' : 'Tagline (Spanish)'}
                </Label>
                <Input
                  id="tagline_es"
                  value={formData.tagline_es || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, tagline_es: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="logo_url">
                  {isSpanish ? 'URL del Logo' : 'Logo URL'}
                </Label>
                <Input
                  id="logo_url"
                  type="url"
                  value={formData.logo_url || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, logo_url: e.target.value })
                  }
                  placeholder="https://example.com/logo.png"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">
                    {isSpanish ? 'Teléfono' : 'Phone'}
                  </Label>
                  <Input
                    id="phone"
                    value={formData.phone || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">
                    {isSpanish ? 'Email' : 'Email'}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="location" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{isSpanish ? 'Ubicación y Área de Servicio' : 'Location & Service Area'}</CardTitle>
              <CardDescription>
                {isSpanish
                  ? 'Configura la dirección y el área de entrega'
                  : 'Configure address and delivery area'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address_street">
                  {isSpanish ? 'Dirección' : 'Street Address'}
                </Label>
                <Input
                  id="address_street"
                  value={formData.address_street || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, address_street: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="address_city">
                    {isSpanish ? 'Ciudad' : 'City'}
                  </Label>
                  <Input
                    id="address_city"
                    value={formData.address_city || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, address_city: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address_state">
                    {isSpanish ? 'Estado' : 'State'}
                  </Label>
                  <Input
                    id="address_state"
                    value={formData.address_state || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, address_state: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address_zip">
                    {isSpanish ? 'Código Postal' : 'ZIP Code'}
                  </Label>
                  <Input
                    id="address_zip"
                    value={formData.address_zip || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, address_zip: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="service_area_type">
                  {isSpanish ? 'Tipo de Área de Servicio' : 'Service Area Type'}
                </Label>
                <select
                  id="service_area_type"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.service_area_type || 'radius'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      service_area_type: e.target.value as 'radius' | 'zipcodes',
                    })
                  }
                >
                  <option value="radius">
                    {isSpanish ? 'Radio (Millas)' : 'Radius (Miles)'}
                  </option>
                  <option value="zipcodes">
                    {isSpanish ? 'Códigos Postales' : 'ZIP Codes'}
                  </option>
                </select>
              </div>

              {formData.service_area_type === 'radius' && (
                <div className="space-y-2">
                  <Label htmlFor="service_radius_miles">
                    {isSpanish ? 'Radio de Servicio (Millas)' : 'Service Radius (Miles)'}
                  </Label>
                  <Input
                    id="service_radius_miles"
                    type="number"
                    min="1"
                    value={formData.service_radius_miles || 10}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        service_radius_miles: parseInt(e.target.value) || 10,
                      })
                    }
                  />
                </div>
              )}

              {formData.service_area_type === 'zipcodes' && (
                <div className="space-y-2">
                  <Label htmlFor="service_zipcodes">
                    {isSpanish ? 'Códigos Postales (separados por comas)' : 'ZIP Codes (comma-separated)'}
                  </Label>
                  <Input
                    id="service_zipcodes"
                    value={formData.service_zipcodes?.join(', ') || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        service_zipcodes: e.target.value
                          .split(',')
                          .map((z) => z.trim())
                          .filter((z) => z),
                      })
                    }
                    placeholder="19020, 19021, 19022"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{isSpanish ? 'Configuración de Pedidos' : 'Order Settings'}</CardTitle>
              <CardDescription>
                {isSpanish
                  ? 'Configura los tiempos de anticipación para pedidos'
                  : 'Configure lead times for orders'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="minimum_lead_time_hours">
                  {isSpanish
                    ? 'Tiempo Mínimo de Anticipación (Horas)'
                    : 'Minimum Lead Time (Hours)'}
                </Label>
                <Input
                  id="minimum_lead_time_hours"
                  type="number"
                  min="1"
                  value={formData.minimum_lead_time_hours || 24}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      minimum_lead_time_hours: parseInt(e.target.value) || 24,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maximum_advance_days">
                  {isSpanish
                    ? 'Tiempo Máximo de Anticipación (Días)'
                    : 'Maximum Advance Time (Days)'}
                </Label>
                <Input
                  id="maximum_advance_days"
                  type="number"
                  min="1"
                  value={formData.maximum_advance_days || 90}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      maximum_advance_days: parseInt(e.target.value) || 90,
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{isSpanish ? 'Capacidad Diaria' : 'Daily Capacity'}</CardTitle>
              <CardDescription>
                {isSpanish
                  ? 'Número máximo de pedidos de pasteles aceptados por día'
                  : 'Maximum number of cake orders accepted per day'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="max_daily_capacity">
                  {isSpanish ? 'Máximo de Pedidos Por Día' : 'Max Orders Per Day'}
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="max_daily_capacity"
                    type="number"
                    min={1}
                    max={100}
                    value={formData.max_daily_capacity ?? 10}
                    onChange={(e) =>
                      setFormData({ ...formData, max_daily_capacity: parseInt(e.target.value, 10) || 10 })
                    }
                    className="w-24"
                  />
                  <span className="text-sm text-gray-500">
                    {isSpanish ? 'pedidos/día' : 'orders/day'}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  {isSpanish
                    ? 'El valor predeterminado es 10. El personal ve este límite en las vistas de calendario y agenda.'
                    : 'Default is 10. Staff see this limit in the calendar and schedule views.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="about" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{isSpanish ? 'Contenido Sobre Nosotros' : 'About Us Content'}</CardTitle>
              <CardDescription>
                {isSpanish
                  ? 'Escribe el contenido para la página "Sobre Nosotros"'
                  : 'Write content for the About Us page'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="about_us_content">
                  {isSpanish ? 'Contenido (Inglés)' : 'Content (English)'}
                </Label>
                <Textarea
                  id="about_us_content"
                  rows={8}
                  value={formData.about_us_content || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, about_us_content: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="about_us_content_es">
                  {isSpanish ? 'Contenido (Español)' : 'Content (Spanish)'}
                </Label>
                <Textarea
                  id="about_us_content_es"
                  rows={8}
                  value={formData.about_us_content_es || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, about_us_content_es: e.target.value })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={updateMutation.isPending}
          className="min-w-[120px]"
        >
          {updateMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isSpanish ? 'Guardando...' : 'Saving...'}
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {isSpanish ? 'Guardar' : 'Save'}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
