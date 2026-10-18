import { runtime, page } from './core/runtime.js';
import { load } from './accounts/store.js';
import { installAccountSync } from './accounts/sync.js';
import { installPlaybackHooks } from './player/playback.js';
import { installNetworkHooks } from './network/interceptors.js';
import { detectBrowserAccount } from './accounts/profiles.js';
import { openPanel, mount } from './ui/panel.js';

runtime.state = load();
installAccountSync();
installPlaybackHooks();
installNetworkHooks();
if (page.self === page.top) {
  // Start reading the real browser account before presenting account choices.
  void detectBrowserAccount();
  GM_registerMenuCommand('哔哩哔哩账号管理', openPanel);
  if (document.documentElement) mount();
  else
    new MutationObserver((_records, observer) => {
      if (document.documentElement) {
        observer.disconnect();
        mount();
      }
    }).observe(document, { childList: true });
}
