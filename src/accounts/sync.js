import { runtime } from '../core/runtime.js';
import { KEY } from '../core/config.js';
import { validateState } from './store.js';
import { notice } from '../ui/components.js';

export function installAccountSync() {
  GM_addValueChangeListener(KEY, (_key, _old, value, remote) => {
    if (remote) {
      try {
        runtime.state = validateState(value);
        notice('其他标签页已更新设置；刷新页面可更新首屏。');
      } catch (_) {
        /* Keep last valid state. */
      }
    }
  });
}
