import { useEffect, useState } from "react";

/**
 * Changes each time the settings announce a model added, changed or removed.
 * The settings are a window over the screen they were opened from, so that
 * screen stays mounted: it reads the models again when this changes.
 */
export function useModelRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const bump = () => setRevision((n) => n + 1);
    window.addEventListener("model-settings-updated", bump);
    return () => window.removeEventListener("model-settings-updated", bump);
  }, []);
  return revision;
}
