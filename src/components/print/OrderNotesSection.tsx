import { useState, useEffect } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Trash2, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/contexts/AuthContext';
import { OrderNote } from '@/types/order';
import { format } from 'date-fns';

interface OrderNotesSectionProps {
  orderId: number;
  orderNumber: string;
}

export function OrderNotesSection({ orderId }: OrderNotesSectionProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<OrderNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchNotes();
  }, [orderId]);

  const fetchNotes = async () => {
    setIsLoading(true);
    try {
      const { api } = await import('@/lib/api');
      const { success, data } = await api.getOrderNotes(orderId);
      if (success) {
        setNotes(data);
        // Auto-expand if there are notes
        if (data.length > 0) setIsExpanded(true);
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNoteText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { api } = await import('@/lib/api');
      const { toast } = await import('sonner');
      const { success, data } = await api.addOrderNote(orderId, newNoteText);

      if (success && data) {
        setNotes((prev) => [data, ...prev]);
        setNewNoteText('');
        toast.success('Note added');
      } else {
        toast.error('Failed to add note');
      }
    } catch (err) {
      console.error('Error adding note:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    try {
      const { api } = await import('@/lib/api');
      const { toast } = await import('sonner');
      const { success, error } = await api.deleteOrderNote(noteId);

      if (success) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
        toast.success('Note deleted');
      } else {
        toast.error(error || 'Failed to delete note');
      }
    } catch (err) {
      console.error('Error deleting note:', err);
    }
  };

  const formatNoteDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
    } catch {
      return dateStr;
    }
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="mt-6 rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
        {/* Collapsible header */}
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 transition-colors">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[#C6A649]" />
              <span className="text-sm font-semibold text-white">Internal Notes</span>
              {notes.length > 0 && (
                <Badge className="bg-[#C6A649]/20 text-[#C6A649] border-[#C6A649]/30 text-xs px-2 py-0">
                  {notes.length}
                </Badge>
              )}
            </div>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-slate-700 p-4 space-y-4">
            {/* Add note form */}
            <div className="flex gap-2">
              <Textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Add an internal note..."
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 min-h-[60px] max-h-[120px] resize-y text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleAddNote();
                  }
                }}
              />
              <Button
                onClick={handleAddNote}
                disabled={!newNoteText.trim() || isSubmitting}
                size="sm"
                className="bg-[#C6A649] hover:bg-[#b5963e] text-black shrink-0 self-end"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Notes list */}
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                <span className="ml-2 text-sm text-slate-400">Loading notes...</span>
              </div>
            ) : notes.length === 0 ? (
              <div className="text-center py-6">
                <MessageSquare className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No internal notes yet</p>
                <p className="text-xs text-slate-600 mt-1">
                  Add a note to communicate with your team about this order
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/50 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-[#C6A649]">
                            {note.author_name}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatNoteDate(note.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">
                          {note.content}
                        </p>
                      </div>
                      {user?.id === note.created_by && (
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-900/30 text-slate-500 hover:text-red-400 shrink-0"
                          title="Delete note"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
