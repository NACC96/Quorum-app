"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ModelResponse, RoundType } from "@/lib/types";
import { formatUsd, msToSeconds } from "@/lib/format";
import styles from "@/app/components/response-modal.module.css";

interface ResponseModalProps {
  response: ModelResponse | null;
  roundType: RoundType | null;
  onClose: () => void;
}

function focusablesWithin(element: HTMLElement): HTMLElement[] {
  return Array.from(
    element.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    )
  );
}

export default function ResponseModal({
  response,
  roundType,
  onClose
}: ResponseModalProps): React.JSX.Element | null {
  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [showRequestDetails, setShowRequestDetails] = useState(false);

  useEffect(() => {
    setShowRequestDetails(false);
  }, [response?.id]);

  useEffect(() => {
    if (!response) {
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
  }, [response, onClose]);

  if (!response) {
    return null;
  }

  const isJudgmentRound = roundType === "judgment";
  const systemMessage = response.inputMessages?.find((message) => message.role === "system");
  const userMessage = response.inputMessages?.find((message) => message.role === "user");
  const hasInputDetails = Boolean(systemMessage || userMessage);
  const toggleLabel = isJudgmentRound
    ? showRequestDetails
      ? "Hide AI input & verdict"
      : "Show AI input & verdict"
    : showRequestDetails
      ? "Hide AI input"
      : "Show AI input";

  return createPortal(
    <div className={styles.overlay} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <div className={styles.header}>
          <h2 id={headingId} className={styles.title}>
            <span className={styles.responseDot} style={{ backgroundColor: response.color }} aria-hidden />
            {response.modelName}
          </h2>

          <span className={styles.meta}>
            {response.tokenCount > 0 && <span>{response.tokenCount} tokens</span>}
            {response.latencyMs > 0 && <span>{msToSeconds(response.latencyMs)}</span>}
            {response.status === "complete" &&
              (typeof response.costUsd === "number" ? (
                <span>{formatUsd(response.costUsd)}</span>
              ) : (
                <span>cost n/a</span>
              ))}
          </span>

          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close response modal"
          >
            ×
          </button>
        </div>

        <div className={styles.detailsControl}>
          <button
            type="button"
            className={styles.detailsToggle}
            onClick={() => setShowRequestDetails((current) => !current)}
            aria-expanded={showRequestDetails}
          >
            {toggleLabel}
          </button>
        </div>

        {showRequestDetails && (
          <section className={styles.detailsPanel} aria-label="AI request details">
            {hasInputDetails ? (
              <>
                {systemMessage && (
                  <div className={styles.detailBlock}>
                    <p className={styles.detailLabel}>System prompt</p>
                    <pre className={styles.detailText}>{systemMessage.content}</pre>
                  </div>
                )}

                {userMessage && (
                  <div className={styles.detailBlock}>
                    <p className={styles.detailLabel}>User prompt</p>
                    <pre className={styles.detailText}>{userMessage.content}</pre>
                  </div>
                )}
              </>
            ) : (
              <p className={styles.detailFallback}>
                Input details unavailable for this older response.
              </p>
            )}

            {isJudgmentRound && (
              <div className={styles.detailBlock}>
                <p className={styles.detailLabel}>Verdict</p>
                <pre className={styles.detailText}>
                  {response.content || "No verdict content available."}
                </pre>
              </div>
            )}
          </section>
        )}

        <div className={`${styles.body} ${styles.markdownBody}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                const inline = !match && !String(children).includes("\n");

                return inline ? (
                  <code className={styles.inlineCode} {...props}>
                    {children}
                  </code>
                ) : (
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match?.[1] || "text"}
                    PreTag="div"
                    customStyle={{
                      borderRadius: "10px",
                      fontSize: "0.85rem",
                      margin: "0.75rem 0",
                      padding: "0.85rem"
                    }}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                );
              }
            }}
          >
            {response.content || ""}
          </ReactMarkdown>
        </div>
      </div>
    </div>,
    document.body
  );
}
