import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n/i18n";
import { Button, Dialog } from "../../ui";
import { CALL_POINTS, setCallMe, type CallPoint } from "./research-api";
import styles from "./ResearchBoard.module.css";

/** When this research calls the researcher in; the rest of the time it goes on. */
export function CallMe({
  open,
  projectId,
  chosen,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  projectId: string;
  chosen: CallPoint[];
  onClose(): void;
  onSaved(): void;
  onError(error: unknown): void;
}) {
  const { t } = useI18n();
  const [points, setPoints] = useState<CallPoint[]>(chosen);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setPoints(chosen);
  }, [open, chosen]);
  const save = async () => {
    setSaving(true);
    try {
      await setCallMe(projectId, points);
      onSaved();
      onClose();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={open}
      size="sm"
      title={t("research.callMe.title")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {t("research.question.save")}
          </Button>
        </>
      }
    >
      <div className={styles.callMe}>
        {CALL_POINTS.map((point) => (
          <label key={point}>
            <input
              type="checkbox"
              checked={points.includes(point)}
              onChange={(event) =>
                setPoints(
                  event.target.checked
                    ? [...points, point]
                    : points.filter((p) => p !== point),
                )
              }
            />
            {t(`research.callMe.${point}` as MessageKey)}
          </label>
        ))}
      </div>
    </Dialog>
  );
}
