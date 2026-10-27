/**
 * Gallery Management Component
 * Admin UI for managing gallery items
 */

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  useGalleryItems,
  useCreateGalleryItem,
  useUpdateGalleryItem,
  useDeleteGalleryItem,
} from '@/lib/hooks/useCMS';
import { uploadReferenceImage } from '@/lib/storage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Loader2, Upload } from 'lucide-react';
import type { GalleryItem } from '@/lib/cms';

const GALLERY_CATEGORIES = [
  { value: 'birthday', label_en: 'Birthday', label_es: 'Cumpleaños' },
  { value: 'wedding', label_en: 'Wedding', label_es: 'Boda' },
  { value: 'quinceanera', label_en: 'Quinceañera', label_es: 'Quinceañera' },
  { value: 'custom', label_en: 'Custom', label_es: 'Personalizado' },
  { value: 'anniversary', label_en: 'Anniversary', label_es: 'Aniversario' },
  { value: 'graduation', label_en: 'Graduation', label_es: 'Graduación' },
  { value: 'other', label_en: 'Other', label_es: 'Otro' },
];

export function GalleryManager() {
  const { t, language } = useLanguage();
  const isSpanish = language === 'es';
  const { data: items = [], isLoading } = useGalleryItems();
  const createMutation = useCreateGalleryItem();
  const updateMutation = useUpdateGalleryItem();
  const deleteMutation = useDeleteGalleryItem();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    image_url: '',
    thumbnail_url: '',
    category: 'birthday',
    category_en: '',
    category_es: '',
    caption_en: '',
    caption_es: '',
    description_en: '',
    description_es: '',
    display_order: 0,
    is_active: true,
  });

  const handleOpenDialog = (item?: GalleryItem) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        image_url: item.image_url,
        thumbnail_url: item.thumbnail_url || '',
        category: item.category,
        category_en: item.category_en || '',
        category_es: item.category_es || '',
        caption_en: item.caption_en || '',
        caption_es: item.caption_es || '',
        description_en: item.description_en || '',
        description_es: item.description_es || '',
        display_order: item.display_order,
        is_active: item.is_active,
      });
    } else {
      setEditingItem(null);
      setFormData({
        image_url: '',
        thumbnail_url: '',
        category: 'birthday',
        category_en: '',
        category_es: '',
        caption_en: '',
        caption_es: '',
        description_en: '',
        description_es: '',
        display_order: items.length,
        is_active: true,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingItem(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error(
        isSpanish
          ? 'Por favor selecciona un archivo de imagen'
          : 'Please select an image file'
      );
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadReferenceImage(file, `gallery/${Date.now()}-${file.name}`);
      if (!result.success || !result.url) {
        throw new Error(result.error || 'Upload failed');
      }
      setFormData({ ...formData, image_url: result.url });
      toast.success(
        isSpanish ? 'Imagen subida exitosamente' : 'Image uploaded successfully'
      );
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error(
        isSpanish ? 'Error al subir imagen' : 'Error uploading image'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingItem) {
        await updateMutation.mutateAsync({
          id: editingItem.id,
          updates: formData,
        });
        toast.success(
          isSpanish
            ? 'Elemento actualizado exitosamente'
            : 'Item updated successfully'
        );
      } else {
        await createMutation.mutateAsync(formData);
        toast.success(
          isSpanish
            ? 'Elemento creado exitosamente'
            : 'Item created successfully'
        );
      }
      handleCloseDialog();
    } catch (error) {
      toast.error(
        isSpanish ? 'Error al guardar elemento' : 'Error saving item'
      );
    }
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        isSpanish
          ? '¿Estás seguro de que quieres eliminar este elemento?'
          : 'Are you sure you want to delete this item?'
      )
    ) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(id);
      toast.success(
        isSpanish
          ? 'Elemento eliminado exitosamente'
          : 'Item deleted successfully'
      );
    } catch (error) {
      toast.error(
        isSpanish ? 'Error al eliminar elemento' : 'Error deleting item'
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            {isSpanish ? 'Galería' : 'Gallery'}
          </h2>
          <p className="text-muted-foreground">
            {isSpanish
              ? 'Administra las imágenes de tu galería'
              : 'Manage your gallery images'}
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              {isSpanish ? 'Nueva Imagen' : 'New Image'}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingItem
                  ? isSpanish
                    ? 'Editar Elemento'
                    : 'Edit Item'
                  : isSpanish
                  ? 'Nueva Imagen'
                  : 'New Image'}
              </DialogTitle>
              <DialogDescription>
                {isSpanish
                  ? 'Sube una imagen y completa la información'
                  : 'Upload an image and complete the information'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="image_upload">
                  {isSpanish ? 'Imagen' : 'Image'}
                </Label>
                <div className="flex items-center gap-4">
                  <Input
                    id="image_upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={isUploading}
                    className="flex-1"
                  />
                  {isUploading && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                </div>
                {formData.image_url && (
                  <div className="mt-2">
                    <img
                      src={formData.image_url}
                      alt="Preview"
                      className="h-32 w-32 rounded object-cover"
                    />
                  </div>
                )}
                <Input
                  type="url"
                  placeholder={isSpanish ? 'O ingresa URL' : 'Or enter URL'}
                  value={formData.image_url}
                  onChange={(e) =>
                    setFormData({ ...formData, image_url: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">
                    {isSpanish ? 'Categoría' : 'Category'}
                  </Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) =>
                      setFormData({ ...formData, category: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GALLERY_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {isSpanish ? cat.label_es : cat.label_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="display_order">
                    {isSpanish ? 'Orden' : 'Display Order'}
                  </Label>
                  <Input
                    id="display_order"
                    type="number"
                    min="0"
                    value={formData.display_order}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        display_order: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="caption_en">
                  {isSpanish ? 'Título (Inglés)' : 'Caption (English)'}
                </Label>
                <Input
                  id="caption_en"
                  value={formData.caption_en}
                  onChange={(e) =>
                    setFormData({ ...formData, caption_en: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="caption_es">
                  {isSpanish ? 'Título (Español)' : 'Caption (Spanish)'}
                </Label>
                <Input
                  id="caption_es"
                  value={formData.caption_es}
                  onChange={(e) =>
                    setFormData({ ...formData, caption_es: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description_en">
                  {isSpanish ? 'Descripción (Inglés)' : 'Description (English)'}
                </Label>
                <Textarea
                  id="description_en"
                  rows={3}
                  value={formData.description_en}
                  onChange={(e) =>
                    setFormData({ ...formData, description_en: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description_es">
                  {isSpanish ? 'Descripción (Español)' : 'Description (Spanish)'}
                </Label>
                <Textarea
                  id="description_es"
                  rows={3}
                  value={formData.description_es}
                  onChange={(e) =>
                    setFormData({ ...formData, description_es: e.target.value })
                  }
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) =>
                    setFormData({ ...formData, is_active: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="is_active">
                  {isSpanish ? 'Activo' : 'Active'}
                </Label>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDialog}
                >
                  {isSpanish ? 'Cancelar' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createMutation.isPending ||
                    updateMutation.isPending ||
                    !formData.image_url
                  }
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isSpanish ? 'Guardando...' : 'Saving...'}
                    </>
                  ) : (
                    isSpanish ? 'Guardar' : 'Save'
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center p-8 text-muted-foreground">
              {isSpanish
                ? 'No hay imágenes. Agrega una nueva.'
                : 'No images. Add a new one.'}
            </CardContent>
          </Card>
        ) : (
          items.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-0">
                <div className="relative aspect-square w-full overflow-hidden rounded-t-lg">
                  <img
                    src={item.image_url}
                    alt={isSpanish ? item.caption_es : item.caption_en}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-4">
                  <h3 className="font-semibold">
                    {isSpanish ? item.caption_es : item.caption_en}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {item.category}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDialog(item)}
                      className="flex-1"
                    >
                      <Edit className="mr-1 h-3 w-3" />
                      {isSpanish ? 'Editar' : 'Edit'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(item.id)}
                      className="flex-1"
                    >
                      <Trash2 className="mr-1 h-3 w-3 text-destructive" />
                      {isSpanish ? 'Eliminar' : 'Delete'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
