/**
 * Whitelisted IPC channels. Every `invoke` channel must be registered in
 * `src/main/ipc.ts` and exposed explicitly by `src/preload/index.ts`; the
 * renderer has no generic `ipcRenderer` access.
 */
export const INVOKE = {
  appGetInfo: 'app:get-info',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsReset: 'settings:reset',
  themeGet: 'theme:get',

  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowGetState: 'window:get-state',

  webOpen: 'web:open',
  webClose: 'web:close',
  webSetBounds: 'web:set-bounds',
  webGoBack: 'web:go-back',
  webGoForward: 'web:go-forward',
  webReload: 'web:reload',
  webStop: 'web:stop',
  webGetState: 'web:get-state',
  webOpenExternal: 'web:open-external',
  webClearData: 'web:clear-data',

  dataGetHomeFeed: 'data:get-home-feed',
} as const;

/** Push events sent from the main process to the renderer. */
export const EVENTS = {
  webState: 'event:web-state',
  windowState: 'event:window-state',
  themeChanged: 'event:theme-changed',
  settingsChanged: 'event:settings-changed',
} as const;

export type InvokeChannel = (typeof INVOKE)[keyof typeof INVOKE];
export type EventChannel = (typeof EVENTS)[keyof typeof EVENTS];
