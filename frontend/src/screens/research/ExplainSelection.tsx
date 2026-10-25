import { X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nProvider";
import { IconButton, Spinner } from "../../ui";
import { explain } from "./research-api";
import styles from "./ResearchBoard.module.css";

interface Anchor {
  x: number;
  y: number;
  text: string;
  context: string;
}

/**
 * 讲给我听: select something on the research page (a command, a test, a metric)
 * and the advisor says in a few sentences what it is, why it is there and what
 * it means. The answer is shown here and kept nowhere.
 */
export function ExplainSelection({
  root,
  projectId,
}: {
  root: RefObject<HTMLElement | null>;
  projectId: string;
}) {
  const { t } = useI18n();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [answer, setAnswer] = useState<{ text: string; failed?: boolean }>();
  const [asking, setAsking] = useState(false);
  const bubble = useRef<HTMLDivElement>(null);
  const open = !!answer || asking;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const pick = () =>
      window.setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim() ?? "";
        if (
          !selection?.rangeCount ||
          text.length < 2 ||
          text.length > 1000 ||
          !el.contains(selection.anchorNode)
        )
          return setAnchor((current) => (open ? current : null));
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        const node = selection.anchorNode;
        const block = (
          node instanceof Element ? node : node?.parentElement
        )?.closest("article, li, section, p");
        setAnswer(undefined);
        setAnchor({
          x: rect.left + rect.width / 2,
          y: rect.bottom,
          text,
          context: (block?.textContent ?? "").slice(0, 2000),
        });
      });
    el.addEventListener("mouseup", pick);
    el.addEventListener("keyup", pick);
    return () => {
      el.removeEventListener("mouseup", pick);
      el.removeEventListener("keyup", pick);
    };
  }, [root, open]);

  useEffect(() => {
    if (!anchor) return;
    const close = (event: Event) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !bubble.current?.contains(event.target as Node)
      ) {
        setAnchor(null);
        setAnswer(undefined);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [anchor]);

  if (!anchor) return null;
  const ask = async () => {
    setAsking(true);
    try {
      const reply = await explain(projectId, anchor.text, anchor.context);
      setAnswer({ text: reply.text });
    } catch (error) {
      setAnswer({
        text: error instanceof Error ? error.message : String(error),
        failed: true,
      });
    } finally {
      setAsking(false);
    }
  };
  const left = Math.min(Math.max(anchor.x, 180), window.innerWidth - 180);
  return createPortal(
    <div
      ref={bubble}
      className={styles.explain}
      style={{ left, top: anchor.y + 8 }}
      data-open={open || undefined}
    >
      {open ? (
        <div role="dialog" aria-label={t("research.explain.title")}>
          <header>
            <strong>{t("research.explain.title")}</strong>
            <IconButton
              size="sm"
              label={t("common.close")}
              icon={X}
              onClick={() => {
                setAnchor(null);
                setAnswer(undefined);
              }}
            />
          </header>
          {asking ? (
            <Spinner />
          ) : (
            <p data-failed={answer?.failed || undefined}>{answer?.text}</p>
          )}
        </div>
      ) : (
        <button type="button" onClick={ask}>
          {t("research.explain.title")}
        </button>
      )}
    </div>,
    document.body,
  );
}
