# Council Slot Picker Redesign

## Summary

Replace the current toggle-tile model grid for council member selection with a slot-based system: a stepper to set council size (2-8), compact cards per slot, and a modal picker to assign models.

## Decisions

- **Approach:** Slot-based cards with modal picker (Approach A)
- **Size control:** +/- stepper, range 2-8
- **New slots:** Start empty (user must pick)
- **Duplicates:** Allowed (same model in multiple slots)
- **Card content:** Color dot + name + provider
- **Judge selector:** Unchanged

## State Changes

### DraftState

Replace `selectedModelIds: string[]` with:

```ts
councilSize: number              // 2-8, controlled by stepper
councilSlots: (string | null)[]  // length === councilSize, null = empty
```

Add UI-only state (not in DraftState):

```ts
pickerSlotIndex: number | null   // which slot the modal is open for (null = closed)
```

### SessionSettings

No change. `selectedModelIds: string[]` stays as the serialized form. `councilSlots` is converted to `string[]` (after validation that no nulls remain) when starting a session.

## UI Components

### Stepper

- Label: "Council Members (N)" with `-` and `+` buttons
- Clamped to 2-8
- Increment appends `null` to `councilSlots`
- Decrement pops the last slot; closes modal if it was open for a removed slot

### Slot Cards

- Horizontal wrapping row replacing the current `model-grid`
- **Filled slot:** Color dot left edge, model name (bold), provider in small caps. Click opens modal for that slot.
- **Empty slot:** Dashed border, "+" icon, muted "Select model" text. Click opens modal for that slot.

### Modal Picker

- Centered overlay with backdrop blur (glass aesthetic)
- Header: "Select Council Member" + close button
- Grid/list of all 9 models: color dot, name, provider, description (like current model-tile style)
- Click a model: assigns it to the active slot, closes modal
- Escape or backdrop click: closes modal without changes

## Validation

- `canRun` requires `councilSlots.every(slot => slot !== null)` (replaces the old `selectedModelIds.length >= MIN_COUNCIL_SIZE` check)
- Error message if any slot is empty: "All council slots must have a model assigned."

## Storage Compatibility

Existing saved sessions use `selectedModelIds: string[]`. New sessions serialize the same way. No migration needed.

## Files Changed

| File | Change |
|------|--------|
| `lib/models.ts` | Add `MAX_COUNCIL_SIZE = 8` |
| `app/components/quorum-app.tsx` | Replace DraftState fields, remove `toggleModel`, add stepper/slots/modal, update `canRun` and `startSession` |
| `app/globals.css` | Add `.council-stepper`, `.council-slots`, `.council-slot`, `.picker-overlay`, `.picker-modal`, `.picker-tile` styles |

No changes to: API route, prompts, storage, types, or execution pipeline.
