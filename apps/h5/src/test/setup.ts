import '@testing-library/jest-dom';

Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: vi.fn(() => ({
    scale: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'round',
    lineJoin: 'round',
  })),
});
Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
  configurable: true,
  value: vi.fn(() => 'data:image/png;base64,dGVzdA=='),
});
