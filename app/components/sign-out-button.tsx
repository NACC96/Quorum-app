"use client";

import { useState } from "react";
import styles from "@/app/components/nav-pill.module.css";

export default function SignOutButton(): React.JSX.Element {
  const [loading, setLoading] = useState(false);

  async function handleSignOut(): Promise<void> {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    } catch {
      window.location.href = "/";
    }
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className={styles.navCta}
      type="button"
    >
      {loading ? "..." : "Sign Out"}
    </button>
  );
}
