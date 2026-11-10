/**
 * Client half of the notepad plugin.
 *
 * Registers the notepad into the `shell.bottom` seat: a real layout row below the
 * sidebar, the centre column and the right column, so nothing is ever covered.
 * The row keeps its own height, can be collapsed to a thin bar, and survives
 * main-panel navigation. Note text, dock height and the collapsed state persist
 * in localStorage; images persist in IndexedDB. Every visible string comes from
 * the Client locale service.
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
    const BAR_HEIGHT = 38;
    const MIN_HEIGHT = 120;
    const MAX_HEIGHT = 720;
    const DEFAULT_HEIGHT = 220;
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
      'resize': 'Drag to resize',
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
      'resize': '拖动调整高度',
      'dropHint': '松开以添加图片',
      'closePreview': '关闭预览',
      'imageError': '这张图片添加失败'
    };

    const CSS = [
      '.dsh-notepad-dock{display:flex;flex-direction:column;box-sizing:border-box;width:100%;min-height:0;position:relative;',
      'color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);',
      'border-top:.5px solid var(--dsw-alias-border-l3);',
      'font-family:var(--dsw-font-family,inherit);font-size:14px;line-height:22px;',
      '--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}',
      '.dsh-notepad-dock__grip{position:absolute;left:0;right:0;top:-3px;height:6px;z-index:3;cursor:row-resize;touch-action:none}',
      '.dsh-notepad-dock__grip:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-notepad-dock__head{flex:none;height:38px;padding:0 10px 0 14px;display:flex;align-items:center;gap:8px;',
      'cursor:pointer;-webkit-app-region:no-drag;box-sizing:border-box}',
      '.dsh-notepad-dock__headIcon{flex:none;display:flex;color:var(--dsw-alias-label-secondary)}',
      '.dsh-notepad-dock__title{flex:none;font-weight:500}',
      '.dsh-notepad-dock__meta{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
      'text-align:right;padding-right:2px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.dsh-notepad-dock__meta--notice{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-notepad-dock__btn{flex:none;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;',
      'border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;padding:0}',
      '.dsh-notepad-dock__btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-notepad-dock__body{flex:1;min-height:0;display:flex;align-items:stretch;border-top:.5px solid var(--dsw-alias-border-l3)}',
      '.dsh-notepad-dock__editor{flex:1;min-width:0;box-sizing:border-box;padding:8px 14px 12px;border:none;outline:none;resize:none;',
      'background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:22px}',
      '.dsh-notepad-dock__editor::placeholder{color:var(--dsw-alias-label-dimmed)}',
      '.dsh-notepad-dock__media{flex:none;width:178px;box-sizing:border-box;display:grid;grid-template-columns:repeat(2,1fr);',
      'gap:6px;padding:8px;align-content:start;overflow:auto;border-left:.5px solid var(--dsw-alias-border-l3)}',
      '.dsh-notepad-dock__thumb{position:relative;aspect-ratio:1;border-radius:var(--dsw-radius-sm);overflow:hidden;',
      'border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-notepad-dock__thumbOpen{position:absolute;inset:0;width:100%;height:100%;padding:0;border:none;background:transparent;cursor:zoom-in;display:block}',
      '.dsh-notepad-dock__thumbOpen img{width:100%;height:100%;object-fit:cover;display:block}',
      '.dsh-notepad-dock__thumbRemove{position:absolute;top:3px;right:3px;width:20px;height:20px;padding:0;border:none;border-radius:50%;',
      'display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity .12s ease;',
      'background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-soft)}',
      '.dsh-notepad-dock__thumb:hover .dsh-notepad-dock__thumbRemove,.dsh-notepad-dock__thumbRemove:focus-visible{opacity:1}',
      '.dsh-notepad-dock__drop{position:absolute;inset:4px;z-index:5;display:flex;flex-direction:column;gap:10px;align-items:center;',
      'justify-content:center;color:var(--dsw-alias-brand-text);font-size:13px;border-radius:var(--dsw-radius-md);',
      'border:1px dashed var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-notepad-dock__preview{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:32px;',
      'cursor:zoom-out;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur)}',
      '.dsh-notepad-dock__preview img{max-width:100%;max-height:100%;object-fit:contain;border-radius:var(--dsw-radius-sm);',
      'box-shadow:var(--dsw-elevation-prominent)}',
      '.dsh-notepad-dock__previewClose{position:absolute;top:12px;right:12px;width:32px;height:32px;display:inline-flex;',
      'align-items:center;justify-content:center;border:none;border-radius:var(--dsw-radius-sm);cursor:pointer;padding:0;',
      'background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsh-notepad-dock__previewClose:hover{background:var(--dsw-alias-bg-layer-3)}'
    ].join('');

    function readStored() {
      const fallback = { text: '', height: DEFAULT_HEIGHT, collapsed: false };
      try {
        const raw = globalThis.localStorage.getItem(STORAGE_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return {
          text: typeof parsed.text === 'string' ? parsed.text : '',
          height: typeof parsed.height === 'number' && parsed.height >= MIN_HEIGHT && parsed.height <= MAX_HEIGHT
            ? parsed.height
            : DEFAULT_HEIGHT,
          collapsed: parsed.collapsed === true
        };
      } catch (err) {
        return fallback;
      }
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

    const ChevronUpIcon = (props) => h(
      'svg',
      Object.assign({}, iconProps, props),
      h('path', {
        d: 'M3.4 10.2 8 5.6l4.6 4.6',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
      })
    );

    const ChevronDownIcon = (props) => h(
      'svg',
      Object.assign({}, iconProps, props),
      h('path', {
        d: 'M3.4 5.8 8 10.4l4.6-4.6',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
      })
    );

    /* ------------------------------------------------------------------ *
     * Dock
     * ------------------------------------------------------------------ */

    function NotepadDock(props) {
      const t = (key) => (typeof props.t === 'function' ? props.t(key) : (EN[key] !== undefined ? EN[key] : key));

      const [boot] = useState(readStored);
      const [text, setText] = useState(boot.text);
      const [height, setHeight] = useState(boot.height);
      const [collapsed, setCollapsed] = useState(boot.collapsed);
      const [saved, setSaved] = useState(true);
      const [images, setImages] = useState([]);
      const [preview, setPreview] = useState(null);
      const [dragging, setDragging] = useState(false);
      const [notice, setNotice] = useState('');

      const fileRef = useRef(null);
      const dragDepth = useRef(0);
      const firstSave = useRef(true);
      const urls = useObjectUrls(images);

      useEffect(() => {
        if (firstSave.current) {
          firstSave.current = false;
          return undefined;
        }
        setSaved(false);
        const timer = globalThis.setTimeout(() => {
          try {
            globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({ text, height, collapsed }));
          } catch (err) {
            /* storage full or unavailable: keep the in-memory state */
          }
          setSaved(true);
        }, 250);
        return () => globalThis.clearTimeout(timer);
      }, [text, height, collapsed]);

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

      const onClear = useCallback((event) => {
        if (event) event.stopPropagation();
        setText('');
      }, []);

      const onResizeStart = useCallback((event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        setCollapsed(false);
        const startY = event.clientY;
        const startHeight = height;
        const maxHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, globalThis.innerHeight * 0.7));
        const onMove = (moveEvent) => {
          const next = Math.min(maxHeight, Math.max(MIN_HEIGHT, startHeight + (startY - moveEvent.clientY)));
          setHeight(next);
        };
        const onUp = () => {
          globalThis.removeEventListener('pointermove', onMove);
          globalThis.removeEventListener('pointerup', onUp);
        };
        globalThis.addEventListener('pointermove', onMove);
        globalThis.addEventListener('pointerup', onUp);
      }, [height]);

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
        setCollapsed(false);
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

      const heightLimit = typeof globalThis.innerHeight === 'number' && globalThis.innerHeight > 0
        ? Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, globalThis.innerHeight * 0.7))
        : MAX_HEIGHT;
      const dockHeight = collapsed ? BAR_HEIGHT : Math.min(Math.max(height, MIN_HEIGHT), heightLimit);

      return h(
        'div',
        {
          className: 'dsh-notepad-dock',
          style: { height: dockHeight + 'px' },
          onDragEnter,
          onDragOver,
          onDragLeave,
          onDrop,
          onPaste
        },
        h('div', {
          className: 'dsh-notepad-dock__grip',
          onPointerDown: onResizeStart,
          title: t('resize'),
          'aria-hidden': 'true'
        }),
        h(
          'div',
          {
            className: 'dsh-notepad-dock__head',
            onClick: () => setCollapsed((prev) => !prev),
            title: collapsed ? t('expand') : t('collapse')
          },
          h(NoteIcon, { className: 'dsh-notepad-dock__headIcon' }),
          h('span', { className: 'dsh-notepad-dock__title' }, t('title')),
          h(
            'span',
            {
              className: 'dsh-notepad-dock__meta'
                + (notice ? ' dsh-notepad-dock__meta--notice' : '')
            },
            status + ' · ' + counter
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-notepad-dock__btn',
              onClick: (event) => {
                event.stopPropagation();
                if (fileRef.current) fileRef.current.click();
              },
              title: t('addImage'),
              'aria-label': t('addImage')
            },
            h(ImagePlusIcon)
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-notepad-dock__btn',
              onClick: onClear,
              title: t('clear'),
              'aria-label': t('clear')
            },
            h(ClearIcon)
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-notepad-dock__btn',
              onClick: (event) => {
                event.stopPropagation();
                setCollapsed((prev) => !prev);
              },
              title: collapsed ? t('expand') : t('collapse'),
              'aria-label': collapsed ? t('expand') : t('collapse'),
              'aria-expanded': !collapsed
            },
            collapsed ? h(ChevronUpIcon) : h(ChevronDownIcon)
          )
        ),
        collapsed
          ? null
          : h(
            'div',
            { className: 'dsh-notepad-dock__body' },
            h('textarea', {
              className: 'dsh-notepad-dock__editor',
              value: text,
              placeholder: t('placeholder'),
              spellCheck: false,
              onChange: (event) => setText(event.target.value)
            }),
            images.length > 0
              ? h(
                'div',
                { className: 'dsh-notepad-dock__media' },
                images.map((image) => h(
                  'div',
                  { key: image.id, className: 'dsh-notepad-dock__thumb' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-notepad-dock__thumbOpen',
                      onClick: () => setPreview(image.id),
                      title: image.name
                    },
                    urls[image.id] ? h('img', { src: urls[image.id], alt: image.name, draggable: false }) : null
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-notepad-dock__thumbRemove',
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
        }),
        dragging && !collapsed
          ? h(
            'div',
            { className: 'dsh-notepad-dock__drop' },
            h(ImagePlusIcon, { width: 22, height: 22 }),
            h('span', null, t('dropHint'))
          )
          : null,
        previewImage
          ? h(
            'div',
            {
              className: 'dsh-notepad-dock__preview',
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
                className: 'dsh-notepad-dock__previewClose',
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
          : null
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

        ctx.slots.inject('shell.bottom', () => ctx.slots.register({
          name: 'shell.bottom',
          id: 'dsh-notepad',
          locale: NS
        }, NotepadDock));
      }
    };
  }
});
