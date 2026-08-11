'use client'

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronUp, GripVertical, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { DocumentSummary } from '@/types/api'

/**
 * The chosen files, in the order they will be merged.
 *
 * Dragging is the obvious way to reorder with a mouse, but it is a poor one
 * with a keyboard or a screen reader, so every row also carries move-up and
 * move-down buttons. Both paths change the same array.
 */
export function MergeOrder({
  documents,
  onReorder,
  onRemove,
}: {
  documents: DocumentSummary[]
  onReorder: (from: number, to: number) => void
  onRemove: (id: string) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // A few pixels of travel before a drag starts, so clicking the remove
      // button does not count as the beginning of one.
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const from = documents.findIndex((item) => item.id === active.id)
    const to = documents.findIndex((item) => item.id === over.id)
    if (from !== -1 && to !== -1) onReorder(from, to)
  }

  if (documents.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
        Nothing chosen yet. Tick at least two PDFs above.
      </p>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={documents.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <ol className="space-y-2" aria-label="Merge order">
          {documents.map((document, index) => (
            <SortableRow
              key={document.id}
              document={document}
              position={index + 1}
              total={documents.length}
              onMoveUp={() => onReorder(index, index - 1)}
              onMoveDown={() => onReorder(index, index + 1)}
              onRemove={() => onRemove(document.id)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({
  document,
  position,
  total,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  document: DocumentSummary
  position: number
  total: number
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: document.id,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'bg-background flex items-center gap-2 rounded-lg border px-2 py-2',
        isDragging && 'ring-primary/40 relative z-10 shadow-sm ring-2',
      )}
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring cursor-grab rounded p-1 focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing"
        aria-label={`Drag ${document.original_filename} to reorder`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>

      <span className="text-muted-foreground w-5 shrink-0 text-center text-xs font-medium tabular-nums">
        {position}
      </span>

      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {document.original_filename}
      </span>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon-sm" onClick={onMoveUp} disabled={position === 1} />
          }
          aria-label={`Move ${document.original_filename} up`}
        >
          <ChevronUp aria-hidden />
        </TooltipTrigger>
        <TooltipContent>Move up</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onMoveDown}
              disabled={position === total}
            />
          }
          aria-label={`Move ${document.original_filename} down`}
        >
          <ChevronDown aria-hidden />
        </TooltipTrigger>
        <TooltipContent>Move down</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onRemove}
              className="text-muted-foreground hover:text-destructive"
            />
          }
          aria-label={`Remove ${document.original_filename} from the merge`}
        >
          <X aria-hidden />
        </TooltipTrigger>
        <TooltipContent>Remove</TooltipContent>
      </Tooltip>
    </li>
  )
}
