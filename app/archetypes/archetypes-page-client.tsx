"use client";

import { useState, useCallback } from "react";
import NavPill from "@/app/components/nav-pill";
import Footer from "@/app/components/footer";
import {
  Archetype,
  getAllArchetypes,
  loadCustomArchetypes,
  saveCustomArchetypes,
} from "@/lib/archetypes";
import styles from "@/app/archetypes/archetypes-page.module.css";

type FilterType = "all" | "council" | "judge";

interface ArchetypeFormData {
  name: string;
  icon: string;
  description: string;
  systemPromptSnippet: string;
  type: "council" | "judge";
}

const EMPTY_FORM: ArchetypeFormData = {
  name: "",
  icon: "",
  description: "",
  systemPromptSnippet: "",
  type: "council",
};

export default function ArchetypesPageClient(): React.JSX.Element {
  const [filter, setFilter] = useState<FilterType>("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ArchetypeFormData>(EMPTY_FORM);

  const archetypes = getAllArchetypes(
    filter === "all" ? undefined : filter
  );

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // --- Modal helpers ---

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (archetype: Archetype) => {
    setEditingId(archetype.id);
    setForm({
      name: archetype.name,
      icon: archetype.icon,
      description: archetype.description,
      systemPromptSnippet: archetype.systemPromptSnippet,
      type: archetype.type,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;

    const custom = loadCustomArchetypes();

    if (editingId) {
      const updated = custom.map((a) =>
        a.id === editingId
          ? { ...a, ...form, name: form.name.trim(), description: form.description.trim(), systemPromptSnippet: form.systemPromptSnippet.trim() }
          : a
      );
      saveCustomArchetypes(updated);
    } else {
      const newArchetype: Archetype = {
        id: crypto.randomUUID(),
        name: form.name.trim(),
        icon: form.icon || "🧩",
        description: form.description.trim(),
        systemPromptSnippet: form.systemPromptSnippet.trim(),
        type: form.type,
        builtIn: false,
      };
      saveCustomArchetypes([...custom, newArchetype]);
    }

    closeModal();
    refresh();
  };

  const handleDelete = (id: string) => {
    const custom = loadCustomArchetypes();
    saveCustomArchetypes(custom.filter((a) => a.id !== id));
    refresh();
  };

  const isFormValid = form.name.trim().length > 0;

  // Force re-read from localStorage on refreshKey change
  void refreshKey;

  return (
    <div className="synapse-root">
      <div className="ambient-orb ambient-orb-violet" aria-hidden />
      <div className="ambient-orb ambient-orb-cyan" aria-hidden />

      <NavPill variant="app" />

      <main className="main-shell">
        <div style={{ display: "grid", gap: "16px", marginTop: "48px" }}>
          {/* Header */}
          <div className={styles.pageHeader}>
            <div className={styles.headerRow}>
              <div>
                <h1 className={styles.pageTitle}>Archetypes</h1>
                <p className={styles.pageCopy}>
                  Manage council and judge archetypes. Built-in archetypes provide
                  default personas; create custom ones to tailor your council.
                </p>
              </div>
              <button
                type="button"
                className={styles.createButton}
                onClick={openCreate}
              >
                + Create Archetype
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className={styles.filterBar}>
            {(["all", "council", "judge"] as FilterType[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`${styles.filterTab} ${filter === tab ? styles.filterTabActive : ""}`}
                onClick={() => setFilter(tab)}
              >
                {tab === "all" ? "All" : tab === "council" ? "Council" : "Judge"}
              </button>
            ))}
          </div>

          {/* Archetype grid */}
          <div className={styles.archetypeGrid}>
            {archetypes.length === 0 && (
              <p className={styles.emptyState}>
                No archetypes found for this filter.
              </p>
            )}

            {archetypes.map((archetype) => (
              <div key={archetype.id} className={styles.archetypeCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardIcon}>{archetype.icon}</div>
                  <div className={styles.cardMeta}>
                    <h3 className={styles.cardName}>{archetype.name}</h3>
                    <div className={styles.cardBadges}>
                      <span
                        className={`${styles.badge} ${
                          archetype.type === "council"
                            ? styles.badgeCouncil
                            : styles.badgeJudge
                        }`}
                      >
                        {archetype.type}
                      </span>
                      <span
                        className={`${styles.badge} ${
                          archetype.builtIn
                            ? styles.badgeBuiltIn
                            : styles.badgeCustom
                        }`}
                      >
                        {archetype.builtIn ? "built-in" : "custom"}
                      </span>
                    </div>
                  </div>
                </div>

                <p className={styles.cardDescription}>
                  {archetype.description}
                </p>

                {!archetype.builtIn && (
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.editButton}
                      onClick={() => openEdit(archetype)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => handleDelete(archetype.id)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div
            className={styles.modalPanel}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.modalTitle}>
              {editingId ? "Edit Archetype" : "Create Archetype"}
            </h2>

            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="arch-name">
                Name
              </label>
              <input
                id="arch-name"
                className={styles.formInput}
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. The Strategist"
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="arch-icon">
                Icon (emoji)
              </label>
              <input
                id="arch-icon"
                className={styles.formInput}
                type="text"
                value={form.icon}
                onChange={(e) =>
                  setForm((f) => ({ ...f, icon: e.target.value }))
                }
                placeholder="e.g. 🧠"
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="arch-desc">
                Description
              </label>
              <textarea
                id="arch-desc"
                className={styles.formTextarea}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Brief description of this archetype's personality and focus"
                rows={3}
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="arch-prompt">
                System Prompt Snippet
              </label>
              <textarea
                id="arch-prompt"
                className={styles.formTextarea}
                value={form.systemPromptSnippet}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    systemPromptSnippet: e.target.value,
                  }))
                }
                placeholder="Instructions injected into this archetype's system prompt"
                rows={5}
              />
            </div>

            <div className={styles.formField}>
              <span className={styles.formLabel}>Type</span>
              <div className={styles.typeRadioGroup}>
                <label className={styles.typeRadioLabel}>
                  <input
                    type="radio"
                    name="archetype-type"
                    value="council"
                    checked={form.type === "council"}
                    onChange={() =>
                      setForm((f) => ({ ...f, type: "council" }))
                    }
                  />
                  Council
                </label>
                <label className={styles.typeRadioLabel}>
                  <input
                    type="radio"
                    name="archetype-type"
                    value="judge"
                    checked={form.type === "judge"}
                    onChange={() =>
                      setForm((f) => ({ ...f, type: "judge" }))
                    }
                  />
                  Judge
                </label>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.saveButton}
                disabled={!isFormValid}
                onClick={handleSave}
              >
                {editingId ? "Save Changes" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
