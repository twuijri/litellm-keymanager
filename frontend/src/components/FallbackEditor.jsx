import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

let idSeed = 1;
function newId() {
  idSeed += 1;
  return `f_${Date.now()}_${idSeed}`;
}

function withIds(entries) {
  return (entries || []).map((e) => ({ ...e, _id: e._id || newId() }));
}

export function fallbacksToWire(entries) {
  return (entries || [])
    .map(({ primary, fallbacks }) => ({ primary: (primary || "").trim(), fallbacks: fallbacks || [] }))
    .filter((e) => e.primary);
}

export function fallbacksFromMetadata(metadataFallbacks) {
  if (!Array.isArray(metadataFallbacks)) return [];
  const out = [];
  for (const item of metadataFallbacks) {
    if (!item || typeof item !== "object") continue;
    for (const [primary, fallbacks] of Object.entries(item)) {
      if (Array.isArray(fallbacks)) {
        out.push({ _id: newId(), primary, fallbacks: [...fallbacks] });
      }
    }
  }
  return out;
}

function SortableRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="card overflow-hidden">
      <div className="flex items-stretch">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="flex w-9 cursor-grab items-center justify-center border-r border-ink-700 bg-ink-800 text-ink-300 hover:text-ink-200 active:cursor-grabbing"
        >
          ⋮⋮
        </button>
        <div className="flex-1 p-3">{children}</div>
      </div>
    </div>
  );
}

function FallbackChips({ items, onChange, available }) {
  const [draft, setDraft] = useState("");

  function addItem(value) {
    const v = (value ?? draft).trim();
    if (!v) return;
    if (items.includes(v)) return;
    onChange([...items, v]);
    setDraft("");
  }
  function remove(idx) {
    onChange(items.filter((_, i) => i !== idx));
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(active.id);
    const newIndex = items.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(items, oldIndex, newIndex));
  }

  const suggestions = (available || []).filter((m) => !items.includes(m));

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div className="flex flex-wrap gap-1.5">
            {items.map((m, i) => (
              <FallbackChip key={m} id={m} label={m} index={i} onRemove={() => remove(i)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="mt-2 flex gap-2">
        <input
          className="input"
          placeholder="Add fallback model"
          value={draft}
          list="model-options"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
        />
        <button type="button" className="btn-secondary" onClick={() => addItem()}>
          Add
        </button>
      </div>
      {suggestions.length > 0 && (
        <datalist id="model-options">
          {suggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      )}
    </div>
  );
}

function FallbackChip({ id, label, index, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <span
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="chip cursor-grab select-none active:cursor-grabbing"
    >
      <span className="text-ink-500">{index + 1}.</span>
      <span className="font-mono">{label}</span>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        className="-mr-1 ml-1 text-ink-300 hover:text-ink-200"
      >
        ×
      </button>
    </span>
  );
}

export default function FallbackEditor({ value, onChange, availableModels = [] }) {
  const [entries, setEntriesState] = useState(() => withIds(value));

  function setEntries(next) {
    setEntriesState(next);
    onChange(next);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = entries.findIndex((e) => e._id === active.id);
    const newIndex = entries.findIndex((e) => e._id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setEntries(arrayMove(entries, oldIndex, newIndex));
  }

  function update(id, patch) {
    setEntries(entries.map((e) => (e._id === id ? { ...e, ...patch } : e)));
  }
  function remove(id) {
    setEntries(entries.filter((e) => e._id !== id));
  }
  function add() {
    setEntries([...entries, { _id: newId(), primary: "", fallbacks: [] }]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-300">
          Drag rows to reorder. Each row maps a primary model to an ordered fallback list.
        </p>
        <button type="button" className="btn-secondary" onClick={add}>
          + Add row
        </button>
      </div>

      {entries.length === 0 && (
        <div className="rounded-lg border border-dashed border-ink-700 px-4 py-6 text-center text-sm text-ink-500">
          No fallbacks defined.
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={entries.map((e) => e._id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {entries.map((e) => (
              <SortableRow key={e._id} id={e._id}>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                  <div>
                    <div className="label">Primary model</div>
                    <input
                      className="input font-mono"
                      placeholder="gpt-4o"
                      list="model-options"
                      value={e.primary}
                      onChange={(ev) => update(e._id, { primary: ev.target.value })}
                    />
                  </div>
                  <div>
                    <div className="label">Fallback chain (ordered)</div>
                    <FallbackChips
                      items={e.fallbacks}
                      onChange={(items) => update(e._id, { fallbacks: items })}
                      available={availableModels}
                    />
                  </div>
                  <div className="flex items-end">
                    <button type="button" className="btn-danger" onClick={() => remove(e._id)}>
                      Remove
                    </button>
                  </div>
                </div>
              </SortableRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
