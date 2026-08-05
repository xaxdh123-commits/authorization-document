import { useState } from 'react';
const steps = ['Information', 'Uploads', 'Preview & sign', 'Submit'] as const;
export function CaseWizardPage() {
  const [index, setIndex] = useState(0);
  const title = steps[index];
  return <main><ol aria-label="Application steps">{steps.map((step, i) => <li key={step} aria-current={i === index ? 'step' : undefined}>{step}</li>)}</ol><section><h1>{title}</h1><p>{index === 0 ? 'Provide your application information.' : index === 1 ? 'Upload required documents.' : index === 2 ? 'Review the generated document and sign.' : 'Confirm and submit your application.'}</p>{index === 3 && <button type="button">Submit application</button>}</section><div><button type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>Back</button>{index < steps.length - 1 && <button type="button" onClick={() => setIndex((i) => i + 1)}>Next</button>}</div></main>;
}
