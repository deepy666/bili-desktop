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
} from './types';

export type Unsubscribe = () => void;

export type BiliApi = {
  app: {
    getInfo(): Promise<AppInfo>;
  };
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<WindowState>;
    close(): Promise<void>;
    getState(): Promise<WindowState>;
    onStateChange(listener: (state: WindowState) => void): Unsubscribe;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(patch: SettingsPatch): Promise<AppSettings>;
    reset(): Promise<AppSettings>;
    onChanged(listener: (settings: AppSettings) => void): Unsubscribe;
  };
  theme: {
    get(): Promise<ThemeSnapshot>;
    onChanged(listener: (snapshot: ThemeSnapshot) => void): Unsubscribe;
  };
  web: {
    open(request: WebOpenRequest): Promise<WebViewState>;
    close(): Promise<WebViewState>;
    /** Reports the rectangle (DIP, window content coordinates) the web view should cover. */
    setBounds(bounds: Rect): void;
    goBack(): Promise<WebViewState>;
    goForward(): Promise<WebViewState>;
    reload(): Promise<WebViewState>;
    stop(): Promise<WebViewState>;
    getState(): Promise<WebViewState>;
    onStateChange(listener: (state: WebViewState) => void): Unsubscribe;
    openExternal(url: string): Promise<boolean>;
    clearData(): Promise<void>;
  };
  data: {
    getHomeFeed(): Promise<HomeFeed>;
  };
};
