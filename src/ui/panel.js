import { runtime, page, profileAttempts } from '../core/runtime.js';
import { ROLES } from '../core/config.js';
import {
  el,
  button,
  icon,
  closeAccountMenu,
  clearNotice,
  notice,
  openTransferMenu,
  avatar,
} from './components.js';
import { stopLogin, importPanelAccounts, renderLoginForm } from '../auth/login.js';
import {
  refreshAccountProfiles,
  currentBrowserMid,
  displayName,
  detectBrowserAccount,
  updateBrowserInfo,
} from '../accounts/profiles.js';
import { validateState, save } from '../accounts/store.js';
import panelStyles from './panel.css';

export function mount() {
  if (runtime.host || !document.documentElement) return;
  runtime.host = el('div', null, { id: 'bilibili-multi-account' });
  runtime.shadow = runtime.host.attachShadow({ mode: 'open' });
  const style = el('style', panelStyles);
  const launcher = button('', openPanel, 'launcher');
  launcher.setAttribute('aria-label', '哔哩哔哩账号管理');
  launcher.title = '哔哩哔哩账号管理';
  launcher.append(icon('bilibili'));
  runtime.dialog = el('dialog', null, { 'aria-label': '哔哩哔哩账号管理' });
  runtime.dialog.addEventListener('click', (e) => {
    if (e.target !== runtime.dialog) return;
    const rect = runtime.dialog.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    )
      runtime.dialog.close();
  });
  runtime.dialog.addEventListener('pointerdown', (e) => {
    if (
      runtime.accountMenu &&
      !runtime.accountMenu.menu.contains(e.target) &&
      !runtime.accountMenu.trigger.contains(e.target)
    )
      closeAccountMenu();
  });
  runtime.dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && closeAccountMenu(true)) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
  runtime.dialog.addEventListener('close', () => {
    clearNotice();
    closeAccountMenu();
    stopLogin();
  });
  page.addEventListener('resize', () => closeAccountMenu());
  runtime.shadow.append(style, launcher, runtime.dialog);
  document.documentElement.append(runtime.host);
}
export function openPanel() {
  mount();
  runtime.panelDraft = { ...runtime.state.roles };
  runtime.panelAddingAccount = false;
  render();
  if (!runtime.dialog.open) runtime.dialog.showModal();
  void refreshAccountProfiles(true);
}
export function render() {
  clearNotice();
  stopLogin();
  closeAccountMenu();
  runtime.dialog.replaceChildren();
  runtime.browserLabels = [];
  runtime.refreshAccountChoices = null;
  if (!runtime.panelDraft) runtime.panelDraft = { ...runtime.state.roles };
  const draft = runtime.panelDraft;
  const sheet = el('div', null, { class: 'sheet' });
  const header = el('div', null, { class: 'header' });
  const close = button('', () => runtime.dialog.close(), 'close');
  close.setAttribute('aria-label', '关闭');
  close.append(icon('close'));
  const title = el('h2', null, { class: 'panel-title' });
  title.append(icon('bilibili'), document.createTextNode('哔哩哔哩账号管理'));
  header.append(title, close);
  sheet.append(header);
  const workspace = el('div', null, { class: 'workspace' });
  sheet.append(workspace);
  const pool = el('section', null, {
    class: `pool-pane${runtime.panelAddingAccount ? ' adding-account' : ''}`,
    'aria-labelledby': 'bilibili-pool-title',
  });
  const management = el('section', null, {
    class: 'assignment-pane',
    'aria-label': '账号分配管理',
  });
  workspace.append(pool, management);
  workspace.addEventListener('scroll', () => closeAccountMenu(), { passive: true });
  pool.addEventListener('scroll', () => closeAccountMenu(), { passive: true });
  const poolHeader = el('div', null, { class: 'pane-heading' });
  const poolTitle = el('h3', runtime.panelAddingAccount ? '添加账号' : '账号池', {
    id: 'bilibili-pool-title',
  });
  const entries = runtime.state.accounts.slice();
  if (!entries.some((a) => a.mid === currentBrowserMid())) entries.unshift({ mid: 'browser' });
  if (!runtime.panelAddingAccount)
    poolTitle.append(el('span', String(entries.length), { class: 'pool-count' }));
  const addAccount = button(
    '',
    () => {
      runtime.panelAddingAccount = !runtime.panelAddingAccount;
      render();
      runtime.shadow
        .querySelector(
          runtime.panelAddingAccount
            ? `[data-login-method="${runtime.loginMethod}"]`
            : '.add-account',
        )
        ?.focus();
    },
    'add-account',
  );
  addAccount.append(
    icon(runtime.panelAddingAccount ? 'back' : 'plus'),
    document.createTextNode(runtime.panelAddingAccount ? '返回' : '添加账号'),
  );
  addAccount.setAttribute('aria-label', runtime.panelAddingAccount ? '返回账号池' : '添加账号');
  addAccount.setAttribute('aria-expanded', String(runtime.panelAddingAccount));
  addAccount.setAttribute('aria-controls', 'bilibili-add-account');
  const file = el('input', null, {
    type: 'file',
    accept: '.json,.txt,application/json,text/plain',
    'aria-label': '从文件导入',
    hidden: '',
  });
  file.addEventListener('change', async () => {
    try {
      const selected = file.files[0];
      if (!selected) return;
      importPanelAccounts(await selected.text(), runtime.panelDraft || draft);
    } catch (error) {
      notice(error.message || '导入失败');
    } finally {
      file.value = '';
    }
  });
  const exportText = () =>
    JSON.stringify(validateState({ ...runtime.state, roles: { ...draft } }), null, 2);
  const transferButton = (label, symbol, items) => {
    const trigger = button('', () => openTransferMenu(trigger, items), 'pool-transfer');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.append(icon(symbol), document.createTextNode(label));
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        openTransferMenu(trigger, items);
      }
    });
    return trigger;
  };
  const importButton = transferButton('导入', 'download', [
    [
      '从剪贴板导入',
      'download',
      async () => {
        let text;
        try {
          text = await page.navigator.clipboard.readText();
        } catch (_) {
          throw new Error('无法读取剪贴板，请使用从文件导入');
        }
        if (!text.trim()) throw new Error('剪贴板为空');
        importPanelAccounts(text, runtime.panelDraft || draft);
      },
    ],
    ['从文件导入', 'download', () => file.click()],
  ]);
  const exportButton = transferButton('导出', 'upload', [
    [
      '导出到剪贴板',
      'upload',
      async () => {
        try {
          await page.navigator.clipboard.writeText(exportText());
        } catch (_) {
          throw new Error('无法写入剪贴板，请使用导出到文件');
        }
        notice('已导出到剪贴板');
      },
    ],
    [
      '导出到文件',
      'upload',
      () => {
        const url = URL.createObjectURL(new Blob([exportText()], { type: 'application/json' }));
        el('a', null, { href: url, download: 'bilibili-web-accounts.json' }).click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        notice('已导出到文件');
      },
    ],
  ]);
  const poolActions = el('div', null, { class: 'pool-actions' });
  poolActions.append(importButton, exportButton, addAccount);
  poolHeader.append(poolTitle, poolActions, file);
  pool.append(poolHeader);
  const content = el('div', null, {
    class: 'content',
    id: 'bilibili-panel-content',
    role: 'region',
    'aria-label': '账号分配',
  });
  management.append(content);
  const profileUpdaters = [];
  content.addEventListener('scroll', () => closeAccountMenu(), { passive: true });
  const options = () => [
    { mid: 'browser' },
    ...runtime.state.accounts.filter((a) => a.mid !== currentBrowserMid()),
    { mid: '0' },
  ];
  const makePicker = (role, title) => {
    const trigger = el('button', null, {
      type: 'button',
      class: 'account-picker',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      'aria-controls': `bilibili-account-menu-${role}`,
    });
    let picture = avatar(draft[role], 'small');
    const name = el('span', null, { class: 'picker-name' });
    trigger.append(picture, name, icon('down'));
    const selectedMid = () =>
      currentBrowserMid() && draft[role] === currentBrowserMid() ? 'browser' : draft[role];
    profileUpdaters.push(() => {
      const nextPicture = avatar(draft[role], 'small');
      picture.replaceWith(nextPicture);
      picture = nextPicture;
      name.textContent = displayName(draft[role]);
      trigger.setAttribute('aria-label', `${title}：${name.textContent}`);
      trigger.title = name.textContent;
    });
    const open = (last = false) => {
      closeAccountMenu();
      const menu = el('div', null, {
        class: 'account-menu',
        role: 'menu',
        id: `bilibili-account-menu-${role}`,
        'aria-label': title,
      });
      const position = () => {
        const bounds = runtime.dialog.getBoundingClientRect();
        const anchor = trigger.getBoundingClientRect();
        const width = runtime.dialog.clientWidth;
        const height = runtime.dialog.clientHeight;
        menu.style.width = `${Math.min(244, Math.max(0, width - 24))}px`;
        const below = height - (anchor.bottom - bounds.top) - 12;
        const above = anchor.top - bounds.top - 12;
        const placeBelow = below >= Math.min(menu.scrollHeight, 240) || below >= above;
        menu.style.maxHeight = `${Math.max(0, Math.min(240, placeBelow ? below : above))}px`;
        const left = anchor.right - bounds.left - runtime.dialog.clientLeft - menu.offsetWidth;
        const top = placeBelow
          ? anchor.bottom - bounds.top - runtime.dialog.clientTop + 6
          : anchor.top - bounds.top - runtime.dialog.clientTop - menu.offsetHeight - 6;
        menu.style.left = `${Math.max(8, Math.min(left, width - menu.offsetWidth - 8))}px`;
        menu.style.top = `${Math.max(8, Math.min(top, height - menu.offsetHeight - 8))}px`;
        menu.style.transformOrigin = placeBelow ? 'top right' : 'bottom right';
      };
      const update = () => {
        const focusedMid = menu.contains(runtime.shadow.activeElement)
          ? runtime.shadow.activeElement.dataset.mid
          : null;
        const scrollTop = menu.scrollTop;
        menu.replaceChildren();
        for (const account of options()) {
          const option = el('button', null, {
            type: 'button',
            class: 'account-option',
            role: 'menuitemradio',
            'aria-checked': String(selectedMid() === account.mid),
            tabindex: '-1',
            'data-mid': account.mid,
          });
          option.append(
            avatar(account.mid),
            el('span', displayName(account.mid), { class: 'picker-name' }),
            icon('check'),
          );
          option.addEventListener('click', () => {
            draft[role] = account.mid;
            closeAccountMenu(true);
            runtime.refreshAccountChoices?.();
          });
          menu.append(option);
        }
        position();
        if (focusedMid !== null)
          [...menu.children]
            .find((option) => option.dataset.mid === focusedMid)
            ?.focus({ preventScroll: true });
        menu.scrollTop = scrollTop;
      };
      menu.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          closeAccountMenu(true);
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const items = [...menu.children];
        const current = items.indexOf(runtime.shadow.activeElement);
        const index =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? items.length - 1
              : (current + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[index]?.focus();
      });
      runtime.accountMenu = { menu, trigger, update };
      runtime.dialog.append(menu);
      trigger.setAttribute('aria-expanded', 'true');
      update();
      const focused =
        menu.querySelector('[aria-checked=true]') ||
        (last ? menu.lastElementChild : menu.firstElementChild);
      focused?.focus({ preventScroll: true });
      if (focused)
        menu.scrollTop = Math.max(
          0,
          focused.offsetTop + focused.offsetHeight - menu.clientHeight + 6,
        );
    };
    trigger.addEventListener('click', () => {
      if (runtime.accountMenu?.trigger === trigger) closeAccountMenu(true);
      else open();
    });
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        open(e.key === 'ArrowUp');
      }
    });
    return trigger;
  };
  const addTool = (card, title, symbol, color, action) => {
    const frame = el('div', null, { class: 'tool-card' });
    const feedback = el('div', null, {
      class: 'notice tool-notice',
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true',
      hidden: '',
    });
    const showNotice = (message) => notice(message, feedback);
    const row = button(
      '',
      async () => {
        try {
          await action(showNotice);
        } catch (error) {
          showNotice(error.message || '操作失败');
        }
      },
      'tool-action',
    );
    row.setAttribute('aria-label', title);
    const tile = el('span', null, { class: `setting-icon ${color}` });
    tile.append(icon(symbol));
    row.append(tile, el('span', title, { class: 'setting-label' }));
    frame.append(row, feedback);
    card.append(frame);
    return row;
  };
  const saveAndReload = () => {
    runtime.state.roles = { ...draft };
    runtime.state.enabled = true;
    save();
    page.location.reload();
  };

  const accounts = el('div', null, { class: 'card' });
  for (const account of runtime.panelAddingAccount ? [] : entries) {
    const row = el('div', null, { class: 'account-row' });
    let picture = avatar(account.mid, 'small');
    const copy = el('div', null, { class: 'account-copy' });
    const name = el('span', displayName(account.mid), { class: 'account-name' });
    const badges = el('div', null, { class: 'badges' });
    copy.append(name, badges);
    const update = () => {
      name.textContent = displayName(account.mid);
      name.title = name.textContent;
      const nextPicture = avatar(account.mid, 'small');
      picture.replaceWith(nextPicture);
      picture = nextPicture;
      badges.replaceChildren();
      const isBrowser = account.mid === 'browser' || account.mid === currentBrowserMid();
      const loginState = isBrowser
        ? runtime.browserIdentity.status
        : profileAttempts.get(account.mid);
      const valid = loginState === 'loggedIn' || loginState === 'done';
      const invalid =
        loginState === 'loggedOut' || loginState === 'failed' || loginState === 'error';
      if (valid || invalid)
        badges.append(
          el('span', valid ? '有效' : '失效', {
            class: valid ? 'badge login-valid' : 'badge login-invalid',
          }),
        );
      if (isBrowser) badges.append(el('span', '当前登录', { class: 'badge' }));
      const savedAccount = runtime.state.accounts.find((a) => a.mid === account.mid);
      const hasProfile = isBrowser
        ? runtime.browserIdentity.status === 'loggedIn'
        : Boolean(savedAccount?.username);
      const isVip = isBrowser ? runtime.browserIdentity.vip : savedAccount?.vip;
      badges.append(
        el('span', hasProfile ? (isVip ? '大会员' : '非大会员') : '会员状态未读取', {
          class: hasProfile && isVip ? 'badge vip' : 'badge',
        }),
      );
    };
    profileUpdaters.push(update);
    row.append(picture, copy);
    if (account.mid !== 'browser') {
      const remove = button(
        '移除',
        () => {
          if (!page.confirm(`移除“${displayName(account.mid)}”保存的账号？`)) return;
          runtime.state.accounts = runtime.state.accounts.filter((a) => a.mid !== account.mid);
          for (const role of Object.keys(ROLES)) {
            if (runtime.state.roles[role] === account.mid) runtime.state.roles[role] = 'browser';
            if (draft[role] === account.mid) draft[role] = 'browser';
          }
          profileAttempts.delete(account.mid);
          save();
          render();
          notice('账号已移除');
        },
        'text-button danger',
      );
      remove.setAttribute('aria-label', `移除${displayName(account.mid)}`);
      row.append(remove);
    }
    accounts.append(row);
  }
  if (!runtime.panelAddingAccount) {
    pool.append(accounts);
    const refreshArea = el('div', null, { class: 'pool-refresh' });
    addTool(refreshArea, '更新账号信息', 'refresh', 'purple', async (showNotice) => {
      await detectBrowserAccount();
      await refreshAccountProfiles(true);
      runtime.refreshAccountChoices?.();
      showNotice('已更新');
    });
    pool.append(refreshArea);
  }
  const addArea = el('div', null, { id: 'bilibili-add-account' });
  addArea.hidden = !runtime.panelAddingAccount;
  pool.append(addArea);
  if (runtime.panelAddingAccount) renderLoginForm(addArea, draft);

  const details = el('div', null, { class: 'assignment-details' });
  content.append(details);
  details.addEventListener('scroll', () => closeAccountMenu(), { passive: true });
  const assignments = el('div', null, { class: 'card assignments' });
  const symbols = {
    main: ['person', 'blue'],
    heartbeat: ['history', 'green'],
    recommend: ['sparkle', 'purple'],
    video: ['play', 'orange'],
  };
  const descriptions = {
    main: '点赞、投币、收藏、关注、发评论等',
    heartbeat: '将观看历史记录到此账号',
    recommend: '根据此账号获取推荐内容',
    video: '使用此账号的权限获取视频流',
  };
  for (const [role, title] of Object.entries(ROLES)) {
    const row = el('div', null, { class: 'setting-row' });
    const tile = el('span', null, { class: `setting-icon ${symbols[role][1]}` });
    tile.append(icon(symbols[role][0]));
    const copy = el('div', null, { class: 'setting-copy' });
    const description = el('span', descriptions[role], {
      class: 'setting-description',
      id: `bilibili-role-description-${role}`,
    });
    copy.append(el('span', title, { class: 'setting-label' }), description);
    const picker = makePicker(role, title);
    picker.setAttribute('aria-describedby', description.id);
    row.append(tile, copy, picker);
    assignments.append(row);
  }
  details.append(assignments);
  const noticeSlot = el('div', null, { class: 'notice-slot' });
  runtime.statusBox = el('div', null, {
    class: 'notice',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
    hidden: '',
  });
  noticeSlot.append(runtime.statusBox);
  sheet.append(noticeSlot);
  const footer = el('div', null, { class: 'footer' });
  footer.append(
    button('取消', () => runtime.dialog.close(), 'action'),
    button('保存并刷新', saveAndReload, 'action primary'),
  );
  sheet.append(footer);
  runtime.dialog.append(sheet);
  runtime.refreshAccountChoices = () => {
    for (const update of profileUpdaters) update();
    runtime.accountMenu?.update();
  };
  updateBrowserInfo();
}
