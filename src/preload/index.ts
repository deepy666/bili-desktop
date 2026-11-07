import type { IpcRendererEvent } from 'electron';
import { contextBridge, ipcRenderer } from 'electron';
import type { BiliApi, Unsubscribe } from '../shared/api';
import { EVENTS, INVOKE } from '../shared/ipc';
import type {
  AppInfo,
  AppSettings,
  HomeFeed,
  Rect,
  SettingsPatch,
  ThemeSnapshot,
  WebOpenRequest,
  WebViewState,
  WindowState,
} from '../shared/types';

/**
 * Preload bridge.
 *
 * The renderer gets exactly these functions and nothing else: no ipcRenderer,
 * no fs, no process. Every method maps to one whitelisted channel.
 */
function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const wrapped = (_event: IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}

const api: BiliApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(INVOKE.appGetInfo) as Promise<AppInfo>,
  },
  window: {
    minimize: () => ipcRenderer.invoke(INVOKE.windowMinimize) as Promise<void>,
    toggleMaximize: () => ipcRenderer.invoke(INVOKE.windowToggleMaximize) as Promise<WindowState>,
    close: () => ipcRenderer.invoke(INVOKE.windowClose) as Promise<void>,
    getState: () => ipcRenderer.invoke(INVOKE.windowGetState) as Promise<WindowState>,
    onStateChange: (listener) => subscribe<WindowState>(EVENTS.windowState, listener),
  },
  settings: {
    get: () => ipcRenderer.invoke(INVOKE.settingsGet) as Promise<AppSettings>,
    update: (patch: SettingsPatch) => ipcRenderer.invoke(INVOKE.settingsUpdate, patch) as Promise<AppSettings>,
    reset: () => ipcRenderer.invoke(INVOKE.settingsReset) as Promise<AppSettings>,
    onChanged: (listener) => subscribe<AppSettings>(EVENTS.settingsChanged, listener),
  },
  theme: {
    get: () => ipcRenderer.invoke(INVOKE.themeGet) as Promise<ThemeSnapshot>,
    onChanged: (listener) => subscribe<ThemeSnapshot>(EVENTS.themeChanged, listener),
  },
  web: {
    open: (request: WebOpenRequest) => ipcRenderer.invoke(INVOKE.webOpen, request) as Promise<WebViewState>,
    close: () => ipcRenderer.invoke(INVOKE.webClose) as Promise<WebViewState>,
    setBounds: (bounds: Rect) => {
      ipcRenderer.send(INVOKE.webSetBounds, bounds);
    },
    goBack: () => ipcRenderer.invoke(INVOKE.webGoBack) as Promise<WebViewState>,
    goForward: () => ipcRenderer.invoke(INVOKE.webGoForward) as Promise<WebViewState>,
    reload: () => ipcRenderer.invoke(INVOKE.webReload) as Promise<WebViewState>,
    stop: () => ipcRenderer.invoke(INVOKE.webStop) as Promise<WebViewState>,
    getState: () => ipcRenderer.invoke(INVOKE.webGetState) as Promise<WebViewState>,
    onStateChange: (listener) => subscribe<WebViewState>(EVENTS.webState, listener),
    openExternal: (url: string) => ipcRenderer.invoke(INVOKE.webOpenExternal, url) as Promise<boolean>,
    clearData: () => ipcRenderer.invoke(INVOKE.webClearData) as Promise<void>,
  },
  data: {
    getHomeFeed: () => ipcRenderer.invoke(INVOKE.dataGetHomeFeed) as Promise<HomeFeed>,
  },
};

contextBridge.exposeInMainWorld('bili', api);
