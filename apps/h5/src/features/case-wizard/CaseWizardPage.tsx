import { useState } from 'react';
import { InformationStep } from './InformationStep';
import { UploadStep } from '../uploads/UploadStep';
import { PdfPreviewStep } from '../signing/PdfPreviewStep';
import { SubmitStep } from './SubmitStep';
const steps = ['Information', 'Uploads', 'Preview & sign', 'Submit'] as const;
export function CaseWizardPage() {
  const [index, setIndex] = useState(0);
  const title = steps[index];
  return <main><ol aria-label="Application steps">{steps.map((step, i) => <li key={step} aria-current={i === index ? 'step' : undefined}>{step}</li>)}</ol>{index === 0 ? <InformationStep /> : index === 1 ? <UploadStep requirements={['Identity']} /> : index === 2 ? <PdfPreviewStep digest="pending" /> : <SubmitStep />}<div><button type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>Back</button>{index < steps.length - 1 && <button type="button" onClick={() => setIndex((i) => i + 1)}>Next</button>}</div></main>;
}
