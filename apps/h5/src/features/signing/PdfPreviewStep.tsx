import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PublicCaseModel } from '../case-wizard/model';
import {
  mapPlacementToSlots,
  type SignaturePlacement,
  type SignaturePosition,
  type SignatureSlot,
} from './SignaturePlacementEditor';

const PDF_WIDTH = 595;
const PDF_HEIGHT = 842;
const MAX_CANVAS_PIXELS = 8_000_000;

interface Props {
  digest: string;
  model?: PublicCaseModel;
  signature?: SignaturePlacement;
  previewUrl?: string;
  slots?: SignatureSlot[];
}

interface PdfCanvasPageProps {
  document: PDFDocumentProxy;
  pageNumber: number;
  positions: SignaturePosition[];
  resource: string;
  onRenderError: () => void;
  maxPixels: number;
}

function PdfCanvasPage({ document, pageNumber, positions, resource, onRenderError, maxPixels }: PdfCanvasPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: PDF_WIDTH, height: PDF_HEIGHT });

  useEffect(() => {
    let disposed = false;
    let renderTask: RenderTask | undefined;
    let loadedPage: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | undefined;

    void document.getPage(pageNumber).then((page) => {
      if (disposed) return;
      loadedPage = page;
      const viewport = page.getViewport({ scale: 1 });
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) throw new Error('Canvas is unavailable');

      const requestedRatio = window.devicePixelRatio || 1;
      const pixelRatio = Math.min(requestedRatio, Math.sqrt(maxPixels / (viewport.width * viewport.height)));
      canvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio));
      canvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio));
      setDimensions({ width: viewport.width, height: viewport.height });
      renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
      });
      return renderTask.promise;
    }).catch((error: unknown) => {
      if (!disposed && !(error instanceof Error && error.name === 'RenderingCancelledException')) {
        onRenderError();
      }
    });

    return () => {
      disposed = true;
      renderTask?.cancel();
      loadedPage?.cleanup();
      const canvas = canvasRef.current;
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    };
  }, [document, maxPixels, onRenderError, pageNumber]);

  return (
    <section
      className="server-pdf-page"
      aria-label={`PDF 第 ${pageNumber} 页`}
      style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}
    >
      <canvas ref={canvasRef} className="server-pdf-canvas" aria-hidden="true" />
      {positions.map((position) => (
        <img
          key={position.slotId}
          className="server-signature-overlay"
          src={resource}
          alt={`第 ${pageNumber} 页签署位置预览`}
          style={{
            left: `${position.x / dimensions.width * 100}%`,
            top: `${position.y / dimensions.height * 100}%`,
            width: `${position.width / dimensions.width * 100}%`,
            height: `${position.height / dimensions.height * 100}%`,
          }}
        />
      ))}
    </section>
  );
}

function PersistedPdfPreview({ document, loadFailed, positions, resource, onRenderError }: {
  document?: PDFDocumentProxy;
  loadFailed: boolean;
  positions: SignaturePosition[];
  resource: string;
  onRenderError: () => void;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => { setCurrentPage(1); }, [document]);
  if (loadFailed) {
    return <p className="pdf-preview-error" role="alert">PDF 预览加载失败，请点击“放大查看”打开原文件。</p>;
  }
  if (!document) return <p className="pdf-preview-loading">正在读取 PDF 页数…</p>;

  const visiblePageNumbers = Array.from({ length: document.numPages }, (_, index) => index + 1)
    .filter((pageNumber) => document.numPages <= 2 || Math.abs(pageNumber - currentPage) <= 1);
  const pagePixelBudget = Math.floor(MAX_CANVAS_PIXELS / visiblePageNumbers.length);

  return (
    <div className="server-pdf-pages">
      {document.numPages > 2 && <nav className="pdf-page-controls" aria-label="PDF 分页"><button type="button" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>上一页</button><span>第 {currentPage} 页 / 共 {document.numPages} 页</span><button type="button" disabled={currentPage === document.numPages} onClick={() => setCurrentPage((page) => Math.min(document.numPages, page + 1))}>下一页</button></nav>}
      {visiblePageNumbers.map((pageNumber) => (
        <PdfCanvasPage
          key={pageNumber}
          document={document}
          pageNumber={pageNumber}
          positions={positions.filter((position) => position.page === pageNumber)}
          resource={resource}
          onRenderError={onRenderError}
          maxPixels={pagePixelBudget}
        />
      ))}
    </div>
  );
}

export function PdfPreviewStep({ digest, model, signature, previewUrl, slots = [] }: Props) {
  const positions = signature?.resource ? mapPlacementToSlots(signature, slots) : [];
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [loadFailed, setLoadFailed] = useState(false);
  const handleRenderError = useCallback(() => setLoadFailed(true), []);

  useEffect(() => {
    if (!previewUrl) {
      setDocument(undefined);
      setLoadFailed(false);
      return;
    }
    let disposed = false;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    let loadedDocument: PDFDocumentProxy | undefined;
    setDocument(undefined);
    setLoadFailed(false);
    void import('pdfjs-dist').then((pdfjs) => {
      if (disposed) return undefined;
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      loadingTask = pdfjs.getDocument({ url: previewUrl });
      return loadingTask.promise;
    }).then((resolvedDocument) => {
      if (!disposed && resolvedDocument) {
        loadedDocument = resolvedDocument;
        setDocument(resolvedDocument);
      }
    }).catch(() => {
      if (!disposed) setLoadFailed(true);
    });
    return () => {
      disposed = true;
      loadedDocument?.cleanup();
      if (loadedDocument) void loadedDocument.destroy();
      else if (loadingTask) void loadingTask.destroy();
    };
  }, [previewUrl]);

  return (
    <div className="pdf-preview-wrap">
      <div className="pdf-toolbar">
        <div>
          <strong>授权书预览</strong>
          <span>{previewUrl ? (document ? `共 ${document.numPages} 页` : '正在读取页数…') : '第 1 页 / 共 1 页'}</span>
        </div>
        <button type="button" className="secondary-button" onClick={() => previewUrl && window.open(previewUrl, '_blank', 'noopener')}>放大查看</button>
      </div>
      <div className="pdf-stage">
        {previewUrl ? (
          <PersistedPdfPreview
            document={document}
            loadFailed={loadFailed}
            positions={positions}
            resource={signature?.resource ?? ''}
            onRenderError={handleRenderError}
          />
        ) : (
          <article className="pdf-sheet">
            <h2>委托生产物料授权书</h2>
            <p>委托方：{model?.customerName ?? '客户单位'}</p>
            <p>受托方：{model?.trusteeName ?? '受托生产单位'}</p>
            <p>兹授权受托方按照我方确认的资料及物料明细，为我方生产本业务单所列物料。我方确认所提交资料真实、合法、有效，并对授权范围承担相应责任。</p>
            <table>
              <thead><tr><th>物料名称</th><th>规格</th><th>数量</th></tr></thead>
              <tbody>{(model?.materials ?? []).slice(0, 3).map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.specification}</td><td>{item.quantity}{item.unit}</td></tr>)}</tbody>
            </table>
            <div className="pdf-sign-area">
              <span>甲方签名 / 盖章：</span>
              <div className="signature-slot">{signature?.resource ? <img src={signature.resource} alt="已放置的签章" style={{ left: `${signature.x}%`, top: `${signature.y}%`, transform: `translate(-50%,-50%) scale(${signature.scale})` }} /> : <em>签章将显示在此区域</em>}</div>
            </div>
            <footer>业务单号：{model?.caseNo ?? '—'}　生成日期：{new Date().toLocaleDateString('zh-CN')}</footer>
          </article>
        )}
      </div>
      <p className="digest">文档校验摘要：<span>{digest}</span></p>
    </div>
  );
}
