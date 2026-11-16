/**
 * Client half of the notepad plugin.
 *
 * One notepad, two layouts, switchable at runtime from either surface:
 *  - float: a card on the frame-wide overlay layer. Drag the header to move it;
 *    releasing near an edge snaps it flush (an accent line previews the edge),
 *    releasing past an edge tucks it into a slim handle. Every edge resizes.
 *  - dock: a real layout row in `shell.bottom`, below all three columns, so the
 *    columns shrink instead of being covered.
 *
 * Text, images and mode live in one shared store so both surfaces show the same
 * note and switching never loses a keystroke. Images persist as blobs in
 * IndexedDB, everything else in localStorage. Visible strings come from the
 * Client locale service.
 */
window.__ModuleLoader__.load({
  id: 'dsh-notepad-card',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const NS = 'dsh-notepad.panel';
    const STORAGE_KEY = 'dsh-notepad:v1';
    const DB_NAME = 'dsh-notepad';
    const DB_VERSION = 1;
    const STORE_IMAGES = 'images';
    const MODE_FLOAT = 'float';
    const MODE_DOCK = 'dock';
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
    const DOCK_MIN_H = 120;
    const DOCK_MAX_H = 720;
    const DOCK_DEFAULT_H = 220;
    const DOCK_BAR = 38;
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
      'move': 'Drag to move — release near an edge to snap, past it to tuck away',
      'resize': 'Drag to resize',
      'peek': 'Click to bring the notepad back',
      'dropHint': 'Drop images to add',
      'closePreview': 'Close preview',
      'imageError': 'Could not add that image',
      'toDock': 'Dock to the bottom row',
      'numbering': 'Number',
      'numberingHint': 'Auto numbering: Enter continues the list, an empty item ends it',
      'insertTodo': 'To-do',
      'insertTodoHint': 'Turn the current line into a to-do, or tick it',
      'todosLabel': 'List',
      'todosHint': 'List every - [ ] item in the note',
      'todoEmpty': 'No to-dos yet — use the To-do button to add one on the current line.',
      'renumber': 'Renumber',
      'renumberHint': 'Rewrite every numbered line as 1, 2, 3 … per indent level',
      'clearDone': 'Remove done',
      'linkImage': 'Insert a link to this image at the cursor',
      'copyImage': 'Copy this image',
      'todosTitle': 'To-dos',
      'todoToggle': 'Tick or untick',
      'todoJump': 'Jump to this line in the note',
      'close': 'Close',
      'toFloat': 'Detach as a floating card'
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
      'move': '拖动移动：靠近边缘吸附，拖过头则收起',
      'resize': '拖动调整大小',
      'peek': '点击把记事本拉回来',
      'dropHint': '松开以添加图片',
      'closePreview': '关闭预览',
      'imageError': '这张图片添加失败',
      'toDock': '停靠到底部栏',
      'numbering': '编号',
      'numberingHint': '自动编号：回车续号，空行结束',
      'insertTodo': '待办',
      'insertTodoHint': '把当前行变成待办，已勾选则取消',
      'todosLabel': '清单',
      'todosHint': '列出笔记里所有 - [ ] 待办',
      'todoEmpty': '还没有待办——用上面的「待办」按钮在当前行加一条。',
      'renumber': '重新编号',
      'renumberHint': '把所有编号行按缩进分组重排成 1、2、3…',
      'clearDone': '清除已完成',
      'linkImage': '在光标处插入这张图片的链接',
      'copyImage': '复制这张图片',
      'todosTitle': '待办',
      'todoToggle': '勾选 / 取消',
      'todoJump': '跳到笔记里的这一行',
      'close': '关闭',
      'toFloat': '脱离为悬浮卡片'
    };

    const FLOAT_CSS = [
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
      '.dsh-notepad-peek--bottom{border-bottom:none;border-radius:var(--dsw-radius-md) var(--dsw-radius-md) 0 0}',
      '.dsh-notepad-bar{flex:none;display:flex;align-items:center;gap:4px;height:30px;padding:0 8px;box-sizing:border-box;',
      'border-bottom:.5px solid var(--dsw-alias-border-l3)}',
      '.dsh-notepad-bar--inline{height:auto;padding:0;border-bottom:none;gap:2px}',
      '.dsh-notepad-bar__btn{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border:none;',
      'border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);',
      'font-family:inherit;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}',
      '.dsh-notepad-bar__btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dsh-notepad-bar__btn.is-on{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary)}',
      '.dsh-notepad-veil{position:fixed;inset:0;z-index:1000}',
      '.dsh-notepad-pop{position:fixed;z-index:1001;width:288px;max-height:320px;overflow:auto;padding:6px;box-sizing:border-box;',
      'display:flex;flex-direction:column;gap:2px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);',
      'border-radius:var(--dsw-radius-md);box-shadow:var(--dsw-elevation-prominent);',
      '--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}',
      '.dsh-notepad-pop__empty{padding:10px 8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.dsh-notepad-pop__row{display:flex;align-items:flex-start;gap:8px;padding:5px 6px;border:none;border-radius:var(--dsw-radius-sm);',
      'background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer}',
      '.dsh-notepad-pop__row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-notepad-pop__row.is-done{color:var(--dsw-alias-label-dimmed);text-decoration:line-through}',
      '.dsh-notepad-pop__box{flex:none;width:14px;height:14px;margin-top:3px;border-radius:3px;border:1px solid var(--dsw-alias-border-l4);',
      'display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary-inverted)}',
      '.dsh-notepad-pop__row.is-done .dsh-notepad-pop__box{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-notepad-pop__label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-notepad-pop__foot{margin-top:4px;padding:6px 8px;border:none;border-top:.5px solid var(--dsw-alias-border-l3);',
      'background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:18px;',
      'text-align:left;cursor:pointer}',
      '.dsh-notepad-pop__foot:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-notepad-todos{flex:none;max-height:38%;overflow:auto;box-sizing:border-box;display:flex;flex-direction:column;',
      'border-bottom:.5px solid var(--dsw-alias-border-l3);padding:2px 0 6px;',
      'font-family:var(--dsw-font-family,inherit);font-size:13px;line-height:20px}',
      '.dsh-notepad-todos__head{display:flex;align-items:center;gap:6px;padding:4px 10px 2px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.dsh-notepad-todos__title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-notepad-todos__act{border:none;background:transparent;color:inherit;font-family:inherit;font-size:12px;line-height:18px;',
      'cursor:pointer;padding:0 4px;border-radius:var(--dsw-radius-xs)}',
      '.dsh-notepad-todos__act:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-notepad-todos__empty{padding:6px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.dsh-notepad-todos__row{display:flex;align-items:flex-start;gap:8px;padding:1px 10px;box-sizing:border-box}',
      '.dsh-notepad-todos__box{flex:none;width:15px;height:15px;margin:3px 0 0;padding:0;border-radius:4px;',
      'border:1px solid var(--dsw-alias-border-l4);background:transparent;color:var(--dsw-alias-label-primary-inverted);',
      'display:inline-flex;align-items:center;justify-content:center;cursor:pointer}',
      '.dsh-notepad-todos__row.is-done .dsh-notepad-todos__box{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-notepad-todos__label{flex:1;min-width:0;padding:0;border:none;background:transparent;text-align:left;',
      'color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px;cursor:pointer;',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:var(--dsw-radius-xs)}',
      '.dsh-notepad-todos__label:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-notepad-todos__row.is-done .dsh-notepad-todos__label{color:var(--dsw-alias-label-dimmed);text-decoration:line-through}',
      '.dsh-notepad-rail{flex:none;width:146px;box-sizing:border-box;display:grid;grid-template-columns:repeat(2,1fr);',
      'gap:8px;padding:8px;align-content:start;overflow:auto;border-left:.5px solid var(--dsw-alias-border-l3)}',
      '.dsh-notepad-rail__item{position:relative;aspect-ratio:1;border-radius:var(--dsw-radius-sm);overflow:hidden;',
      'border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-notepad-rail__item.is-active{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary)}',
      '.dsh-notepad-rail__open{position:absolute;inset:0;width:100%;height:100%;padding:0;border:none;background:transparent;cursor:zoom-in;display:block}',
      '.dsh-notepad-rail__open img{width:100%;height:100%;object-fit:cover;display:block}',
      '.dsh-notepad-rail__tools{position:absolute;top:2px;right:2px;display:flex;gap:2px;opacity:0;transition:opacity .12s ease}',
      '.dsh-notepad-rail__item:hover .dsh-notepad-rail__tools,.dsh-notepad-rail__tools:focus-within{opacity:1}',
      '.dsh-notepad-rail__tool{width:20px;height:20px;padding:0;border:none;border-radius:50%;display:inline-flex;',
      'align-items:center;justify-content:center;cursor:pointer;background:var(--dsw-alias-bg-layer-2);',
      'color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-soft)}',
      '.dsh-notepad-rail__tool:hover{background:var(--dsw-alias-bg-layer-3)}',
      '.dsh-notepad-rail__badge{position:absolute;left:3px;bottom:2px;padding:0 4px;border-radius:3px;',
      'background:var(--dsw-alias-bg-mask-2);color:var(--dsw-alias-label-primary);font-size:10px;line-height:14px;border:none;cursor:pointer;',
      'font-family:inherit}',
      '.dsh-notepad-rail__item.is-active .dsh-notepad-rail__badge{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-inverted)}'
    ].join('');

    const DOCK_CSS = [
      '.dsh-notepad-dock{display:flex;flex-direction:column;box-sizing:border-box;width:100%;min-height:0;position:relative;',
      'color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border-top:.5px solid var(--dsw-alias-border-l3);',
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
      'pointer-events:auto;cursor:zoom-out;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur)}',
      '.dsh-notepad-dock__preview img{max-width:100%;max-height:100%;object-fit:contain;border-radius:var(--dsw-radius-sm);',
      'box-shadow:var(--dsw-elevation-prominent)}',
      '.dsh-notepad-dock__previewClose{position:absolute;top:12px;right:12px;width:32px;height:32px;display:inline-flex;',
      'align-items:center;justify-content:center;border:none;border-radius:var(--dsw-radius-sm);cursor:pointer;padding:0;',
      'background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsh-notepad-dock__previewClose:hover{background:var(--dsw-alias-bg-layer-3)}'
    ].join('');

    const CSS = FLOAT_CSS + DOCK_CSS;

    /* ------------------------------------------------------------------ *
     * Shared note state: one note, two surfaces.
     * ------------------------------------------------------------------ */

    const store = {
      state: { text: '', images: [], mode: MODE_FLOAT, saved: true, flags: { number: false } },
      listeners: new Set(),
      loaded: false,
      saving: null,
      boot: null,
      load() {
        if (this.loaded) return;
        this.loaded = true;
        let parsed = null;
        try {
          const raw = globalThis.localStorage.getItem(STORAGE_KEY);
          if (raw) parsed = JSON.parse(raw);
        } catch (err) {
          parsed = null;
        }
        this.boot = parsed || {};
        this.state = {
          text: typeof this.boot.text === 'string' ? this.boot.text : '',
          images: [],
          mode: this.boot.mode === MODE_DOCK ? MODE_DOCK : MODE_FLOAT,
          saved: true,
          flags: { number: this.boot.numbering === true }
        };
        loadImages()
          .then((rows) => {
            this.state = { ...this.state, images: rows };
            this.emit();
          })
          .catch(() => {});
      },
      subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
      emit() {
        for (const listener of this.listeners) listener();
      },
      write(partial) {
        try {
          const raw = globalThis.localStorage.getItem(STORAGE_KEY);
          const current = raw ? JSON.parse(raw) : {};
          globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...partial }));
        } catch (err) {
          /* storage full or unavailable: keep the in-memory state */
        }
      },
      setText(text) {
        this.state = { ...this.state, text, saved: false };
        this.emit();
        if (this.saving !== null) globalThis.clearTimeout(this.saving);
        this.saving = globalThis.setTimeout(() => {
          this.saving = null;
          this.write({ text: this.state.text, mode: this.state.mode });
          this.state = { ...this.state, saved: true };
          this.emit();
        }, 250);
      },
      setImages(images) {
        this.state = { ...this.state, images };
        this.emit();
      },
      setNumbering(number) {
        this.state = { ...this.state, flags: { ...this.state.flags, number } };
        this.write({ numbering: number });
        this.emit();
      },
      setMode(mode) {
        if (this.state.mode === mode) return;
        if (this.saving !== null) {
          globalThis.clearTimeout(this.saving);
          this.saving = null;
        }
        this.state = { ...this.state, mode, saved: true };
        this.write({ text: this.state.text, mode });
        this.emit();
      }
    };

    function useShared() {
      const [, force] = useState(0);
      useEffect(() => store.subscribe(() => force((value) => value + 1)), []);
      store.load();
      return store.state;
    }

    /* ------------------------------------------------------------------ *
     * Persisted geometry
     * ------------------------------------------------------------------ */

    function readGeometry() {
      const fallback = {
        width: DEFAULT_W,
        height: DEFAULT_H,
        x: null,
        y: null,
        collapsed: false,
        peek: null,
        dockHeight: DOCK_DEFAULT_H,
        dockCollapsed: false
      };
      try {
        store.load();
        const boot = store.boot || {};
        const num = (value, low, high, drop) => (
          typeof value === 'number' && value >= low && value <= high ? value : drop
        );
        return {
          width: num(boot.width, MIN_W, MAX_W, DEFAULT_W),
          height: num(boot.height, MIN_H, MAX_H, DEFAULT_H),
          x: typeof boot.x === 'number' ? boot.x : null,
          y: typeof boot.y === 'number' ? boot.y : null,
          collapsed: boot.collapsed === true,
          peek: boot.peek === 'left' || boot.peek === 'right' || boot.peek === 'top' || boot.peek === 'bottom'
            ? boot.peek
            : null,
          dockHeight: num(boot.dockHeight, DOCK_MIN_H, DOCK_MAX_H, DOCK_DEFAULT_H),
          dockCollapsed: boot.dockCollapsed === true
        };
      } catch (err) {
        return fallback;
      }
    }

    function chromeTop() {
      try {
        const raw = globalThis.getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-chrome-top');
        const value = Number.parseFloat(raw);
        return Number.isFinite(value) && value > 0 ? value : 0;
      } catch (err) {
        return 0;
      }
    }

    function bounds() {
      const w = typeof globalThis.innerWidth === 'number' && globalThis.innerWidth > 0 ? globalThis.innerWidth : 1280;
      const hgt = typeof globalThis.innerHeight === 'number' && globalThis.innerHeight > 0 ? globalThis.innerHeight : 800;
      return { w, h: hgt, top: chromeTop() };
    }

    function clampAxis(value, low, high) {
      return Math.min(Math.max(value, low), Math.max(low, high));
    }

    /* ------------------------------------------------------------------ *
     * Line tools: auto numbering and to-dos.
     * A numbered item is "12. " / "12) "; a to-do is "- [ ] " / "- [x] ".
     * ------------------------------------------------------------------ */

    const RE_NUMBER = /^(\s*)(\d+)([.)])(\s+)/;
    const RE_TODO = /^(\s*)- \[([ xX])\]( +)?/;

    function lineStartAt(text, caret) {
      return text.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
    }

    function lineEndAt(text, start) {
      const end = text.indexOf('\n', start);
      return end === -1 ? text.length : end;
    }

    function parseTodos(text) {
      const lines = text.split('\n');
      const items = [];
      for (let index = 0; index < lines.length; index += 1) {
        const match = RE_TODO.exec(lines[index]);
        if (match === null) continue;
        items.push({
          line: index,
          indent: match[1],
          done: match[2].toLowerCase() === 'x',
          label: lines[index].slice(match[0].length).trim()
        });
      }
      return items;
    }

    function toggleTodoAt(text, lineIndex) {
      const lines = text.split('\n');
      if (lineIndex < 0 || lineIndex >= lines.length) return null;
      const line = lines[lineIndex];
      const match = RE_TODO.exec(line);
      if (match === null) return null;
      const done = match[2].toLowerCase() === 'x';
      lines[lineIndex] = match[1] + '- [' + (done ? ' ' : 'x') + '] ' + line.slice(match[0].length);
      return lines.join('\n');
    }

    /** Renumber every numbered line, one counter per indent level. */
    function renumberAll(text) {
      const lines = text.split('\n');
      const counters = new Map();
      let changed = false;
      for (let index = 0; index < lines.length; index += 1) {
        const match = RE_NUMBER.exec(lines[index]);
        if (match === null) continue;
        const indent = match[1];
        const next = (counters.get(indent) || 0) + 1;
        counters.set(indent, next);
        const rebuilt = indent + next + match[3] + match[4] + lines[index].slice(match[0].length);
        if (rebuilt !== lines[index]) {
          lines[index] = rebuilt;
          changed = true;
        }
      }
      return changed ? lines.join('\n') : null;
    }

    /** Drop every ticked to-do line. */
    function clearDoneTodos(text) {
      const lines = text.split('\n');
      const kept = [];
      let removed = 0;
      for (const line of lines) {
        const match = RE_TODO.exec(line);
        if (match !== null && match[2].toLowerCase() === 'x') {
          removed += 1;
          continue;
        }
        kept.push(line);
      }
      return removed === 0 ? null : { text: kept.join('\n'), removed };
    }

    /** Image references: [[img:abcd]] links a spot in the text to one thumbnail. */
    const RE_IMAGE_REF = /\[\[img:([a-z0-9]{4})\]\]/gi;

    function imageToken(image) {
      return '[[img:' + String(image.id).slice(-4) + ']]';
    }

    function tokenAtCaret(text, caret) {
      RE_IMAGE_REF.lastIndex = 0;
      let match = RE_IMAGE_REF.exec(text);
      while (match !== null) {
        if (caret >= match.index && caret <= match.index + match[0].length) return match[0];
        match = RE_IMAGE_REF.exec(text);
      }
      return null;
    }

    function insertToken(text, caret, token) {
      if (text.indexOf(token) !== -1) return null;
      const needsSpace = caret > 0 && !/\s/.test(text.charAt(caret - 1));
      const insert = (needsSpace ? ' ' : '') + token + ' ';
      return { text: text.slice(0, caret) + insert + text.slice(caret), caret: caret + insert.length };
    }

    /** Enter continuation. Returns null when the browser default should win. */
    function continueLine(text, caret, autoNumber) {
      const start = lineStartAt(text, caret);
      const line = text.slice(start, caret);
      const todo = RE_TODO.exec(line);
      if (todo !== null) {
        if (line.slice(todo[0].length).trim() === '') {
          return { text: text.slice(0, start) + todo[1] + text.slice(caret), caret: start + todo[1].length };
        }
        const insert = '\n' + todo[1] + '- [ ] ';
        return { text: text.slice(0, caret) + insert + text.slice(caret), caret: caret + insert.length };
      }
      if (!autoNumber) return null;
      const numbered = RE_NUMBER.exec(line);
      if (numbered === null) return null;
      if (line.slice(numbered[0].length).trim() === '') {
        return { text: text.slice(0, start) + numbered[1] + text.slice(caret), caret: start + numbered[1].length };
      }
      const insert = '\n' + numbered[1] + (Number(numbered[2]) + 1) + numbered[3] + ' ';
      return { text: text.slice(0, caret) + insert + text.slice(caret), caret: caret + insert.length };
    }

    /** Turn the caret line into the first numbered item. */
    function startNumbering(text, caret) {
      const start = lineStartAt(text, caret);
      const stop = lineEndAt(text, start);
      const line = text.slice(start, stop);
      if (RE_NUMBER.test(line)) return null;
      const indent = /^\s*/.exec(line)[0];
      const rest = line.slice(indent.length);
      const prefix = indent + '1. ';
      return {
        text: text.slice(0, start) + prefix + rest + text.slice(stop),
        caret: caret + prefix.length
      };
    }

    /** Turn the caret line into a to-do, or tick an existing one. */
    function startTodo(text, caret) {
      const start = lineStartAt(text, caret);
      const stop = lineEndAt(text, start);
      const line = text.slice(start, stop);
      const todo = RE_TODO.exec(line);
      if (todo !== null) {
        const done = todo[2].toLowerCase() === 'x';
        const replaced = todo[1] + '- [' + (done ? ' ' : 'x') + '] ' + line.slice(todo[0].length);
        return { text: text.slice(0, start) + replaced + text.slice(stop), caret: Math.min(caret, start + replaced.length) };
      }
      const indent = /^\s*/.exec(line)[0];
      const rest = line.slice(indent.length);
      const prefix = indent + '- [ ] ';
      return {
        text: text.slice(0, start) + prefix + rest + text.slice(stop),
        caret: caret + prefix.length
      };
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

    function snapRect(edge, x, y, w, hgt, box) {
      const thickness = 3;
      if (edge === 'left') return { left: '0px', top: y + 'px', width: thickness + 'px', height: hgt + 'px' };
      if (edge === 'right') return { left: (box.w - thickness) + 'px', top: y + 'px', width: thickness + 'px', height: hgt + 'px' };
      if (edge === 'top') return { left: x + 'px', top: box.top + 'px', width: w + 'px', height: thickness + 'px' };
      return { left: x + 'px', top: (box.h - thickness) + 'px', width: w + 'px', height: thickness + 'px' };
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
            const created = db.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
            created.createIndex('createdAt', 'createdAt');
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
      return runTx('readonly', (db) => db.getAll()).then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        return list.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      });
    }

    function putImage(record) {
      return runTx('readwrite', (db) => db.put(record));
    }

    function deleteImage(id) {
      return runTx('readwrite', (db) => db.delete(id));
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

    /** Shared image intake used by both surfaces. */
    function useImageIntake() {
      const [notice, setNotice] = useState('');

      useEffect(() => {
        if (!notice) return undefined;
        const timer = globalThis.setTimeout(() => setNotice(''), NOTICE_MS);
        return () => globalThis.clearTimeout(timer);
      }, [notice]);

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
              store.setImages(store.state.images.concat(record).sort((a, b) => a.createdAt - b.createdAt));
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
        store.setImages(store.state.images.filter((image) => image.id !== id));
        deleteImage(id).catch(() => {});
      }, []);

      return { notice, addFiles, removeImage };
    }

    /** Pointer drag helpers shared by move and resize. */
    function useDrag() {
      const moved = useRef(false);
      const start = useCallback((event, onMove, onEnd) => {
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
      return { start, moved };
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
     * Line tools UI (shared by both surfaces)
     * ------------------------------------------------------------------ */

    function useEditorTools(shared) {
      const editorRef = useRef(null);

      const putCaret = useCallback((caret) => {
        globalThis.requestAnimationFrame(() => {
          const node = editorRef.current;
          if (node === null) return;
          node.focus();
          node.selectionStart = caret;
          node.selectionEnd = caret;
        });
      }, []);

      const onKeyDown = useCallback((event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
        const node = event.currentTarget;
        if (node.selectionStart !== node.selectionEnd) return;
        const result = continueLine(node.value, node.selectionStart, store.state.flags.number);
        if (result === null) return;
        event.preventDefault();
        store.setText(result.text);
        putCaret(result.caret);
      }, [putCaret]);

      const toggleNumbering = useCallback(() => {
        const next = !store.state.flags.number;
        store.setNumbering(next);
        if (!next) return;
        const node = editorRef.current;
        if (node === null) return;
        const result = startNumbering(node.value, node.selectionStart);
        if (result === null) return;
        store.setText(result.text);
        putCaret(result.caret);
      }, [putCaret]);

      const insertTodo = useCallback(() => {
        const node = editorRef.current;
        if (node === null) return;
        const result = startTodo(node.value, node.selectionStart);
        store.setText(result.text);
        putCaret(result.caret);
      }, [putCaret]);

      const toggleTodoLine = useCallback((line) => {
        const next = toggleTodoAt(store.state.text, line);
        if (next !== null) store.setText(next);
      }, []);

      const renumber = useCallback(() => {
        const next = renumberAll(store.state.text);
        if (next !== null) store.setText(next);
      }, []);

      const clearDone = useCallback(() => {
        const result = clearDoneTodos(store.state.text);
        if (result !== null) store.setText(result.text);
      }, []);

      const [activeRef, setActiveRef] = useState(null);

      const onSelect = useCallback((event) => {
        const node = event.currentTarget;
        setActiveRef(tokenAtCaret(node.value, node.selectionStart));
      }, []);

      const jumpToLine = useCallback((line) => {
        const node = editorRef.current;
        if (node === null) return;
        const lines = store.state.text.split('\n');
        if (line < 0 || line >= lines.length) return;
        let at = 0;
        for (let index = 0; index < line; index += 1) at += lines[index].length + 1;
        node.focus();
        node.selectionStart = at;
        node.selectionEnd = at + lines[line].length;
        node.scrollTop = Math.max(0, line * 22 - node.clientHeight / 2);
      }, []);

      /** Insert the link token at the caret, or select the existing one. */
      const linkImage = useCallback((image) => {
        const node = editorRef.current;
        if (node === null) return;
        const token = imageToken(image);
        const inserted = insertToken(node.value, node.selectionStart, token);
        if (inserted !== null) {
          store.setText(inserted.text);
          putCaret(inserted.caret);
          return;
        }
        const at = node.value.indexOf(token);
        if (at === -1) return;
        node.focus();
        node.selectionStart = at;
        node.selectionEnd = at + token.length;
        node.scrollTop = Math.max(0, node.value.slice(0, at).split('\n').length * 22 - node.clientHeight / 2);
      }, [putCaret]);

      /** Copy the actual image bytes to the clipboard, falling back to the token. */
      const copyImage = useCallback(async (image) => {
        const blob = image.blob;
        try {
          if (globalThis.navigator && globalThis.navigator.clipboard
            && typeof globalThis.ClipboardItem === 'function' && blob) {
            await globalThis.navigator.clipboard.write([
              new globalThis.ClipboardItem({ [blob.type || 'image/png']: blob })
            ]);
            return 'image';
          }
        } catch (err) {
          /* fall through to the text token */
        }
        try {
          if (globalThis.navigator && globalThis.navigator.clipboard) {
            await globalThis.navigator.clipboard.writeText(imageToken(image));
            return 'token';
          }
        } catch (err) {
          /* nothing else to try */
        }
        return 'fail';
      }, []);

      return {
        editorRef,
        onKeyDown,
        onSelect,
        activeRef,
        toggleNumbering,
        insertTodo,
        toggleTodoLine,
        renumber,
        clearDone,
        jumpToLine,
        linkImage,
        copyImage
      };
    }

    function NoteControls(props) {
      const t = props.t;
      const todos = props.todos;
      const done = todos.filter((item) => item.done).length;
      return h(
        'div',
        { className: 'dsh-notepad-bar' + (props.inline ? ' dsh-notepad-bar--inline' : '') },
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-notepad-bar__btn' + (props.numbering ? ' is-on' : ''),
            onClick: (event) => {
              event.stopPropagation();
              props.onNumbering(event);
            },
            title: t('numberingHint'),
            'aria-pressed': props.numbering
          },
          h(NumberIcon, null),
          t('numbering')
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-notepad-bar__btn',
            onClick: (event) => {
              event.stopPropagation();
              props.onInsertTodo(event);
            },
            title: t('insertTodoHint')
          },
          h(TodoIcon, null),
          t('insertTodo')
        ),
        props.numbering
          ? h(
            'button',
            {
              type: 'button',
              className: 'dsh-notepad-bar__btn',
              onClick: (event) => {
                event.stopPropagation();
                props.onRenumber(event);
              },
              title: t('renumberHint')
            },
            t('renumber')
          )
          : null,
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-notepad-bar__btn' + (props.todosOpen ? ' is-on' : ''),
            onClick: (event) => {
              event.stopPropagation();
              props.onOpenTodos(event);
            },
            title: t('todosHint'),
            'aria-expanded': props.todosOpen
          },
          h(ListIcon, null),
          t('todosLabel') + ' ' + done + '/' + todos.length
        )
      );
    }

    function MediaRail(props) {
      const t = props.t;
      return h(
        'div',
        { className: 'dsh-notepad-rail' },
        props.images.map((image) => h(
          'div',
          {
            key: image.id,
            className: 'dsh-notepad-rail__item' + (props.activeRef === imageToken(image) ? ' is-active' : '')
          },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-notepad-rail__open',
              onClick: () => props.onPreview(image.id),
              title: image.name
            },
            props.urls[image.id] ? h('img', { src: props.urls[image.id], alt: image.name, draggable: false }) : null
          ),
          h(
            'div',
            { className: 'dsh-notepad-rail__tools' },
            h('button', {
              type: 'button',
              className: 'dsh-notepad-rail__tool',
              onClick: () => props.onLink(image),
              title: t('linkImage')
            }, h(LinkIcon, { width: 12, height: 12 })),
            h('button', {
              type: 'button',
              className: 'dsh-notepad-rail__tool',
              onClick: () => props.onCopy(image),
              title: t('copyImage')
            }, h(CopyIcon, { width: 12, height: 12 })),
            h('button', {
              type: 'button',
              className: 'dsh-notepad-rail__tool',
              onClick: () => props.onRemove(image.id),
              title: t('removeImage')
            }, h(CloseIcon, { width: 12, height: 12 }))
          ),
          h('button', {
            type: 'button',
            className: 'dsh-notepad-rail__badge',
            onClick: () => props.onLink(image),
            title: t('linkImage')
          }, '#' + String(image.id).slice(-4))
        ))
      );
    }

    function TodoPanel(props) {
      if (!props.open) return null;
      const t = props.t;
      return h(
        'div',
        { className: 'dsh-notepad-todos' },
        h(
          'div',
          { className: 'dsh-notepad-todos__head' },
          h('span', { className: 'dsh-notepad-todos__title' }, t('todosTitle') + ' ' + props.done + '/' + props.todos.length),
          props.done > 0
            ? h('button', { type: 'button', className: 'dsh-notepad-todos__act', onClick: props.onClearDone }, t('clearDone'))
            : null,
          h('button', { type: 'button', className: 'dsh-notepad-todos__act', onClick: props.onClose }, t('close'))
        ),
        props.todos.length === 0
          ? h('div', { className: 'dsh-notepad-todos__empty' }, t('todoEmpty'))
          : props.todos.map((item) => h(
            'div',
            { key: item.line, className: 'dsh-notepad-todos__row' + (item.done ? ' is-done' : '') },
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-notepad-todos__box',
                onClick: () => props.onToggle(item.line),
                title: t('todoToggle'),
                'aria-pressed': item.done
              },
              item.done ? h(CheckIcon, { width: 10, height: 10 }) : null
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-notepad-todos__label',
                onClick: () => props.onJump(item.line),
                title: t('todoJump')
              },
              item.label === '' ? '—' : item.label
            )
          ))
      );
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

    const NumberIcon = (props) => h(
      'svg',
      Object.assign({}, iconProps, props),
      h('path', { d: 'M4.2 4.4 5.8 3.2v9.4', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      h('circle', { cx: 10.6, cy: 12.2, r: 1.05, fill: 'currentColor' })
    );

    const TodoIcon = (props) => h(
      'svg',
      Object.assign({}, iconProps, props),
      h('rect', { x: 2.4, y: 2.4, width: 11.2, height: 11.2, rx: 2.4, stroke: 'currentColor', strokeWidth: 1.2 }),
      h('path', { d: 'M5.2 8.2 7.1 10.1l3.9-4', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' })
    );

    const ListIcon = (props) => h(
      'svg',
      Object.assign({}, iconProps, props),
      h('path', { d: 'M6 4.2h7.4M6 8h7.4M6 11.8h7.4', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
      h('circle', { cx: 3.4, cy: 4.2, r: 1, fill: 'currentColor' }),
      h('circle', { cx: 3.4, cy: 8, r: 1, fill: 'currentColor' }),
      h('circle', { cx: 3.4, cy: 11.8, r: 1, fill: 'currentColor' })
    );

    const LinkIcon = (props) => h(
      'svg',
      Object.assign({}, iconProps, props),
      h('path', {
        d: 'M6.4 9.6 9.6 6.4M6 4.4l1-1a2.4 2.4 0 0 1 3.4 3.4l-1 1M9.9 11.6l-1 1a2.4 2.4 0 0 1-3.4-3.4l1-1',
        stroke: 'currentColor',
        strokeWidth: 1.25,
        strokeLinecap: 'round'
      })
    );

    const CopyIcon = (props) => h(
      'svg',
      Object.assign({}, iconProps, props),
      h('rect', { x: 5.2, y: 5.2, width: 8, height: 8, rx: 1.4, stroke: 'currentColor', strokeWidth: 1.2 }),
      h('path', { d: 'M10.6 5V3.8A1.2 1.2 0 0 0 9.4 2.6H3.8A1.2 1.2 0 0 0 2.6 3.8v5.6A1.2 1.2 0 0 0 3.8 10.6H5', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' })
    );

    const CheckIcon = (props) => h(
      'svg',
      Object.assign({}, iconProps, props),
      h('path', { d: 'M3.4 8.4 6.4 11.4l6.2-6.4', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' })
    );

    const ChevronUpIcon = (props) => h(
      'svg',
      Object.assign({}, iconProps, props),
      h('path', { d: 'M3.4 10.2 8 5.6l4.6 4.6', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' })
    );

    const ChevronDownIcon = (props) => h(
      'svg',
      Object.assign({}, iconProps, props),
      h('path', { d: 'M3.4 5.8 8 10.4l4.6-4.6', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' })
    );

    /** Dock glyph: a frame with a filled strip along one side. */
    const DockIcon = (props) => h(
      'svg',
      Object.assign({}, iconProps, props),
      h('rect', { x: 2.4, y: 3.4, width: 11.2, height: 9.2, rx: 1.3, stroke: 'currentColor', strokeWidth: 1.2 }),
      h('rect', { x: 2.4, y: 9.6, width: 11.2, height: 3, rx: 1.3, fill: 'currentColor' })
    );

    /** Float glyph: a framed panel outline with a gap on the bottom row. */
    const FloatIcon = (props) => h(
      'svg',
      Object.assign({}, iconProps, props),
      h('rect', { x: 2.2, y: 3.2, width: 8.4, height: 6.6, rx: 1.2, stroke: 'currentColor', strokeWidth: 1.2 }),
      h('path', { d: 'M12.4 6.2h1.4M12.4 9h1.4M12.4 11.8h1.4', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' })
    );

    /* ------------------------------------------------------------------ *
     * Floating surface
     * ------------------------------------------------------------------ */

    function NotepadCard(props) {
      const t = (key) => (typeof props.t === 'function' ? props.t(key) : (EN[key] !== undefined ? EN[key] : key));
      const shared = useShared();

      const [boot] = useState(readGeometry);
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
      const [preview, setPreview] = useState(null);
      const [dropping, setDropping] = useState(false);
      const [snapEdge, setSnapEdge] = useState(null);

      const fileRef = useRef(null);
      const dragDepth = useRef(0);
      const livePos = useRef(pos);
      const liveSize = useRef({ w: boot.width, h: boot.height });
      const dragOrigin = useRef({ x: 0, y: 0 });
      const { start: startDrag, moved } = useDrag();
      const { notice, addFiles, removeImage } = useImageIntake();
      const {
        editorRef,
        onKeyDown,
        onSelect,
        activeRef,
        toggleNumbering,
        insertTodo,
        toggleTodoLine,
        renumber,
        clearDone,
        jumpToLine,
        linkImage,
        copyImage
      } = useEditorTools(shared);
      const todos = parseTodos(shared.text);
      const [todosOpen, setTodosOpen] = useState(false);
      const toggleTodos = useCallback(() => setTodosOpen((value) => !value), []);
      const urls = useObjectUrls(shared.images);

      const applyPos = useCallback((next) => {
        livePos.current = next;
        setPos(next);
      }, []);

      useEffect(() => {
        const timer = globalThis.setTimeout(() => {
          store.write({ width, height, x: pos.x, y: pos.y, collapsed, peek });
        }, 200);
        return () => globalThis.clearTimeout(timer);
      }, [width, height, pos.x, pos.y, collapsed, peek]);

      useEffect(() => {
        if (preview === null) return undefined;
        const onKey = (event) => {
          if (event.key === 'Escape') setPreview(null);
        };
        globalThis.addEventListener('keydown', onKey, true);
        return () => globalThis.removeEventListener('keydown', onKey, true);
      }, [preview]);

      useEffect(() => {
        if (shared.images.length > 0 && preview !== null && !shared.images.some((image) => image.id === preview)) {
          setPreview(null);
        }
      }, [shared.images, preview]);

      useEffect(() => {
        const onResize = () => {
          const box = bounds();
          const resized = fitSize(liveSize.current.w, liveSize.current.h, box);
          liveSize.current = resized;
          setWidth(resized.w);
          setHeight(resized.h);
          const fixed = fitPos(livePos.current.x, livePos.current.y, resized.w, resized.h, box);
          applyPos({ x: fixed.x, y: fixed.y });
        };
        globalThis.addEventListener('resize', onResize);
        return () => globalThis.removeEventListener('resize', onResize);
      }, [applyPos]);

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
          const next = dragBox(dx, dy, liveSize.current.w, liveSize.current.h);
          applyPos(next.pos);
          setSnapEdge(next.edge);
        }, () => settle(liveSize.current.w, liveSize.current.h));
      }, [applyPos, dragBox, settle, startDrag]);

      const onMoveTab = useCallback((event) => {
        dragOrigin.current = { x: livePos.current.x, y: livePos.current.y };
        startDrag(event, (dx, dy) => {
          const next = dragBox(dx, dy, TAB, TAB);
          applyPos(next.pos);
          setSnapEdge(next.edge);
        }, () => settle(TAB, TAB));
      }, [applyPos, dragBox, settle, startDrag]);

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
        setDropping(true);
      };

      const onDragOver = (event) => {
        if (!event.dataTransfer) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      };

      const onDragLeave = () => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDropping(false);
      };

      const onDrop = (event) => {
        if (!event.dataTransfer) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDropping(false);
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

      if (shared.mode !== MODE_FLOAT) return null;

      const previewImage = preview === null
        ? null
        : shared.images.filter((image) => image.id === preview)[0] || null;
      const status = notice ? t(notice) : (shared.saved ? t('saved') : t('saving'));
      const counter = shared.text.length + ' ' + t('chars')
        + (shared.images.length > 0 ? ' · ' + shared.images.length + ' ' + t('images') : '');
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
              title: t('peek'),
              'aria-label': t('peek')
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
                      store.setText('');
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
                      store.setMode(MODE_DOCK);
                    },
                    onPointerDown: (event) => event.stopPropagation(),
                    title: t('toDock'),
                    'aria-label': t('toDock')
                  },
                  h(DockIcon)
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
              h(NoteControls, {
                t,
                todos,
                numbering: shared.flags.number,
                todosOpen,
                onNumbering: toggleNumbering,
                onInsertTodo: insertTodo,
                onOpenTodos: toggleTodos,
                onRenumber: renumber
              }),
              h(TodoPanel, {
                t,
                open: todosOpen,
                todos,
                done: todos.filter((item) => item.done).length,
                onToggle: toggleTodoLine,
                onJump: jumpToLine,
                onClearDone: clearDone,
                onClose: () => setTodosOpen(false)
              }),
              h(
                'div',
                { className: 'dsh-notepad-card__body' },
                h('textarea', {
                  ref: editorRef,
                  className: 'dsh-notepad-card__editor',
                  value: shared.text,
                  onKeyDown,
                  onSelect,
                  placeholder: t('placeholder'),
                  spellCheck: false,
                  onChange: (event) => store.setText(event.target.value)
                }),
                shared.images.length > 0
                  ? h(MediaRail, {
                    t,
                    images: shared.images,
                    urls,
                    activeRef,
                    onPreview: setPreview,
                    onLink: linkImage,
                    onCopy: copyImage,
                    onRemove: removeImage
                  })
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
              dropping
                ? h(
                  'div',
                  { className: 'dsh-notepad-card__drop' },
                  h(ImagePlusIcon, { width: 22, height: 22 }),
                  h('span', null, t('dropHint'))
                )
                : null
            ),
        previewImage === null
          ? null
          : h(
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
        })
      );
    }

    /* ------------------------------------------------------------------ *
     * Docked surface
     * ------------------------------------------------------------------ */

    function NotepadDock(props) {
      const t = (key) => (typeof props.t === 'function' ? props.t(key) : (EN[key] !== undefined ? EN[key] : key));
      const shared = useShared();

      const [boot] = useState(readGeometry);
      const [height, setHeight] = useState(boot.dockHeight);
      const [collapsed, setCollapsed] = useState(boot.dockCollapsed);
      const [preview, setPreview] = useState(null);
      const [dropping, setDropping] = useState(false);

      const fileRef = useRef(null);
      const dragDepth = useRef(0);
      const liveHeight = useRef(boot.dockHeight);
      const { start: startDrag } = useDrag();
      const { notice, addFiles, removeImage } = useImageIntake();
      const {
        editorRef,
        onKeyDown,
        onSelect,
        activeRef,
        toggleNumbering,
        insertTodo,
        toggleTodoLine,
        renumber,
        clearDone,
        jumpToLine,
        linkImage,
        copyImage
      } = useEditorTools(shared);
      const todos = parseTodos(shared.text);
      const [todosOpen, setTodosOpen] = useState(false);
      const toggleTodos = useCallback(() => setTodosOpen((value) => !value), []);
      const urls = useObjectUrls(shared.images);

      useEffect(() => {
        const timer = globalThis.setTimeout(() => {
          store.write({ dockHeight: height, dockCollapsed: collapsed });
        }, 200);
        return () => globalThis.clearTimeout(timer);
      }, [height, collapsed]);

      useEffect(() => {
        if (preview === null) return undefined;
        const onKey = (event) => {
          if (event.key === 'Escape') setPreview(null);
        };
        globalThis.addEventListener('keydown', onKey, true);
        return () => globalThis.removeEventListener('keydown', onKey, true);
      }, [preview]);

      useEffect(() => {
        if (preview !== null && !shared.images.some((image) => image.id === preview)) setPreview(null);
      }, [shared.images, preview]);

      const onResizeStart = useCallback((event) => {
        const origin = liveHeight.current;
        startDrag(event, (dx, dy) => {
          const limit = Math.min(DOCK_MAX_H, Math.max(DOCK_MIN_H, globalThis.innerHeight * 0.7));
          const next = Math.min(limit, Math.max(DOCK_MIN_H, origin - dy));
          liveHeight.current = next;
          setHeight(next);
        });
      }, [startDrag]);

      const onDragEnter = (event) => {
        if (!event.dataTransfer) return;
        dragDepth.current += 1;
        setDropping(true);
      };

      const onDragOver = (event) => {
        if (!event.dataTransfer) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      };

      const onDragLeave = () => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDropping(false);
      };

      const onDrop = (event) => {
        if (!event.dataTransfer) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDropping(false);
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

      if (shared.mode !== MODE_DOCK) return null;

      const previewImage = preview === null
        ? null
        : shared.images.filter((image) => image.id === preview)[0] || null;
      const status = notice ? t(notice) : (shared.saved ? t('saved') : t('saving'));
      const counter = shared.text.length + ' ' + t('chars')
        + (shared.images.length > 0 ? ' · ' + shared.images.length + ' ' + t('images') : '');
      const limit = Math.min(DOCK_MAX_H, Math.max(DOCK_MIN_H, globalThis.innerHeight * 0.7));
      const dockHeight = collapsed ? DOCK_BAR : Math.min(Math.max(height, DOCK_MIN_H), limit);

      return h(
        React.Fragment,
        null,
        h(
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
              { className: 'dsh-notepad-dock__meta' + (notice ? ' dsh-notepad-dock__meta--notice' : '') },
              status + ' · ' + counter
            ),
            h(NoteControls, {
              t,
              todos,
              inline: true,
              numbering: shared.flags.number,
              todosOpen,
              onNumbering: toggleNumbering,
              onInsertTodo: insertTodo,
              onOpenTodos: toggleTodos,
              onRenumber: renumber
            }),
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
                onClick: (event) => {
                  event.stopPropagation();
                  store.setText('');
                },
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
                  store.setMode(MODE_FLOAT);
                },
                title: t('toFloat'),
                'aria-label': t('toFloat')
              },
              h(FloatIcon)
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
            : h(TodoPanel, {
              t,
              open: todosOpen,
              todos,
              done: todos.filter((item) => item.done).length,
              onToggle: toggleTodoLine,
              onJump: jumpToLine,
              onClearDone: clearDone,
              onClose: () => setTodosOpen(false)
            }),
          collapsed
            ? null
            : h(
              'div',
              { className: 'dsh-notepad-dock__body' },
              h('textarea', {
                ref: editorRef,
                className: 'dsh-notepad-dock__editor',
                value: shared.text,
                onKeyDown,
                onSelect,
                placeholder: t('placeholder'),
                spellCheck: false,
                onChange: (event) => store.setText(event.target.value)
              }),
              shared.images.length > 0
                  ? h(MediaRail, {
                    t,
                    images: shared.images,
                    urls,
                    activeRef,
                    onPreview: setPreview,
                    onLink: linkImage,
                    onCopy: copyImage,
                    onRemove: removeImage
                  })
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
          dropping && !collapsed
            ? h(
              'div',
              { className: 'dsh-notepad-dock__drop' },
              h(ImagePlusIcon, { width: 22, height: 22 }),
              h('span', null, t('dropHint'))
            )
            : null
        ),
        previewImage === null
          ? null
          : h(
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
          style.setAttribute('data-plugin-css', 'dsh-notepad-card/Notepad.module.css');
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

        ctx.slots.inject('shell.bottom', () => ctx.slots.register({
          name: 'shell.bottom',
          id: 'dsh-notepad-dock',
          locale: NS
        }, NotepadDock));
      }
    };
  }
});
