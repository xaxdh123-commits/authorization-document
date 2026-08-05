export function PdfPreviewStep({ digest }: { digest: string }) { return <section><h1>Preview & sign</h1><p>PDF digest: <span>{digest}</span></p><iframe title="PDF preview" /></section>; }
