"use client";

import { PRESET_ALIASES, CUSTOM_ALIAS_SENTINEL } from "@/lib/alias-generator";
import styles from "@/app/components/alias-selector.module.css";

interface AliasSelectorProps {
  index: number;
  value: string;
  isCustom: boolean;
  modelName: string;
  onAliasChange: (index: number, alias: string) => void;
  onSwitchToCustom: (index: number) => void;
}

export default function AliasSelector({
  index,
  value,
  isCustom,
  modelName,
  onAliasChange,
  onSwitchToCustom
}: AliasSelectorProps): React.JSX.Element {
  if (isCustom) {
    return (
      <div className={styles.aliasRow}>
        <input
          type="text"
          className={styles.aliasInput}
          value={value}
          onChange={(event) => onAliasChange(index, event.target.value)}
          placeholder="Custom name..."
          aria-label={`Custom alias for ${modelName}`}
        />
      </div>
    );
  }

  return (
    <div className={styles.aliasRow}>
      <select
        className={styles.aliasSelect}
        value={
          PRESET_ALIASES.includes(value) ? value : CUSTOM_ALIAS_SENTINEL
        }
        onChange={(event) => {
          const selected = event.target.value;
          if (selected === CUSTOM_ALIAS_SENTINEL) {
            onSwitchToCustom(index);
          } else {
            onAliasChange(index, selected);
          }
        }}
        aria-label={`Alias for ${modelName}`}
      >
        {PRESET_ALIASES.map((alias) => (
          <option key={alias} value={alias}>
            {alias}
          </option>
        ))}
        <option value={CUSTOM_ALIAS_SENTINEL}>Custom...</option>
      </select>
    </div>
  );
}
