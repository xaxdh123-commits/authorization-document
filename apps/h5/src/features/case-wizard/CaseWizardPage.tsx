import { useState } from 'react';
import { InformationStep } from './InformationStep';
import { UploadStep } from '../uploads/UploadStep';
import { PdfPreviewStep } from '../signing/PdfPreviewStep';
import { SubmitStep } from './SubmitStep';
import { createAutosave, type DraftClient } from './autosave';
const steps = ['Information', 'Uploads', 'Preview & sign', 'Submit'] as const;
export function CaseWizardPage({ draftClient }: { draftClient?: DraftClient } = {}) {
  const [index, setIndex] = useState(0);
  const autosave = createAutosave(draftClient ?? { saveDraft: async () => undefined });
  const title = steps[index];
  return <div className="wizard-shell"><main onInput={e => autosave((e.target as HTMLInputElement).value)}><ol aria-label="Application steps">{steps.map((step, i) => <li key={step} aria-current={i === index ? 'step' : undefined}>{step}</li>)}</ol>{index === 0 ? <InformationStep /> : index === 1 ? <UploadStep requirements={['Identity']} /> : index === 2 ? <PdfPreviewStep digest="pending" /> : <SubmitStep />}<div><button type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>Back</button>{index < steps.length - 1 && <button type="button" onClick={() => setIndex((i) => i + 1)}>Next</button>}</div></main></div>;
}
