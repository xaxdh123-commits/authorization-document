import { fireEvent, render, screen } from '@testing-library/react'; import { SignaturePlacementEditor, mapPlacementToSlots } from './SignaturePlacementEditor';
test('supports signature mode selection', () => { render(<SignaturePlacementEditor />); expect(screen.getByRole('radiogroup', { name: '签署方式' })).toBeInTheDocument(); });

test('maps x y and scale into concrete positions inside every required slot', () => {
  expect(mapPlacementToSlots({ method: 'handwritten', resource: 'data:image/png;base64,AA==', x: 25, y: 75, scale: 1 }, [{ slotId: 'a', page: 1, x: 10, y: 20, width: 100, height: 50, required: true }])).toEqual([{ slotId: 'a', page: 1, x: 20, y: 35, width: 60, height: 30 }]);
});

test('sliders publish changed placement values', () => {
  const onChange = vi.fn();
  render(<SignaturePlacementEditor value={{ method: 'handwritten', resource: 'signed', x: 25, y: 75, scale: 1 }} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('水平位置', { selector: 'input' }), { target: { value: '40' } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ x: 40 }));
});
