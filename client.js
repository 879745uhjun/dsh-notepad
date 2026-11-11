/**
 * Client half of the notepad plugin.
 *
 * A floating notepad card on the frame-wide overlay layer. Drag its header to
 * move it; releasing within 64px of any of the four edges snaps it flush against
 * that edge, with an accent line previewing the target edge during the drag.
 * Drag the bottom-right corner to resize. The header collapses it to a small tab
 * that can itself be dragged to another edge and clicked to expand again.
 * Text, geometry and collapse state persist in localStorage; images persist in
 * IndexedDB. Every visible string comes from the Client locale service.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-notepad',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const NS = 'dsh-notepad.panel';
    const STORAGE_KEY = 'dsh-notepad:v1';
    const DB_NAME = 'dsh-notepad';
    const DB_VERSION = 1;
    const STORE_IMAGES = 'images';
    const MIN_W = 260;
    const MAX_W = 760;
    const MIN_H = 180;
    const MAX_H = 760;
    const DEFAULT_W = 380;
    const DEFAULT_H = 300;
    const SNAP = 64;
    const PEEK = 32;
    const PEEK_LENGTH = 96;
    const PEEK_TRIGGER = 40;
    const TAB = 44;
    const MAX_IMAGE_EDGE = 1600;
    const MAX_IMAGE_BYTES = 900 * 1024;
    const NOTICE_MS = 3200;

    const EN = {
      'title': 'Notepad',
      'placeholder': 'Write a note... (saved automatically)',
      'collapse': 'Collapse notepad',
      'expand': 'Expand notepad',
      'addImage': 'Add image',
      'removeImage': 'Remove image',
      'clear': 'Clear text',
      'saved': 'Saved',
      'saving': 'Saving',
      'chars': 'characters',
      'images': 'images',
      'move': 'Drag to move — release near an edge to snap',
      'resize': 'Drag to resize',
      'peek': 'Drag it past the window edge to tuck it away, click to bring it back',
      'peekRestore': 'Click to bring the notepad back',
      'dropHint': 'Drop images to add',
      'closePreview': 'Close preview',
      'imageError': 'Could not add that image'
    };

    const ZH = {
      'title': '记事本',
      'placeholder': '写点什么...（自动保存）',
      'collapse': '收起记事本',
      'expand': '展开记事本',
      'addImage': '添加图片',
      'removeImage': '删除图片',
      'clear': '清空文字',
      'saved': '已保存',
      'saving': '保存中',
      'chars': '字',
      'images': '张图片',
      'move': '拖动移动，靠近四边自动吸附',
      'resize': '拖动调整大小',
      'peek': '拖出窗口外可收起，点把手拉回来',
      'peekRestore': '点击把记事本拉回来',
      'dropHint': '松开以添加图片',
      'closePreview': '关闭预览',
      'imageError': '这张图片添加失败'
    };

    const CSS = [
      '.dsh-notepad-card{position:absolute;z-index:2;display:flex;flex-direction:column;box-sizing:border-box;min-width:0;min-height:0;',
      'pointer-events:auto;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);',
      'border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);',
      'box-shadow:var(--dsw-elevation-prominent);overflow:hidden;',
      'font-family:var(--dsw-font-family,inherit);font-size:14px;line-height:22px;',
      '--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}',
      '.dsh-notepad-card__head{flex:none;height:40px;display:flex;align-items:center;gap:8px;padding:0 8px 0 12px;',
      'box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l3);',
      'cursor:grab;-webkit-app-region:no-drag;touch-action:none;user-select:none}',
      '.dsh-notepad-card__head:active{cursor:grabbing}',
      '.dsh-notepad-card__headIcon{flex:none;display:flex;color:var(--dsw-alias-label-secondary)}',
      '.dsh-notepad-card__title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}',
      '.dsh-notepad-card__btn{flex:none;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;',
      'border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;padding:0}',
      '.dsh-notepad-card__btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-notepad-card__body{flex:1;min-height:0;display:flex;align-items:stretch}',
      '.dsh-notepad-card__editor{flex:1;min-width:0;box-sizing:border-box;padding:10px 12px;border:none;outline:none;resize:none;',
      'background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:22px}',
      '.dsh-notepad-card__editor::placeholder{color:var(--dsw-alias-label-dimmed)}',
      '.dsh-notepad-card__media{flex:none;width:136px;box-sizing:border-box;display:grid;grid-template-columns:repeat(2,1fr);',
      'gap:6px;padding:8px;align-content:start;overflow:auto;border-left:.5px solid var(--dsw-alias-border-l3)}',
      '.dsh-notepad-card__thumb{position:relative;aspect-ratio:1;border-radius:var(--dsw-radius-sm);overflow:hidden;',
      'border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-notepad-card__thumbOpen{position:absolute;inset:0;width:100%;height:100%;padding:0;border:none;background:transparent;cursor:zoom-in;display:block}',
      '.dsh-notepad-card__thumbOpen img{width:100%;height:100%;object-fit:cover;display:block}',
      '.dsh-notepad-card__thumbRemove{position:absolute;top:2px;right:2px;width:20px;height:20px;padding:0;border:none;border-radius:50%;',
      'display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity .12s ease;',
      'background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-soft)}',
      '.dsh-notepad-card__thumb:hover .dsh-notepad-card__thumbRemove,.dsh-notepad-card__thumbRemove:focus-visible{opacity:1}',
      '.dsh-notepad-card__foot{flex:none;height:26px;padding:0 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;',
      'box-sizing:border-box;border-top:.5px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}',
      '.dsh-notepad-card__state--notice{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-notepad-card__edge{position:absolute;z-index:3;touch-action:none}',
      '.dsh-notepad-card__edge--left{left:0;top:12px;bottom:12px;width:6px;cursor:ew-resize}',
      '.dsh-notepad-card__edge--right{right:0;top:12px;bottom:12px;width:6px;cursor:ew-resize}',
      '.dsh-notepad-card__edge--top{top:0;left:12px;right:12px;height:6px;cursor:ns-resize}',
      '.dsh-notepad-card__edge--bottom{bottom:0;left:12px;right:12px;height:6px;cursor:ns-resize}',
      '.dsh-notepad-card__edge:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-notepad-card__grip{position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize;z-index:4;',
      'touch-action:none;background:linear-gradient(135deg,transparent 46%,var(--dsw-alias-border-l3) 46%)}',
      '.dsh-notepad-card__drop{position:absolute;inset:6px;z-index:5;display:flex;flex-direction:column;gap:10px;align-items:center;',
      'justify-content:center;color:var(--dsw-alias-brand-text);font-size:13px;border-radius:var(--dsw-radius-md);',
      'border:1px dashed var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-notepad-card__preview{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:32px;',
      'pointer-events:auto;cursor:zoom-out;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur)}',
      '.dsh-notepad-card__preview img{max-width:100%;max-height:100%;object-fit:contain;border-radius:var(--dsw-radius-sm);',
      'box-shadow:var(--dsw-elevation-prominent)}',
      '.dsh-notepad-card__previewClose{position:absolute;top:12px;right:12px;width:32px;height:32px;display:inline-flex;',
      'align-items:center;justify-content:center;border:none;border-radius:var(--dsw-radius-sm);cursor:pointer;padding:0;',
      'background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsh-notepad-card__previewClose:hover{background:var(--dsw-alias-bg-layer-3)}',
      '.dsh-notepad-tab{position:absolute;z-index:2;display:flex;align-items:center;justify-content:center;box-sizing:border-box;',
      'pointer-events:auto;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);',
      'background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-panel);color:var(--dsw-alias-label-secondary);',
      'cursor:grab;touch-action:none;user-select:none}',
      '.dsh-notepad-tab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3)}',
      '.dsh-notepad-snap{position:absolute;z-index:3;background:var(--dsw-alias-brand-primary);pointer-events:none;border-radius:2px}',
      '.dsh-notepad-peek{position:absolute;z-index:2;display:flex;align-items:center;justify-content:center;box-sizing:border-box;',
      'pointer-events:auto;border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-2);',
      'box-shadow:var(--dsw-elevation-panel);color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dsh-notepad-peek:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3)}',
      '.dsh-notepad-peek--left{border-left:none;border-radius:0 var(--dsw-radius-md) var(--dsw-radius-md) 0}',
      '.dsh-notepad-peek--right{border-right:none;border-radius:var(--dsw-radius-md) 0 0 var(--dsw-radius-md)}',
      '.dsh-notepad-peek--top{border-top:none;border-radius:0 0 var(--dsw-radius-md) var(--dsw-radius-md)}',
      '.dsh-notepad-peek--bottom{border-bottom:none;border-radius:var(--dsw-radius-md) var(--dsw-radius-md) 0 0}'
    ].join('');

    function chromeTop() {
      try {
        const raw = globalThis.getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-chrome-top');
        const value = Number.parseFloat(raw);
        return Number.isFinite(value) && value > 0 ? value : 0;
      } catch (err) {
        return 0;
      }
    }

    function readStored() {
      const fallback = {
        text: '',
        width: DEFAULT_W,
        height: DEFAULT_H,
        x: null,
        y: null,
        collapsed: false,
        peek: null
      };
      try {
        const raw = globalThis.localStorage.getItem(STORAGE_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        const num = (value, low, high, altitude) => (
          typeof value === 'number' && value >= low && value <= high ? value : altitude
        );
        return {
          text: typeof parsed.text === 'string' ? parsed.text : '',
          width: num(parsed.width, MIN_W, MAX_W, DEFAULT_W),
          height: num(parsed.height, MIN_H, MAX_H, DEFAULT_H),
          x: typeof parsed.x === 'number' ? parsed.x : null,
          y: typeof parsed.y === 'number' ? parsed.y : null,
          collapsed: parsed.collapsed === true,
          peek: parsed.peek === 'left' || parsed.peek === 'right' || parsed.peek === 'top' || parsed.peek === 'bottom'
            ? parsed.peek
            : null
        };
      } catch (err) {
        return fallback;
      }
    }

    /* ------------------------------------------------------------------ *
     * Geometry helpers. The overlay layer spans the frame, so viewport
     * coordinates are our coordinate space; only the window chrome band at
     * the top is reserved.
     * ------------------------------------------------------------------ */

    function bounds() {
      const w = typeof globalThis.innerWidth === 'number' && globalThis.innerWidth > 0 ? globalThis.innerWidth : 1280;
      const hgt = typeof globalThis.innerHeight === 'number' && globalThis.innerHeight > 0 ? globalThis.innerHeight : 800;
      return { w, h: hgt, top: chromeTop() };
    }

    function clampAxis(value, low, high) {
      return Math.min(Math.max(value, low), Math.max(low, high));
    }

    function fitSize(w, hgt, box) {
      return {
        w: clampAxis(w, MIN_W, Math.min(MAX_W, box.w - 16)),
        h: clampAxis(hgt, MIN_H, Math.min(MAX_H, box.h - box.top - 16))
      };
    }

    function fitPos(x, y, w, hgt, box) {
      return {
        x: clampAxis(x, 8, box.w - w - 8),
        y: clampAxis(y, box.top + 8, box.h - hgt - 8)
      };
    }

    function nearestEdge(x, y, w, hgt, box) {
      const candidates = [
        { edge: 'left', distance: x },
        { edge: 'right', distance: box.w - (x + w) },
        { edge: 'top', distance: y - box.top },
        { edge: 'bottom', distance: box.h - (y + hgt) }
      ];
      let best = null;
      for (const candidate of candidates) {
        if (candidate.distance <= SNAP && (best === null || candidate.distance < best.distance)) best = candidate;
      }
      return best === null ? null : best.edge;
    }

    function snapTo(edge, x, y, w, hgt, box) {
      if (edge === 'left') return { x: 0, y };
      if (edge === 'right') return { x: Math.max(0, box.w - w), y };
      if (edge === 'top') return { x, y: box.top };
      return { x, y: Math.max(box.top, box.h - hgt) };
    }

    /** Handle geometry for a card tucked outside the window: PEEK px stays visible. */
    function peekHandleStyle(edge, pos, box) {
      if (edge === 'left' || edge === 'right') {
        return {
          left: (edge === 'left' ? 0 : box.w - PEEK) + 'px',
          top: clampAxis(pos.y, box.top + 8, box.h - PEEK_LENGTH - 8) + 'px',
          width: PEEK + 'px',
          height: PEEK_LENGTH + 'px'
        };
      }
      return {
        left: clampAxis(pos.x, 8, box.w - PEEK_LENGTH - 8) + 'px',
        top: (edge === 'top' ? box.top : box.h - PEEK) + 'px',
        width: PEEK_LENGTH + 'px',
        height: PEEK + 'px'
      };
    }

    function snapRect(edge, x, y, w, hgt, box) {
      const thickness = 3;
      if (edge === 'left') return { left: '0px', top: y + 'px', width: thickness + 'px', height: hgt + 'px' };
      if (edge === 'right') return { left: (box.w - thickness) + 'px', top: y + 'px', width: thickness + 'px', height: hgt + 'px' };
      if (edge === 'top') return { left: x + 'px', top: (box.top) + 'px', width: w + 'px', height: thickness + 'px' };
      return { left: x + 'px', top: (box.h - thickness) + 'px', width: w + 'px', height: thickness + 'px' };
    }

    /* ------------------------------------------------------------------ *
     * Image storage: IndexedDB keeps blobs out of the localStorage budget.
     * ------------------------------------------------------------------ */

    let dbPromise = null;

    function openDb() {
      if (dbPromise !== null) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const idb = globalThis.indexedDB;
        if (!idb) {
          reject(new Error('indexedDB unavailable'));
          return;
        }
        const request = idb.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_IMAGES)) {
            const store = db.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
            store.createIndex('createdAt', 'createdAt');
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('indexedDB open failed'));
      });
      return dbPromise;
    }

    function runTx(mode, run) {
      return openDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_IMAGES, mode);
        let request;
        try {
          request = run(tx.objectStore(STORE_IMAGES));
        } catch (err) {
          reject(err);
          return;
        }
        tx.oncomplete = () => resolve(request ? request.result : undefined);
        tx.onerror = () => reject(tx.error || new Error('image store transaction failed'));
        tx.onabort = () => reject(tx.error || new Error('image store transaction aborted'));
      }));
    }

    function loadImages() {
      return runTx('readonly', (store) => store.getAll()).then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        return list.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      });
    }

    function putImage(record) {
      return runTx('readwrite', (store) => store.put(record));
    }

    function deleteImage(id) {
      return runTx('readwrite', (store) => store.delete(id));
    }

    async function normalizeImage(file) {
      if (typeof globalThis.createImageBitmap !== 'function' || typeof document === 'undefined') return file;
      let bitmap;
      try {
        bitmap = await globalThis.createImageBitmap(file);
      } catch (err) {
        return file;
      }
      try {
        const longest = Math.max(bitmap.width, bitmap.height) || 1;
        const scale = Math.min(1, MAX_IMAGE_EDGE / longest);
        if (scale === 1 && file.size <= MAX_IMAGE_BYTES) return file;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => {
          canvas.toBlob(resolve, 'image/webp', 0.9);
        });
        return blob || file;
      } finally {
        if (bitmap && typeof bitmap.close === 'function') bitmap.close();
      }
    }

    /** Creates one object URL per image id and revokes them on removal/unmount. */
    function useObjectUrls(images) {
      const [urls, setUrls] = useState({});
      const cache = useRef({});

      useEffect(() => {
        const live = cache.current;
        const next = {};
        let changed = false;
        for (const image of images) {
          if (live[image.id] === undefined) {
            live[image.id] = globalThis.URL.createObjectURL(image.blob);
            changed = true;
          }
          next[image.id] = live[image.id];
        }
        for (const id of Object.keys(live)) {
          if (next[id] === undefined) {
            globalThis.URL.revokeObjectURL(live[id]);
            delete live[id];
            changed = true;
          }
        }
        if (changed) setUrls(next);
      }, [images]);

      useEffect(() => () => {
        const live = cache.current;
        for (const id of Object.keys(live)) {
          globalThis.URL.revokeObjectURL(live[id]);
          delete live[id];
        }
      }, []);

      return urls;
    }

    /* ------------------------------------------------------------------ *
     * Icons
     * ------------------------------------------------------------------ */

    const iconProps = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' };

    const NoteIcon = (props) => h(
      'svg',
      Object.assign({}, iconProps, props),
      h('path', {
        d: 'M4 2.5h5.9L13 5.6v7.9a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5Z',
        stroke: 'currentColor',
        strokeWidth: 1.2,
        strokeLinejoin: 'round'
      }),
      h('path', { d: 'M9.6 2.8v3h3', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' }),
      h('path', { d: 'M5.6 8.6h4.8M5.6 11.2h3.2', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' })
    );

    const ImagePlusIcon = (props) => h(
      'svg',
      Object.assign({}, iconProps, props),
      h('rect', { x: 2.2, y: 3.4, width: 11.6, height: 9.2, rx: 1.4, stroke: 'currentColor', strokeWidth: 1.2 }),
      h('path', { d: 'M2.8 10.7 5.9 7.9l2.2 2 1.7-1.5 3.4 3', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' }),
      h('circle', { cx: 6.1, cy: 6.1, r: 1.05, stroke: 'currentColor', strokeWidth: 1.1 })
    );

    const ClearIcon = (props) => h(
      'svg',
      Object.assign({}, iconProps, props),
      h('path', {
        d: 'M3.2 4.6h9.6M6.6 4.6V3.2h2.8v1.4M4.7 4.6l.6 8a.6.6 0 0 0 .6.6h4.2a.6.6 0 0 0 .6-.6l.6-8',
        stroke: 'currentColor',
        strokeWidth: 1.2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
      })
    );

    const CloseIcon = (props) => h(
      'svg',
      Object.assign({}, iconProps, props),
      h('path', {
        d: 'M4.4 4.4l7.2 7.2M11.6 4.4l-7.2 7.2',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round'
      })
    );

    const CollapseIcon = (props) => h(
      'svg',
      Object.assign({}, iconProps, props),
      h('path', {
        d: 'M3.4 3.4 8 8l-4.6 4.6M9.4 3.4 14 8l-4.6 4.6',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
      })
    );

    /* ------------------------------------------------------------------ *
     * Notepad
     * ------------------------------------------------------------------ */

    function NotepadCard(props) {
      const t = (key) => (typeof props.t === 'function' ? props.t(key) : (EN[key] !== undefined ? EN[key] : key));

      const [boot] = useState(readStored);
      const [text, setText] = useState(boot.text);
      const [width, setWidth] = useState(boot.width);
      const [height, setHeight] = useState(boot.height);
      const [pos, setPos] = useState(() => {
        const box = bounds();
        const size = fitSize(boot.width, boot.height, box);
        const start = boot.x === null || boot.y === null
          ? { x: box.w - size.w - 24, y: box.top + 96 }
          : { x: boot.x, y: boot.y };
        const fixed = fitPos(start.x, start.y, size.w, size.h, box);
        return { x: fixed.x, y: fixed.y };
      });
      const [collapsed, setCollapsed] = useState(boot.collapsed);
      const [peek, setPeek] = useState(boot.peek);
      const [saved, setSaved] = useState(true);
      const [images, setImages] = useState([]);
      const [preview, setPreview] = useState(null);
      const [dragging, setDragging] = useState(false);
      const [snapEdge, setSnapEdge] = useState(null);
      const [notice, setNotice] = useState('');

      const fileRef = useRef(null);
      const dragDepth = useRef(0);
      const firstSave = useRef(true);
      const livePos = useRef(pos);
      const liveSize = useRef({ w: boot.width, h: boot.height });
      const moved = useRef(false);
      const urls = useObjectUrls(images);

      const applyPos = useCallback((next) => {
        livePos.current = next;
        setPos(next);
      }, []);

      useEffect(() => {
        if (firstSave.current) {
          firstSave.current = false;
          return undefined;
        }
        setSaved(false);
        const timer = globalThis.setTimeout(() => {
          try {
            globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({
              text,
              width,
              height,
              x: pos.x,
              y: pos.y,
              collapsed,
              peek
            }));
          } catch (err) {
            /* storage full or unavailable: keep the in-memory state */
          }
          setSaved(true);
        }, 250);
        return () => globalThis.clearTimeout(timer);
      }, [text, width, height, pos.x, pos.y, collapsed, peek]);

      useEffect(() => {
        let alive = true;
        loadImages()
          .then((rows) => {
            if (alive) setImages(rows);
          })
          .catch(() => {});
        return () => {
          alive = false;
        };
      }, []);

      useEffect(() => {
        if (!notice) return undefined;
        const timer = globalThis.setTimeout(() => setNotice(''), NOTICE_MS);
        return () => globalThis.clearTimeout(timer);
      }, [notice]);

      useEffect(() => {
        if (preview === null) return undefined;
        const onKey = (event) => {
          if (event.key === 'Escape') setPreview(null);
        };
        globalThis.addEventListener('keydown', onKey, true);
        return () => globalThis.removeEventListener('keydown', onKey, true);
      }, [preview]);

      // Keep the card inside the frame when the window is resized.
      useEffect(() => {
        const onResize = () => {
          const box = bounds();
          const resized = fitSize(liveSize.current.w, liveSize.current.h, box);
          liveSize.current = resized;
          setWidth(resized.w);
          setHeight(resized.h);
          const size = fitSize(width, height, box);
          const fixed = fitPos(livePos.current.x, livePos.current.y, size.w, size.h, box);
          applyPos({ x: fixed.x, y: fixed.y });
        };
        globalThis.addEventListener('resize', onResize);
        return () => globalThis.removeEventListener('resize', onResize);
      }, [applyPos, width, height]);

      const addFiles = useCallback((fileList) => {
        const list = Array.from(fileList || []).filter(
          (file) => file && typeof file.type === 'string' && file.type.indexOf('image/') === 0
        );
        if (list.length === 0) return;
        let failed = false;
        list.reduce(
          (chain, file) => chain.then(async () => {
            try {
              const blob = await normalizeImage(file);
              const record = {
                id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
                createdAt: Date.now(),
                name: file.name || 'image',
                type: blob.type || file.type,
                blob
              };
              await putImage(record);
              setImages((prev) => prev.concat(record).sort((a, b) => a.createdAt - b.createdAt));
            } catch (err) {
              failed = true;
            }
          }),
          Promise.resolve()
        ).then(() => {
          if (failed) setNotice('imageError');
        });
      }, []);

      const removeImage = useCallback((id) => {
        setImages((prev) => prev.filter((image) => image.id !== id));
        setPreview((prev) => (prev === id ? null : prev));
        deleteImage(id).catch(() => {});
      }, []);

      const onClear = useCallback(() => setText(''), []);

      /** Pointer drag with a live position ref so release sees the final spot. */
      const startDrag = useCallback((event, onMove, onEnd) => {
        if (event.button !== 0) return;
        event.preventDefault();
        moved.current = false;
        const startX = event.clientX;
        const startY = event.clientY;
        const move = (moveEvent) => {
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;
          onMove(dx, dy);
        };
        const up = () => {
          globalThis.removeEventListener('pointermove', move);
          globalThis.removeEventListener('pointerup', up);
          if (onEnd) onEnd();
        };
        globalThis.addEventListener('pointermove', move);
        globalThis.addEventListener('pointerup', up);
      }, []);

      const dragOrigin = useRef({ x: 0, y: 0 });

      /* The card may be dragged past an edge; PEEK pixels always stay visible so
         the release can re-anchor it as a slim handle. */
      const dragBox = useCallback((dx, dy, w, hgt) => {
        const box = bounds();
        const raw = { x: dragOrigin.current.x + dx, y: dragOrigin.current.y + dy };
        return {
          pos: {
            x: clampAxis(raw.x, -(w - PEEK), box.w - PEEK),
            y: clampAxis(raw.y, box.top - (hgt - PEEK), box.h - PEEK)
          },
          edge: nearestEdge(raw.x, raw.y, w, hgt, box)
        };
      }, []);

      /* Release rules: far out past an edge -> tuck into a handle there; otherwise
         the usual flush snap; otherwise keep the clamped free position. */
      const settle = useCallback((w, hgt) => {
        const box = bounds();
        const p = livePos.current;
        const overflow = {
          left: -p.x,
          right: (p.x + w) - box.w,
          top: box.top - p.y,
          bottom: (p.y + hgt) - box.h
        };
        let target = null;
        let deepest = PEEK_TRIGGER;
        for (const key of ['left', 'right', 'top', 'bottom']) {
          if (overflow[key] > deepest) {
            deepest = overflow[key];
            target = key;
          }
        }
        setSnapEdge(null);
        if (target !== null) {
          setPeek(target);
          return;
        }
        const edge = nearestEdge(p.x, p.y, w, hgt, box);
        applyPos(edge === null ? fitPos(p.x, p.y, w, hgt, box) : snapTo(edge, p.x, p.y, w, hgt, box));
      }, [applyPos]);

      const restoreFromPeek = useCallback(() => {
        setPeek(null);
        const box = bounds();
        const size = fitSize(liveSize.current.w, liveSize.current.h, box);
        applyPos(fitPos(livePos.current.x, livePos.current.y, size.w, size.h, box));
      }, [applyPos]);

      const onMoveCard = useCallback((event) => {
        dragOrigin.current = { x: livePos.current.x, y: livePos.current.y };
        startDrag(event, (dx, dy) => {
          const next = dragBox(dx, dy, width, height);
          applyPos(next.pos);
          setSnapEdge(next.edge);
        }, () => settle(width, height));
      }, [dragBox, height, settle, startDrag, width]);

      const onMoveTab = useCallback((event) => {
        dragOrigin.current = { x: livePos.current.x, y: livePos.current.y };
        startDrag(event, (dx, dy) => {
          const next = dragBox(dx, dy, TAB, TAB);
          applyPos(next.pos);
          setSnapEdge(next.edge);
        }, () => settle(TAB, TAB));
      }, [dragBox, settle, startDrag]);

      const onResizeCard = useCallback((event) => {
        const origin = { w: liveSize.current.w, h: liveSize.current.h };
        startDrag(event, (dx, dy) => {
          const box = bounds();
          const next = fitSize(origin.w + dx, origin.h + dy, box);
          liveSize.current = next;
          setWidth(next.w);
          setHeight(next.h);
        });
      }, [startDrag]);

      /* Every edge resizes: the opposite edge stays put, so dragging left or top
         also moves the card. Collapsing at a limit keeps the far edge anchored. */
      const onEdgeResize = useCallback((event, side) => {
        const originPos = { x: livePos.current.x, y: livePos.current.y };
        const origin = { w: liveSize.current.w, h: liveSize.current.h };
        const rightEdge = originPos.x + origin.w;
        const bottomEdge = originPos.y + origin.h;
        startDrag(event, (dx, dy) => {
          const box = bounds();
          const rawW = side === 'left' ? origin.w - dx : origin.w + dx;
          const rawH = side === 'top' ? origin.h - dy : origin.h + dy;
          let next = fitSize(rawW, rawH, box);
          let x = originPos.x;
          let y = originPos.y;
          if (side === 'left') {
            x = rightEdge - next.w;
            if (x < 8) {
              next = fitSize(rightEdge - 8, next.h, box);
              x = 8;
            }
          }
          if (side === 'top') {
            y = bottomEdge - next.h;
            if (y < box.top + 8) {
              next = fitSize(next.w, bottomEdge - box.top - 8, box);
              y = box.top + 8;
            }
          }
          liveSize.current = next;
          setWidth(next.w);
          setHeight(next.h);
          if (side === 'left' || side === 'top') applyPos({ x, y });
        });
      }, [applyPos, startDrag]);

      const onDragEnter = (event) => {
        if (!event.dataTransfer) return;
        dragDepth.current += 1;
        setDragging(true);
      };

      const onDragOver = (event) => {
        if (!event.dataTransfer) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      };

      const onDragLeave = () => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      };

      const onDrop = (event) => {
        if (!event.dataTransfer) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (collapsed) setCollapsed(false);
        addFiles(event.dataTransfer.files);
      };

      const onPaste = (event) => {
        const items = event.clipboardData && event.clipboardData.items;
        if (!items) return;
        const files = [];
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          if (item && item.kind === 'file' && typeof item.type === 'string' && item.type.indexOf('image/') === 0) {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
        if (files.length === 0) return;
        event.preventDefault();
        addFiles(files);
      };

      const previewImage = preview === null ? null : images.filter((image) => image.id === preview)[0] || null;
      const status = notice ? t(notice) : (saved ? t('saved') : t('saving'));
      const counter = text.length + ' ' + t('chars')
        + (images.length > 0 ? ' · ' + images.length + ' ' + t('images') : '');
      const box = bounds();
      const cardW = collapsed ? TAB : width;
      const cardH = collapsed ? TAB : height;
      const indicator = snapEdge === null ? null : snapRect(snapEdge, pos.x, pos.y, cardW, cardH, box);
      const peekStyle = peek === null ? null : peekHandleStyle(peek, pos, box);

      return h(
        React.Fragment,
        null,
        indicator === null ? null : h('div', { className: 'dsh-notepad-snap', style: indicator }),
        peek !== null
          ? h(
            'div',
            {
              className: 'dsh-notepad-peek dsh-notepad-peek--' + peek,
              style: peekStyle,
              onClick: restoreFromPeek,
              role: 'button',
              tabIndex: 0,
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') restoreFromPeek();
              },
              title: t('peekRestore'),
              'aria-label': t('peekRestore')
            },
            h(NoteIcon, { width: 14, height: 14 })
          )
          : collapsed
          ? h(
            'div',
            {
              className: 'dsh-notepad-tab',
              style: { left: pos.x + 'px', top: pos.y + 'px', width: TAB + 'px', height: TAB + 'px' },
              onPointerDown: onMoveTab,
              onClick: () => {
                if (moved.current) return;
                setCollapsed(false);
              },
              role: 'button',
              tabIndex: 0,
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') setCollapsed(false);
              },
              title: t('expand'),
              'aria-label': t('expand')
            },
            h(NoteIcon, { width: 15, height: 15 })
          )
          : h(
            'div',
            {
              className: 'dsh-notepad-card',
              style: { left: pos.x + 'px', top: pos.y + 'px', width: width + 'px', height: height + 'px' },
              onDragEnter,
              onDragOver,
              onDragLeave,
              onDrop,
              onPaste
            },
            h(
              'div',
              {
                className: 'dsh-notepad-card__head',
                onPointerDown: onMoveCard,
                title: t('move')
              },
              h(NoteIcon, { className: 'dsh-notepad-card__headIcon' }),
              h('span', { className: 'dsh-notepad-card__title' }, t('title')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-notepad-card__btn',
                  onClick: (event) => {
                    event.stopPropagation();
                    if (fileRef.current) fileRef.current.click();
                  },
                  onPointerDown: (event) => event.stopPropagation(),
                  title: t('addImage'),
                  'aria-label': t('addImage')
                },
                h(ImagePlusIcon)
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-notepad-card__btn',
                  onClick: (event) => {
                    event.stopPropagation();
                    onClear();
                  },
                  onPointerDown: (event) => event.stopPropagation(),
                  title: t('clear'),
                  'aria-label': t('clear')
                },
                h(ClearIcon)
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-notepad-card__btn',
                  onClick: (event) => {
                    event.stopPropagation();
                    setCollapsed(true);
                  },
                  onPointerDown: (event) => event.stopPropagation(),
                  title: t('collapse'),
                  'aria-label': t('collapse')
                },
                h(CollapseIcon)
              )
            ),
            h(
              'div',
              { className: 'dsh-notepad-card__body' },
              h('textarea', {
                className: 'dsh-notepad-card__editor',
                value: text,
                placeholder: t('placeholder'),
                spellCheck: false,
                onChange: (event) => setText(event.target.value)
              }),
              images.length > 0
                ? h(
                  'div',
                  { className: 'dsh-notepad-card__media' },
                  images.map((image) => h(
                    'div',
                    { key: image.id, className: 'dsh-notepad-card__thumb' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-notepad-card__thumbOpen',
                        onClick: () => setPreview(image.id),
                        title: image.name
                      },
                      urls[image.id] ? h('img', { src: urls[image.id], alt: image.name, draggable: false }) : null
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-notepad-card__thumbRemove',
                        onClick: () => removeImage(image.id),
                        title: t('removeImage'),
                        'aria-label': t('removeImage')
                      },
                      h(CloseIcon, { width: 12, height: 12 })
                    )
                  ))
                )
                : null
            ),
            h(
              'div',
              { className: 'dsh-notepad-card__foot' },
              h(
                'span',
                { className: 'dsh-notepad-card__state' + (notice ? ' dsh-notepad-card__state--notice' : '') },
                status
              ),
              h('span', null, counter)
            ),
            h('div', {
              className: 'dsh-notepad-card__edge dsh-notepad-card__edge--left',
              onPointerDown: (event) => onEdgeResize(event, 'left'),
              title: t('resize'),
              'aria-hidden': 'true'
            }),
            h('div', {
              className: 'dsh-notepad-card__edge dsh-notepad-card__edge--right',
              onPointerDown: (event) => onEdgeResize(event, 'right'),
              title: t('resize'),
              'aria-hidden': 'true'
            }),
            h('div', {
              className: 'dsh-notepad-card__edge dsh-notepad-card__edge--top',
              onPointerDown: (event) => onEdgeResize(event, 'top'),
              title: t('resize'),
              'aria-hidden': 'true'
            }),
            h('div', {
              className: 'dsh-notepad-card__edge dsh-notepad-card__edge--bottom',
              onPointerDown: (event) => onEdgeResize(event, 'bottom'),
              title: t('resize'),
              'aria-hidden': 'true'
            }),
            h('div', {
              className: 'dsh-notepad-card__grip',
              onPointerDown: onResizeCard,
              title: t('resize'),
              'aria-hidden': 'true'
            }),
            dragging
              ? h(
                'div',
                { className: 'dsh-notepad-card__drop' },
                h(ImagePlusIcon, { width: 22, height: 22 }),
                h('span', null, t('dropHint'))
              )
              : null
          ),
        previewImage
          ? h(
            'div',
            {
              className: 'dsh-notepad-card__preview',
              onClick: () => setPreview(null),
              role: 'presentation'
            },
            urls[previewImage.id]
              ? h('img', { src: urls[previewImage.id], alt: previewImage.name, draggable: false })
              : null,
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-notepad-card__previewClose',
                onClick: (event) => {
                  event.stopPropagation();
                  setPreview(null);
                },
                title: t('closePreview'),
                'aria-label': t('closePreview')
              },
              h(CloseIcon)
            )
          )
          : null,
        h('input', {
          ref: fileRef,
          type: 'file',
          accept: 'image/*',
          multiple: true,
          style: { display: 'none' },
          onChange: (event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }
        })
      );
    }

    /* ------------------------------------------------------------------ *
     * Client plugin
     * ------------------------------------------------------------------ */

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style');
          style.setAttribute('data-plugin-css', '@local/dsh-notepad/Notepad.module.css');
          style.textContent = CSS;
          document.head.appendChild(style);
          return () => {
            style.remove();
          };
        }, 'notepad: styles');

        ctx.effect(
          () => ctx.locale.register(NS, {
            zh: ZH,
            en: EN,
            ja: EN,
            es: EN,
            fr: EN,
            de: EN,
            ru: EN,
            pt: EN
          }),
          'notepad: locale dictionaries'
        );

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-notepad',
          order: 100,
          locale: NS
        }, NotepadCard));
      }
    };
  }
});
