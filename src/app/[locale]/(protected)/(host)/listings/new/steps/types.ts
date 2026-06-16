import type { WizardData } from "../wizard";

/** Shared shape for every wizard step. `t` is the next-intl "Wizard" translator. */
export interface StepProps {
  data: WizardData;
  patch: (p: Partial<WizardData>) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}
