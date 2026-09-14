import {expect, it, vi} from 'vitest';
import {handlePaginationShortcut} from './navigation';
it('leaves editing shortcuts alone and cancels handled browser history', () => {
  const navigate = vi.fn();
  const input = document.createElement('input');
  const edit = new KeyboardEvent('keydown', {key:'ArrowRight',altKey:true,cancelable:true});
  input.dispatchEvent(edit);
  expect(handlePaginationShortcut({event:edit,nextPage:{path:'/next'},navigate})).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
  const event = new KeyboardEvent('keydown', {key:'ArrowRight',altKey:true,cancelable:true});
  expect(handlePaginationShortcut({event,nextPage:{path:'/next'},navigate})).toBe(true);
  expect(event.defaultPrevented).toBe(true);
  expect(navigate).toHaveBeenCalledWith('/next');
});
