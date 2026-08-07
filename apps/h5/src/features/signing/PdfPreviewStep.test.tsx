import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import { PdfPreviewStep } from './PdfPreviewStep';

const getPage = vi.fn();
const getDocument = vi.fn();
const pageCleanup = vi.fn();
const documentCleanup = vi.fn();
const documentDestroy = vi.fn();

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: (...args: unknown[]) => getDocument(...args),
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'pdf.worker.js' }));

beforeEach(() => {
  getPage.mockReset();
  getDocument.mockReset();
  pageCleanup.mockReset();
  documentCleanup.mockReset();
  documentDestroy.mockReset();
  getPage.mockImplementation(async (pageNumber: number) => ({
    getViewport: () => ({ width: 595, height: 842 }),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
    pageNumber,
    cleanup: pageCleanup,
  }));
  getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages: 2, getPage, cleanup: documentCleanup, destroy: documentDestroy }),
    destroy: vi.fn(),
  });
});

test('shows PDF preview digest', () => {
  render(<PdfPreviewStep digest="abc123" />);
  expect(screen.getByText('授权书预览')).toBeInTheDocument();
  expect(screen.getByText('abc123')).toBeInTheDocument();
});

test('renders every page reported by a two-page persisted PDF', async () => {
  render(<PdfPreviewStep digest="sha" previewUrl="blob:two-page-preview" />);

  expect(await screen.findByLabelText('PDF 第 1 页')).toBeInTheDocument();
  expect(screen.getByLabelText('PDF 第 2 页')).toBeInTheDocument();
  expect(screen.getByText('共 2 页')).toBeInTheDocument();
  expect(getDocument).toHaveBeenCalledWith({ url: 'blob:two-page-preview' });
  expect(getDocument).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(getPage).toHaveBeenCalledTimes(2));
});

test('maps x/y/scale into required slots and overlays them on their matching PDF pages', async () => {
  render(
    <PdfPreviewStep
      digest="sha"
      previewUrl="blob:two-page-preview"
      signature={{ method: 'handwritten', resource: 'data:image/png;base64,AA==', x: 25, y: 75, scale: 1 }}
      slots={[
        { slotId: 'page-one-signature', page: 1, x: 10, y: 20, width: 100, height: 50, required: true },
        { slotId: 'page-two-seal', page: 2, x: 100, y: 200, width: 200, height: 100, required: true },
      ]}
    />,
  );

  const pageOneOverlay = await screen.findByAltText('第 1 页签署位置预览');
  const pageTwoOverlay = screen.getByAltText('第 2 页签署位置预览');
  expect(pageOneOverlay.closest('[aria-label="PDF 第 1 页"]')).not.toBeNull();
  expect(pageTwoOverlay.closest('[aria-label="PDF 第 2 页"]')).not.toBeNull();
  expect(pageOneOverlay).toHaveStyle({
    left: `${20 / 595 * 100}%`,
    top: `${35 / 842 * 100}%`,
    width: `${60 / 595 * 100}%`,
    height: `${30 / 842 * 100}%`,
  });
  expect(pageTwoOverlay).toHaveStyle({
    left: `${120 / 595 * 100}%`,
    top: `${230 / 842 * 100}%`,
    width: `${120 / 595 * 100}%`,
    height: `${60 / 842 * 100}%`,
  });
  await waitFor(() => expect(getPage).toHaveBeenCalledTimes(2));
});

test('does not reload or rerender the PDF when only signature positions change', async () => {
  const { rerender } = render(
    <PdfPreviewStep
      digest="sha"
      previewUrl="blob:stable"
      signature={{ method: 'handwritten', resource: 'data:image/png;base64,AA==', x: 10, y: 20, scale: 1 }}
      slots={[{ slotId: 'signature', page: 1, x: 10, y: 20, width: 100, height: 50, required: true }]}
    />,
  );
  await waitFor(() => expect(getPage).toHaveBeenCalled());
  const pageCalls = getPage.mock.calls.length;

  rerender(
    <PdfPreviewStep
      digest="sha"
      previewUrl="blob:stable"
      signature={{ method: 'handwritten', resource: 'data:image/png;base64,AA==', x: 80, y: 20, scale: 1 }}
      slots={[{ slotId: 'signature', page: 1, x: 10, y: 20, width: 100, height: 50, required: true }]}
    />,
  );

  expect(getDocument).toHaveBeenCalledTimes(1);
  expect(getPage).toHaveBeenCalledTimes(pageCalls);
});

test('caps canvas pixels and releases page and document resources on unmount', async () => {
  const originalRatio = window.devicePixelRatio;
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 8 });
  getPage.mockImplementation(async () => ({
    getViewport: () => ({ width: 4000, height: 4000 }),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
    cleanup: pageCleanup,
  }));
  getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages: 2, getPage, cleanup: documentCleanup, destroy: documentDestroy }),
    destroy: vi.fn(),
  });
  const { unmount } = render(<PdfPreviewStep digest="sha" previewUrl="blob:large" />);
  const canvases = await waitFor(() => {
    const found = Array.from(document.querySelectorAll('canvas'));
    expect(found).toHaveLength(2);
    expect(found.every((canvas) => canvas.width > 0)).toBe(true);
    return found;
  });
  expect(canvases.reduce((pixels, canvas) => pixels + canvas.width * canvas.height, 0)).toBeLessThanOrEqual(8_000_000);
  unmount();
  expect(pageCleanup).toHaveBeenCalled();
  expect(documentCleanup).toHaveBeenCalled();
  expect(documentDestroy).toHaveBeenCalled();
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: originalRatio });
});
