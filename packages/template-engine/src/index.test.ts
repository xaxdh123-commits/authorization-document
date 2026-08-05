import { expect, it } from 'vitest';
import { renderTemplate } from './index.js';
it('renders declared variables deterministically', () => expect(renderTemplate({html:'Hello {{ name }}', variables:{name:'Ada'}})).toBe('Hello Ada'));
