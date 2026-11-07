import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { AppInfo, WindowState } from '../../shared/types';

function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    window.bili.app
      .getInfo()
      .then((value) => {
        if (!cancelled) setInfo(value);
      })
      .catch((error: unknown) => {
        console.error('[renderer] failed to read app info', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return info;
}

function useWindowState(): WindowState {
  const [state, setState] = useState<WindowState>({ maximized: false, fullscreen: false, focused: true });
  useEffect(() => {
    let cancelled = false;
    void window.bili.window.getState().then((value) => {
      if (!cancelled) setState(value);
    });
    const unsubscribe = window.bili.window.onStateChange((value) => setState(value));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return state;
}

interface NavItem {
  id: string;
  label: string;
  hint: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: '首页', hint: '阶段二' },
  { id: 'search', label: '搜索', hint: '阶段三' },
  { id: 'dynamic', label: '动态', hint: '阶段三' },
  { id: 'favorites', label: '收藏', hint: '阶段三' },
  { id: 'history', label: '历史', hint: '阶段三' },
  { id: 'settings', label: '设置', hint: '阶段四' },
];

function TitleBar(): JSX.Element {
  const { maximized } = useWindowState();

  const minimize = useCallback(() => {
    void window.bili.window.minimize();
  }, []);

  const toggleMaximize = useCallback(() => {
    void window.bili.window.toggleMaximize();
  }, []);

  const close = useCallback(() => {
    void window.bili.window.close();
  }, []);

  return (
    <header className="titlebar" onDoubleClick={toggleMaximize}>
      <div className="titlebar__brand">
        <span className="titlebar__logo" aria-hidden="true">
          B
        </span>
        <span className="titlebar__name">Bili Desktop</span>
        <span className="titlebar__badge">V0.1</span>
      </div>
      <div className="titlebar__spacer" />
      <div className="titlebar__actions">
        <button type="button" className="titlebar__button" aria-label="最小化" title="最小化" onClick={minimize}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="1" y="4.5" width="8" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          className="titlebar__button"
          aria-label={maximized ? '还原' : '最大化'}
          title={maximized ? '还原' : '最大化'}
          onClick={toggleMaximize}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="1.5" y="1.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
              <rect x="3.5" y="3.5" width="5" height="5" fill="var(--surface-0)" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="titlebar__button titlebar__button--close"
          aria-label="关闭"
          title="关闭"
          onClick={close}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </header>
  );
}

function Sidebar(): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="sidebar__section-label">导航</div>
      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <div
            key={item.id}
            className={`sidebar__item${item.id === 'home' ? ' sidebar__item--active' : ''}`}
            aria-disabled={item.id !== 'home'}
            title={`${item.label}（${item.hint}）`}
          >
            <span className="sidebar__dot" aria-hidden="true" />
            <span className="sidebar__label">{item.label}</span>
            {item.id !== 'home' ? <span className="sidebar__hint">{item.hint}</span> : null}
          </div>
        ))}
      </nav>
      <div className="sidebar__footer">
        <p>混合式客户端：本地 React 界面 + 主进程托管的 B 站网页视图。</p>
      </div>
    </aside>
  );
}

const STATUS_ITEMS: Array<{ label: string; key: keyof AppInfo; note: string }> = [
  { label: 'Electron', key: 'electron', note: '主进程运行时' },
  { label: 'Chromium', key: 'chrome', note: '网页渲染引擎' },
  { label: 'Node.js', key: 'node', note: '仅主进程与预加载' },
  { label: 'Version', key: 'version', note: '应用版本' },
];

function StageOnePanel({ info }: { info: AppInfo | null }): JSX.Element {
  return (
    <section className="panel">
      <div className="panel__header">
        <h2>阶段一 · 基础骨架</h2>
        <span className="panel__tag panel__tag--ok">已连通</span>
      </div>
      <ul className="checklist">
        <li className="checklist__item checklist__item--done">Electron 主进程 + React 渲染层可启动</li>
        <li className="checklist__item checklist__item--done">contextIsolation / sandbox / 无 nodeIntegration</li>
        <li className="checklist__item checklist__item--done">白名单 preload 桥接（window.bili）</li>
        <li className="checklist__item checklist__item--done">自定义标题栏与原生窗口控制</li>
        <li className="checklist__item checklist__item--done">类型检查、构建与真实启动冒烟脚本</li>
      </ul>
      <p className="panel__muted">
        当前环境：{info === null ? '读取中…' : `${info.platform} · ${info.isDev ? '开发' : '生产'}模式`}
      </p>
    </section>
  );
}

export default function App(): JSX.Element {
  const info = useAppInfo();

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className="content">
          <section className="hero">
            <p className="hero__eyebrow">第三方 Bilibili 桌面客户端 · 阶段一</p>
            <h1 className="hero__title">本地界面已就绪，正在接入网页视图</h1>
            <p className="hero__description">
              React 渲染层运行在启用沙箱的本地页面中，通过白名单 IPC 与主进程通信。下一阶段将完成导航、主题系统与视频卡片，
              随后由主进程创建 WebContentsView 承载 Bilibili 网页。
            </p>
          </section>

          <section className="status-grid" aria-label="运行时信息">
            {STATUS_ITEMS.map((item) => (
              <article key={item.label} className="status-card">
                <span className="status-card__label">{item.label}</span>
                <span className="status-card__value">{info === null ? '—' : String(info[item.key])}</span>
                <span className="status-card__note">{item.note}</span>
              </article>
            ))}
          </section>

          <StageOnePanel info={info} />
        </main>
      </div>
    </div>
  );
}
