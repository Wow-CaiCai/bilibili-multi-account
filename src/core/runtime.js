export const runtime = {
  state: null,
  host: undefined,
  shadow: undefined,
  dialog: undefined,
  statusBox: undefined,
  refreshAccountChoices: undefined,
  accountMenu: null,
  loginMethod: 'qrcode',
  disposeLogin: null,
  smsCooldownUntil: 0,
  LoginRSA: undefined,
  LoginQR: undefined,
  browserLabels: [],
  browserIdentity: { status: 'loading', mid: '', name: '' },
  browserReadPromise: undefined,
  profileRefreshPromise: undefined,
  panelDraft: null,
  panelAddingAccount: false,
  wbiKeys: undefined,
};
export const page = unsafeWindow;
export const noticeTimers = new Map();

export const profileAttempts = new Map();

export const pendingPlayerRefresh = new WeakMap();
export const nativeFetch = page.fetch;
export const nativeBeacon = page.navigator.sendBeacon;
export const playbackBootstraps = new Map();
export const trustedPlaybackData = new WeakSet();
export const PLAYER_INFO = new Set(['/x/player/v2', '/x/player/wbi/v2']);
