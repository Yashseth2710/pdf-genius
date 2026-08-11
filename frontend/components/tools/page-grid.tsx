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
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ChevronLeft, ChevronRight, RotateCcw, RotateCw, Trash2, Undo2 } from 'lucide-react'

import { PageThumbnail } from '@/components/tools/page-thumbnail'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { PlanEntry } from '@/lib/page-plan'
import { cn } from '@/lib/utils'

/**
 * The pages of a document, as cards that can be turned, moved and removed.
 *
 * Dragging is the natural way to reorder with a mouse; the arrow buttons on
 * each card are the same operation for anyone using a keyboard, and they are
 * always visible rather than appearing on hover, because a control you cannot
 * see is a control you do not know exists.
 */
export function PageGrid({
  document,
  plan,
  onMove,
  onRotate,
  onToggleRemoved,
}: {
  document: PDFDocumentProxy | null
  plan: PlanEntry[]
  onMove: (key: string, to: number) => void
  onRotate: (key: string, degrees: number) => void
  onToggleRemoved: (key: string) => void
}) {
  const sensors = useSensors(
    // A few pixels of travel first, so clicking a card's buttons is not read
    // as the start of a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onMove(
      String(active.id),
      plan.findIndex((entry) => entry.key === over.id),
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={plan.map((entry) => entry.key)} strategy={rectSortingStrategy}>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-label="Pages">
          {plan.map((entry, index) => (
            <PageCard
              key={entry.key}
              document={document}
              entry={entry}
              position={index + 1}
              total={plan.length}
              onMoveLeft={() => onMove(entry.key, index - 1)}
              onMoveRight={() => onMove(entry.key, index + 1)}
              onRotate={(degrees) => onRotate(entry.key, degrees)}
              onToggleRemoved={() => onToggleRemoved(entry.key)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function PageCard({
  document,
  entry,
  position,
  total,
  onMoveLeft,
  onMoveRight,
  onRotate,
  onToggleRemoved,
}: {
  document: PDFDocumentProxy | null
  entry: PlanEntry
  position: number
  total: number
  onMoveLeft: () => void
  onMoveRight: () => void
  onRotate: (degrees: number) => void
  onToggleRemoved: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.key,
    disabled: entry.removed,
  })

  const label = `Page ${entry.number}`

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'bg-background rounded-xl border p-2 transition-colors',
        isDragging && 'ring-primary/40 relative z-10 shadow-lg ring-2',
        entry.removed && 'border-dashed',
      )}
      data-testid={`page-card-${entry.number}`}
      data-removed={entry.removed ? 'true' : undefined}
    >
      {/* The thumbnail is the drag handle: on a grid of pages, grabbing the
          page itself is what people expect, and a separate handle would be a
          small target on a small card. */}
      <div
        className={cn(
          'relative',
          entry.removed ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
        )}
        {...(entry.removed ? {} : attributes)}
        {...(entry.removed ? {} : listeners)}
      >
        <PageThumbnail
          document={document}
          pageNumber={entry.number}
          rotation={entry.rotation}
          dimmed={entry.removed}
          className="mx-auto"
        />

        {entry.removed && (
          <span className="text-muted-foreground bg-background/80 absolute inset-x-0 top-1/2 -translate-y-1/2 py-1 text-center text-xs font-medium">
            Removed
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-1">
        <span className="text-muted-foreground pl-1 text-xs font-medium tabular-nums">
          {entry.number}
          {entry.rotation !== 0 && !entry.removed && (
            <span className="ml-1 font-normal">· {entry.rotation}°</span>
          )}
        </span>

        <div className="flex items-center">
          {entry.removed ? (
            <Tooltip>
              <TooltipTrigger
                render={<Button variant="ghost" size="icon-sm" onClick={onToggleRemoved} />}
                aria-label={`Put ${label} back`}
              >
                <Undo2 aria-hidden />
              </TooltipTrigger>
              <TooltipContent>Put back</TooltipContent>
            </Tooltip>
          ) : (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={onMoveLeft}
                      disabled={position === 1}
                    />
                  }
                  aria-label={`Move ${label} earlier`}
                >
                  <ChevronLeft aria-hidden />
                </TooltipTrigger>
                <TooltipContent>Move earlier</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={onMoveRight}
                      disabled={position === total}
                    />
                  }
                  aria-label={`Move ${label} later`}
                >
                  <ChevronRight aria-hidden />
                </TooltipTrigger>
                <TooltipContent>Move later</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={<Button variant="ghost" size="icon-sm" onClick={() => onRotate(-90)} />}
                  aria-label={`Turn ${label} left`}
                >
                  <RotateCcw aria-hidden />
                </TooltipTrigger>
                <TooltipContent>Turn left</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={<Button variant="ghost" size="icon-sm" onClick={() => onRotate(90)} />}
                  aria-label={`Turn ${label} right`}
                >
                  <RotateCw aria-hidden />
                </TooltipTrigger>
                <TooltipContent>Turn right</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={onToggleRemoved}
                      className="text-muted-foreground hover:text-destructive"
                    />
                  }
                  aria-label={`Remove ${label}`}
                >
                  <Trash2 aria-hidden />
                </TooltipTrigger>
                <TooltipContent>Remove</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </li>
  )
}
