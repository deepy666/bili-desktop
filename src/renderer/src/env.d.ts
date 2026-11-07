import type { BiliApi } from '../../shared/api';

declare global {
  interface Window {
    /** Exposed by `src/preload/index.ts`; the only privileged API in the renderer. */
    bili: BiliApi;
  }
}

export {};
