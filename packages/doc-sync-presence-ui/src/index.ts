import type {PresenceState, PresenceStore, PresenceTarget} from '@barocss/doc-sync/presence';

/** All geometry uses viewport CSS pixels. The host owns document and world mapping. */
export interface PresenceRect {readonly x: number; readonly y: number; readonly width: number; readonly height: number}
export interface PresenceProjection {readonly rects: readonly PresenceRect[]}
export type PresenceRole = 'cursor' | 'selection' | 'draft';
export interface PresenceProjectionContext {readonly actor: string; readonly role: PresenceRole; readonly state: PresenceState}
export type PresenceProjector = (target: PresenceTarget, context: PresenceProjectionContext) => PresenceProjection | null;
export type PresenceProjectionAdapters = {
  [K in PresenceTarget['kind']]?: (target: Extract<PresenceTarget, {kind: K}>, context: PresenceProjectionContext) => PresenceProjection | null;
};
/** Missing, deleted, offscreen, or unresolvable targets must return null. */
export function createPresenceProjector(adapters: PresenceProjectionAdapters): PresenceProjector {
  return (target, context) => {
    switch (target.kind) {
      case 'document': return adapters.document?.(target, context) ?? null;
      case 'graphic': return adapters.graphic?.(target, context) ?? null;
      case 'spreadsheet': return adapters.spreadsheet?.(target, context) ?? null;
    }
    return null;
  };
}

export interface PresenceUIOptions {
  projector: PresenceProjector;
  showAvatars?: boolean;
  showCursors?: boolean;
  showSelections?: boolean;
  showDrafts?: boolean;
  maxAvatars?: number;
}
export interface PresenceUI {update(options: PresenceUIOptions): void; invalidate(): void; dispose(): void}

/** Clip one projected rect to the visible container. Returns local CSS coordinates. */
export function clipPresenceRect(rect: PresenceRect, bounds: PresenceRect): PresenceRect | null {
  if (![rect.x, rect.y, rect.width, rect.height, bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return null;
  if (rect.width < 0 || rect.height < 0 || bounds.width <= 0 || bounds.height <= 0) return null;
  const x = Math.max(rect.x, bounds.x), y = Math.max(rect.y, bounds.y);
  const right = Math.min(rect.x + Math.max(1, rect.width), bounds.x + bounds.width);
  const bottom = Math.min(rect.y + Math.max(1, rect.height), bounds.y + bounds.height);
  return right > x && bottom > y ? {x: x - bounds.x, y: y - bounds.y, width: right - x, height: bottom - y} : null;
}

function css(element: HTMLElement, value: Partial<CSSStyleDeclaration>): void {Object.assign(element.style, value);}
function place(element: HTMLElement, rect: PresenceRect): void {
  css(element, {position: 'absolute', left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px`});
}
function actorColor(actor: string): string {
  let hash = 0;
  for (let index = 0; index < actor.length; index++) hash = (hash * 31 + actor.charCodeAt(index)) | 0;
  return `hsl(${Math.abs(hash) % 360} 68% 43%)`;
}

/** Mount AvatarStack, CursorLayer, SelectionLayer, DraftPreview and BotAvatar together.
 * Imports have no DOM side effects. Call invalidate after host layout/world changes.
 */
export function mountPresence(container: HTMLElement, store: Pick<PresenceStore, 'getSnapshot' | 'subscribe'>, initialOptions: PresenceUIOptions): PresenceUI {
  const document = container.ownerDocument;
  const window = document.defaultView;
  if (!window) throw new Error('Presence UI needs a live document');
  let options = initialOptions;
  let disposed = false;
  let frame: number | null = null;
  const previousPosition = container.style.position;
  const positioned = window.getComputedStyle(container).position === 'static';
  if (positioned) container.style.position = 'relative';
  const root = document.createElement('div');
  root.dataset.docSyncPresence = '';
  css(root, {position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none', zIndex: '20'});
  container.append(root);
  const avatarLabels: {element: HTMLElement; label: HTMLElement}[] = [];

  function render(): void {
    frame = null;
    if (disposed) return;
    css(root, {left: `${container.scrollLeft}px`, top: `${container.scrollTop}px`, right: 'auto', bottom: 'auto', width: `${container.clientWidth}px`, height: `${container.clientHeight}px`});
    const box = root.getBoundingClientRect();
    const bounds: PresenceRect = {x: box.left, y: box.top, width: box.width, height: box.height};
    const fragment = document.createDocumentFragment();
    const draftCarets: {node: HTMLElement; offset: number; actor: string; color: string; replacedCursors: HTMLElement[]}[] = [];
    avatarLabels.length = 0;
    const states = store.getSnapshot();
    const avatarLimit = Math.min(50, Math.max(0, Math.floor(options.maxAvatars ?? 8)));
    for (const [index, state] of states.entries()) {
      const profile = state.profile;
      const color = profile?.color ?? actorColor(state.actor);
      const name = profile?.name ?? state.actor;
      if (options.showAvatars !== false && index < avatarLimit) {
        const avatar = document.createElement('span');
        avatar.dataset.presenceActor = state.actor;
        avatar.dataset.presencePrimitive = profile?.kind === 'bot' ? 'BotAvatar' : 'AvatarStack';
        avatar.setAttribute('role', 'img');
        avatar.setAttribute('aria-label', `${name}: ${state.activity ?? 'active'}`);
        avatar.textContent = profile?.kind === 'bot' ? (state.activity === 'away' ? '− −' : state.draft?.composing ? '◠ ◠' : state.activity === 'idle' ? '˘ ˘' : '• •') : name.slice(0, 1);
        css(avatar, {position: 'absolute', right: `${8 + index * 30}px`, top: '8px', width: '28px', height: '28px', display: 'grid', placeItems: 'center', background: color, color: 'white', borderRadius: '50%', font: '600 12px system-ui', opacity: state.activity === 'away' ? '0.5' : '1'});
        const label = document.createElement('span');
        label.textContent = name;
        css(label, {position: 'absolute', right: `${8 + index * 30}px`, top: '39px', padding: '3px 6px', color: 'white', background: '#20242c', borderRadius: '4px', font: '12px system-ui', display: 'none', whiteSpace: 'nowrap'});
        avatarLabels.push({element: avatar, label});
        fragment.append(avatar, label);
      }
      const actorCursors: HTMLElement[] = [];
      const roles: PresenceRole[] = ['selection', 'cursor', 'draft'];
      for (const role of roles) {
        if ((role === 'cursor' && options.showCursors === false) || (role === 'selection' && options.showSelections === false) || (role === 'draft' && options.showDrafts === false)) continue;
        const target = role === 'draft' ? state.draft?.target : state[role];
        if (!target) continue;
        const projection = options.projector(target, {actor: state.actor, role, state});
        if (!projection) continue;
        for (const raw of projection.rects.slice(0, role === 'draft' ? 1 : 256)) {
          const rect = clipPresenceRect(raw, bounds);
          if (!rect) continue;
          const node = document.createElement('span');
          node.dataset.presenceActor = state.actor;
          node.dataset.presencePrimitive = role === 'cursor' ? 'CursorLayer' : role === 'selection' ? 'SelectionLayer' : 'DraftPreview';
          place(node, role === 'cursor' ? {...rect, width: 2} : rect);
          if (role === 'selection') css(node, {background: color, opacity: '0.17'});
          if (role === 'cursor') {css(node, {background: color}); actorCursors.push(node);}
          if (role === 'draft') {
            const draft = state.draft!;
            const selected = draft.selection;
            if (options.showSelections !== false && selected && selected.end > selected.start) {
              const mark = document.createElement('mark');
              mark.dataset.presencePrimitive = 'DraftSelection';
              mark.dataset.presenceActor = state.actor;
              mark.textContent = draft.text.slice(selected.start, selected.end);
              css(mark, {background: color, color: 'white'});
              node.append(document.createTextNode(draft.text.slice(0, selected.start)), mark, document.createTextNode(draft.text.slice(selected.end)));
            } else node.append(document.createTextNode(draft.text));
            if (options.showCursors !== false) draftCarets.push({node, actor: state.actor, color, offset: selected ? (selected.direction === 'backward' ? selected.start : selected.end) : draft.text.length, replacedCursors: JSON.stringify(state.cursor) === JSON.stringify(draft.target) ? actorCursors : []});
            node.setAttribute('aria-label', `${name} draft`);
            css(node, {width: 'max-content', height: 'auto', maxWidth: `${rect.width}px`, maxHeight: `${rect.height}px`, boxSizing: 'border-box', overflow: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'rgba(255,255,255,.95)', borderBottom: `2px ${state.draft?.composing ? 'dotted' : 'solid'} ${color}`, color: '#20242c', font: 'inherit'});
          }
          fragment.append(node);
        }
      }
    }
    root.replaceChildren(fragment);
    // Measure only mounted draft text. Native Range retains the host's font, wrapping,
    // Unicode shaping and bidi placement without changing the browser selection.
    for (const {node, offset, actor, color, replacedCursors} of draftCarets) {
      const walker = document.createTreeWalker(node, window!.NodeFilter.SHOW_TEXT);
      let remaining = offset;
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        const length = text.textContent?.length ?? 0;
        if (length === 0) continue;
        if (remaining > length) { remaining -= length; continue; }
        const range = document.createRange();
        range.setStart(text, remaining);
        range.collapse(true);
        const measured = range.getBoundingClientRect(), box = node.getBoundingClientRect();
        // Keep an end-of-text caret inside the preview's right clipping edge.
        const caretRect = clipPresenceRect({x: Math.min(measured.x, box.right - 1), y: measured.y, width: 1, height: measured.height}, {x: box.x, y: box.y, width: box.width, height: box.height});
        if (caretRect && measured.height > 0) {
          const caret = document.createElement('span');
          caret.dataset.presencePrimitive = 'DraftCaret';
          caret.dataset.presenceActor = actor;
          caret.setAttribute('aria-hidden', 'true');
          place(caret, caretRect);
          css(caret, {background: color, pointerEvents: 'none'});
          node.append(caret);
          for (const cursor of replacedCursors) cursor.remove();
        }
        break;
      }
    }
  }
  function invalidate(): void {
    if (!disposed && frame === null) frame = window!.requestAnimationFrame(render);
  }
  function hover(event: PointerEvent): void {
    for (const {element, label} of avatarLabels) {
      const bounds = element.getBoundingClientRect();
      label.style.display = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom ? 'block' : 'none';
    }
  }
  const unsubscribe = store.subscribe(invalidate);
  window.addEventListener('resize', invalidate);
  document.addEventListener('scroll', invalidate, true);
  document.addEventListener('pointermove', hover, {passive: true});
  const observer = typeof window.ResizeObserver === 'function' ? new window.ResizeObserver(invalidate) : null;
  observer?.observe(container);
  invalidate();
  return {
    update(next) {if (!disposed) {options = next; invalidate();}},
    invalidate,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame !== null) window!.cancelAnimationFrame(frame);
      unsubscribe();
      observer?.disconnect();
      window!.removeEventListener('resize', invalidate);
      document.removeEventListener('scroll', invalidate, true);
      document.removeEventListener('pointermove', hover);
      root.remove();
      if (positioned && container.style.position === 'relative') container.style.position = previousPosition;
      avatarLabels.length = 0;
    },
  };
}
