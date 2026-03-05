"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MODEL_OPTIONS } from "@/lib/models";
import styles from "@/app/components/model-picker-modal.module.css";

interface ModelPickerModalProps {
  isOpen: boolean;
  onSelect: (modelId: string) => void;
  onClose: () => void;
  selectedModelId?: string | null;
}

function focusablesWithin(element: HTMLElement): HTMLElement[] {
  return Array.from(
    element.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    )
  );
}

export default function ModelPickerModal({
  isOpen,
  onSelect,
  onClose,
  selectedModelId = null
}: ModelPickerModalProps): React.JSX.Element | null {
  const headingId = useId();
  const [searchValue, setSearchValue] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const providers = useMemo(() => {
    return Array.from(new Set(MODEL_OPTIONS.map((model) => model.provider))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, []);

  const filteredModels = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    return MODEL_OPTIONS.filter((model) => {
      if (providerFilter !== "all" && model.provider !== providerFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [model.name, model.provider, model.description]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [providerFilter, searchValue]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSearchValue("");
    setProviderFilter("all");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const rafId = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const focusableElements = focusablesWithin(dialog);
      if (focusableElements.length === 0) {
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(rafId);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className={styles.overlay} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={styles.modal} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <div className={styles.header}>
          <h2 id={headingId} className={styles.title}>
            Select Council Member
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close model picker"
          >
            ×
          </button>
        </div>

        <div className={styles.filters}>
          <label className={styles.searchField}>
            <span>Search</span>
            <input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Find by model, provider, or capability"
            />
          </label>

          <label className={styles.providerField}>
            <span>Provider</span>
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value)}
              aria-label="Filter by provider"
            >
              <option value="all">All providers</option>
              {providers.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.grid}>
          {filteredModels.length === 0 ? (
            <p className={styles.emptyState}>No models match your search.</p>
          ) : (
            filteredModels.map((model) => (
              <button
                type="button"
                key={model.id}
                className={`${styles.tile} ${selectedModelId === model.id ? styles.tileSelected : ""}`}
                onClick={() => onSelect(model.id)}
                aria-label={`Select ${model.name}`}
              >
                <span className={styles.modelColor} style={{ backgroundColor: model.color }} aria-hidden />
                <div className={styles.modelCopy}>
                  <span className={styles.modelName}>{model.name}</span>
                  <span className={styles.modelProvider}>{model.provider}</span>
                  <span className={styles.modelDescription}>{model.description}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
