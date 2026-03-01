# Council Slot Picker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the toggle-tile model grid with a stepper + slot cards + modal picker for council member selection.

**Architecture:** The `DraftState` drops `selectedModelIds` in favor of `councilSize` (number) and `councilSlots` ((string | null)[]). A modal picker (controlled by `pickerSlotIndex` state) lets users assign models to individual slots. The execution pipeline is unchanged — slots are converted to a `string[]` at session start time.

**Tech Stack:** React (Next.js), CSS (globals.css), TypeScript

---

### Task 1: Add MAX_COUNCIL_SIZE constant

**Files:**
- Modify: `lib/models.ts:70-71`

**Step 1: Add the constant**

In `lib/models.ts`, after `export const MIN_COUNCIL_SIZE = 2;`, add:

```ts
export const MAX_COUNCIL_SIZE = 8;
```

**Step 2: Commit**

```bash
git add lib/models.ts
git commit -m "feat: add MAX_COUNCIL_SIZE constant"
```

---

### Task 2: Update DraftState and initial state

**Files:**
- Modify: `app/components/quorum-app.tsx:3-44`

**Step 1: Update imports**

Change the import from `@/lib/models` to include `MAX_COUNCIL_SIZE`:

```ts
import {
  DEFAULT_COUNCIL,
  DEFAULT_JUDGE,
  MAX_COUNCIL_SIZE,
  MAX_DELIBERATION_ROUNDS,
  MIN_COUNCIL_SIZE,
  MODEL_OPTIONS,
  getModelById,
  getModelsByIds
} from "@/lib/models";
```

**Step 2: Replace DraftState interface**

Replace:

```ts
interface DraftState {
  question: string;
  context: string;
  selectedModelIds: string[];
  judgeModelId: string;
  deliberationRounds: number;
}
```

With:

```ts
interface DraftState {
  question: string;
  context: string;
  councilSize: number;
  councilSlots: (string | null)[];
  judgeModelId: string;
  deliberationRounds: number;
}
```

**Step 3: Replace INITIAL_DRAFT**

Replace:

```ts
const INITIAL_DRAFT: DraftState = {
  question: "",
  context: "",
  selectedModelIds: DEFAULT_COUNCIL,
  judgeModelId: DEFAULT_JUDGE,
  deliberationRounds: 1
};
```

With:

```ts
const INITIAL_DRAFT: DraftState = {
  question: "",
  context: "",
  councilSize: DEFAULT_COUNCIL.length,
  councilSlots: Array.from({ length: DEFAULT_COUNCIL.length }, () => null),
  judgeModelId: DEFAULT_JUDGE,
  deliberationRounds: 1
};
```

**Step 4: Verify the app still compiles in dev**

Open `http://localhost:3000` — expect compile errors since the rest of the component still references `selectedModelIds`. That's fine; we fix those in the next tasks.

**Step 5: Commit**

```bash
git add app/components/quorum-app.tsx
git commit -m "feat: replace selectedModelIds with councilSize/councilSlots in DraftState"
```

---

### Task 3: Update canRun, startSession, and remove toggleModel

**Files:**
- Modify: `app/components/quorum-app.tsx`

**Step 1: Update canRun**

Find (around line 224):

```ts
const canRun =
  draft.question.trim().length > 0 && draft.selectedModelIds.length >= MIN_COUNCIL_SIZE && !isExecuting;
```

Replace with:

```ts
const canRun =
  draft.question.trim().length > 0 &&
  draft.councilSlots.length >= MIN_COUNCIL_SIZE &&
  draft.councilSlots.every((slot) => slot !== null) &&
  !isExecuting;
```

**Step 2: Update startSession validation**

Find the validation block in `startSession` (around lines 357-377). Replace:

```ts
const selectedModelIds = [...draft.selectedModelIds];

if (!question) {
  setErrorMessage("Question is required.");
  return;
}

if (selectedModelIds.length < MIN_COUNCIL_SIZE) {
  setErrorMessage(`Select at least ${MIN_COUNCIL_SIZE} council models.`);
  return;
}

const councilModels = getModelsByIds(selectedModelIds);
if (councilModels.length < MIN_COUNCIL_SIZE) {
  setErrorMessage("Some selected models are unavailable.");
  return;
}
```

With:

```ts
if (!question) {
  setErrorMessage("Question is required.");
  return;
}

if (draft.councilSlots.some((slot) => slot === null)) {
  setErrorMessage("All council slots must have a model assigned.");
  return;
}

const selectedModelIds = draft.councilSlots as string[];
const councilModels = getModelsByIds(selectedModelIds);
if (councilModels.length < MIN_COUNCIL_SIZE) {
  setErrorMessage("Some selected models are unavailable.");
  return;
}
```

**Step 3: Update session settings serialization**

The `workingSession` object (around line 387-400) already uses `selectedModelIds` — no change needed there since we defined `const selectedModelIds` in the step above.

**Step 4: Delete the toggleModel function**

Remove the entire `toggleModel` function (around lines 479-500):

```ts
const toggleModel = (modelId: string): void => {
  setDraft((previous) => {
    const exists = previous.selectedModelIds.includes(modelId);

    if (exists) {
      if (previous.selectedModelIds.length <= MIN_COUNCIL_SIZE) {
        return previous;
      }

      const nextSelected = previous.selectedModelIds.filter((id) => id !== modelId);
      return {
        ...previous,
        selectedModelIds: nextSelected
      };
    }

    return {
      ...previous,
      selectedModelIds: [...previous.selectedModelIds, modelId]
    };
  });
};
```

**Step 5: Commit**

```bash
git add app/components/quorum-app.tsx
git commit -m "feat: update canRun/startSession for slot-based council, remove toggleModel"
```

---

### Task 4: Add pickerSlotIndex state and stepper/slot handler functions

**Files:**
- Modify: `app/components/quorum-app.tsx`

**Step 1: Add pickerSlotIndex state**

After the existing `useState` declarations (around line 182), add:

```ts
const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null);
```

**Step 2: Add stepper handlers**

After the `removeSession` function (around line 519), add:

```ts
const incrementCouncil = (): void => {
  setDraft((prev) => {
    if (prev.councilSize >= MAX_COUNCIL_SIZE) return prev;
    return {
      ...prev,
      councilSize: prev.councilSize + 1,
      councilSlots: [...prev.councilSlots, null]
    };
  });
};

const decrementCouncil = (): void => {
  setDraft((prev) => {
    if (prev.councilSize <= MIN_COUNCIL_SIZE) return prev;
    const nextSlots = prev.councilSlots.slice(0, -1);
    return {
      ...prev,
      councilSize: prev.councilSize - 1,
      councilSlots: nextSlots
    };
  });
  setPickerSlotIndex((prev) => {
    if (prev !== null && prev >= draft.councilSize - 1) return null;
    return prev;
  });
};

const assignModelToSlot = (slotIndex: number, modelId: string): void => {
  setDraft((prev) => {
    const nextSlots = [...prev.councilSlots];
    nextSlots[slotIndex] = modelId;
    return { ...prev, councilSlots: nextSlots };
  });
  setPickerSlotIndex(null);
};
```

**Step 3: Commit**

```bash
git add app/components/quorum-app.tsx
git commit -m "feat: add pickerSlotIndex state and stepper/slot handler functions"
```

---

### Task 5: Replace model-grid JSX with stepper + slot cards + modal

**Files:**
- Modify: `app/components/quorum-app.tsx`

**Step 1: Replace the model-grid section**

Find the entire model-grid block (around lines 694-713):

```tsx
<div className="model-grid">
  {MODEL_OPTIONS.map((model) => {
    const selected = draft.selectedModelIds.includes(model.id);
    return (
      <button
        type="button"
        key={model.id}
        className={`model-tile ${selected ? "selected" : ""}`}
        onClick={() => toggleModel(model.id)}
      >
        <span className="model-color" style={{ backgroundColor: model.color }} aria-hidden />
        <div className="model-copy">
          <span className="model-name">{model.name}</span>
          <span className="model-provider">{model.provider}</span>
          <span className="model-description">{model.description}</span>
        </div>
      </button>
    );
  })}
</div>
```

Replace with:

```tsx
<div className="council-stepper">
  <span className="field-label">Council Members ({draft.councilSize})</span>
  <div className="stepper-controls">
    <button
      type="button"
      className="stepper-btn"
      onClick={decrementCouncil}
      disabled={draft.councilSize <= MIN_COUNCIL_SIZE}
      aria-label="Remove council member"
    >
      -
    </button>
    <span className="stepper-value">{draft.councilSize}</span>
    <button
      type="button"
      className="stepper-btn"
      onClick={incrementCouncil}
      disabled={draft.councilSize >= MAX_COUNCIL_SIZE}
      aria-label="Add council member"
    >
      +
    </button>
  </div>
</div>

<div className="council-slots">
  {draft.councilSlots.map((slotModelId, index) => {
    const model = slotModelId ? getModelById(slotModelId) : null;
    return (
      <button
        type="button"
        key={index}
        className={`council-slot ${model ? "council-slot-filled" : "council-slot-empty"}`}
        onClick={() => setPickerSlotIndex(index)}
      >
        {model ? (
          <>
            <span
              className="council-slot-dot"
              style={{ backgroundColor: model.color }}
              aria-hidden
            />
            <div className="council-slot-info">
              <span className="council-slot-name">{model.name}</span>
              <span className="council-slot-provider">{model.provider}</span>
            </div>
          </>
        ) : (
          <span className="council-slot-placeholder">+ Select model</span>
        )}
      </button>
    );
  })}
</div>

{pickerSlotIndex !== null && (
  <div
    className="picker-overlay"
    onClick={() => setPickerSlotIndex(null)}
    onKeyDown={(e) => { if (e.key === "Escape") setPickerSlotIndex(null); }}
    role="dialog"
    aria-modal="true"
    aria-label="Select council member"
  >
    <div className="picker-modal" onClick={(e) => e.stopPropagation()}>
      <div className="picker-header">
        <h3>Select Council Member</h3>
        <button
          type="button"
          className="picker-close"
          onClick={() => setPickerSlotIndex(null)}
          aria-label="Close"
        >
          &times;
        </button>
      </div>
      <div className="picker-grid">
        {MODEL_OPTIONS.map((model) => (
          <button
            type="button"
            key={model.id}
            className="picker-tile"
            onClick={() => assignModelToSlot(pickerSlotIndex, model.id)}
          >
            <span
              className="model-color"
              style={{ backgroundColor: model.color }}
              aria-hidden
            />
            <div className="model-copy">
              <span className="model-name">{model.name}</span>
              <span className="model-provider">{model.provider}</span>
              <span className="model-description">{model.description}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  </div>
)}
```

**Step 2: Verify it compiles in the browser**

Open `http://localhost:3000` — the UI should render (unstyled) with the stepper, slot cards, and modal. Clicking a slot should open the modal.

**Step 3: Commit**

```bash
git add app/components/quorum-app.tsx
git commit -m "feat: replace model-grid with stepper, slot cards, and modal picker"
```

---

### Task 6: Add CSS for stepper, slot cards, and modal

**Files:**
- Modify: `app/globals.css`

**Step 1: Add new styles**

After the `.model-description` rule (around line 535), add the following CSS block. Keep the existing `.model-grid`, `.model-tile`, `.model-tile:hover`, `.model-tile.selected`, `.model-color`, `.model-copy`, `.model-name`, `.model-provider`, `.model-description` rules — the modal picker reuses `.model-color`, `.model-copy`, `.model-name`, `.model-provider`, `.model-description`.

Add after `.model-description { ... }` (line 535):

```css
.council-stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  margin-top: 10px;
}

.stepper-controls {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.stepper-btn {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: border-color 0.2s var(--ease-snap), background 0.2s var(--ease-snap),
    transform 0.2s var(--ease-snap);
}

.stepper-btn:hover:not(:disabled) {
  border-color: rgba(139, 92, 246, 0.5);
  background: rgba(139, 92, 246, 0.12);
  transform: translateY(-1px);
}

.stepper-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.stepper-value {
  font-size: 1rem;
  font-weight: 600;
  min-width: 24px;
  text-align: center;
}

.council-slots {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
  margin-bottom: 10px;
}

.council-slot {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 12px;
  padding: 10px 14px;
  cursor: pointer;
  transition: border-color 0.25s var(--ease-snap), background 0.25s var(--ease-snap),
    transform 0.25s var(--ease-snap), box-shadow 0.25s var(--ease-snap);
}

.council-slot:hover {
  transform: translateY(-2px);
}

.council-slot-filled {
  border: 1px solid rgba(6, 182, 212, 0.35);
  background: rgba(6, 182, 212, 0.06);
  color: inherit;
}

.council-slot-filled:hover {
  border-color: rgba(6, 182, 212, 0.55);
  box-shadow: var(--shadow-cyan);
}

.council-slot-empty {
  border: 1px dashed rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.02);
  color: rgba(220, 220, 220, 0.5);
}

.council-slot-empty:hover {
  border-color: rgba(139, 92, 246, 0.45);
  color: rgba(220, 220, 220, 0.8);
}

.council-slot-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
}

.council-slot-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.council-slot-name {
  font-size: 0.85rem;
  font-weight: 600;
  line-height: 1.2;
}

.council-slot-provider {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: rgba(214, 214, 214, 0.6);
}

.council-slot-placeholder {
  font-size: 0.82rem;
}

.picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  animation: entrance 0.2s var(--ease-snap) both;
}

.picker-modal {
  width: min(92vw, 640px);
  max-height: 80vh;
  overflow-y: auto;
  background: rgba(14, 14, 14, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  padding: 22px;
  box-shadow: 0 24px 80px -12px rgba(0, 0, 0, 0.7), var(--shadow-violet);
}

.picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.picker-header h3 {
  margin: 0;
  font-family: var(--font-serif), "Instrument Serif", serif;
  font-weight: 400;
  font-size: 1.4rem;
  letter-spacing: -0.02em;
}

.picker-close {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(230, 230, 230, 0.8);
  font-size: 1.2rem;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: border-color 0.2s var(--ease-snap), background 0.2s var(--ease-snap);
}

.picker-close:hover {
  border-color: rgba(248, 113, 113, 0.5);
  background: rgba(248, 113, 113, 0.1);
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.picker-tile {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
  border-radius: 16px;
  padding: 12px;
  display: grid;
  grid-template-columns: 10px 1fr;
  gap: 10px;
  text-align: left;
  color: inherit;
  cursor: pointer;
  transition: transform 0.28s var(--ease-snap), border-color 0.28s var(--ease-snap),
    box-shadow 0.28s var(--ease-snap), background 0.28s var(--ease-snap);
}

.picker-tile:hover {
  transform: translateY(-3px);
  border-color: rgba(139, 92, 246, 0.45);
  box-shadow: 0 0 20px -10px rgba(139, 92, 246, 0.4);
  background: rgba(255, 255, 255, 0.04);
}
```

**Step 2: Update responsive breakpoints**

In the `@media (max-width: 860px)` block (around line 1060), the existing rule targets `.model-grid` — update it to also handle the picker:

Find:

```css
.model-grid,
.response-grid,
.feature-grid {
  grid-template-columns: 1fr;
}
```

Replace with:

```css
.response-grid,
.feature-grid,
.picker-grid {
  grid-template-columns: 1fr;
}
```

**Step 3: Verify in the browser**

Open `http://localhost:3000`, scroll to the council section. Verify:
- Stepper shows with +/- buttons
- Empty slot cards render with dashed borders
- Clicking a slot opens the modal with backdrop blur
- Clicking a model in the modal fills the slot and closes the modal
- Clicking backdrop or X closes the modal
- All styling matches the glass-card aesthetic

**Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat: add CSS for council stepper, slot cards, and modal picker"
```

---

### Task 7: Update totalRoundsForDraft display

**Files:**
- Modify: `app/components/quorum-app.tsx`

**Step 1: Verify totalRoundsForDraft**

Find (around line 227):

```ts
const totalRoundsForDraft = draft.deliberationRounds + 2;
```

This still works — no change needed. The `+ 2` accounts for 1 independent round + 1 judgment round, which is independent of how council members are selected.

**Step 2: Update session-header display for old sessions**

The `session-header` section shows `activeSession.settings.selectedModelIds.length` (around line 727). This already works because `startSession` still serializes to `selectedModelIds`. No change needed.

**Step 3: Commit (skip if no changes)**

No changes in this task — just a verification step.

---

### Task 8: Final verification

**Step 1: Full flow test**

1. Open `http://localhost:3000`
2. Scroll to "Create Council Session"
3. Verify stepper defaults to 3, with 3 empty slot cards
4. Click each slot, pick a model from the modal — verify the slot updates
5. Try picking the same model for multiple slots (duplicates allowed)
6. Use +/- to change council size — verify slots are added/removed
7. Enter a question, click "Convene Council"
8. Verify the session runs with the correct models

**Step 2: Edge cases**

- Try to convene with empty slots — should see error message
- Decrease council size while modal is open for the last slot — modal should close
- Set council to minimum (2), verify - button is disabled
- Set council to maximum (8), verify + button is disabled

**Step 3: Commit any fixes, then final commit**

```bash
git add -A
git commit -m "feat: complete council slot picker with stepper, cards, and modal"
```
