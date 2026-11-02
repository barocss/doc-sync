/** A plain-text textarea binding. Document access goes through EditorHost only. */
export function mountCustomEditor(textarea, host, {onError = error => { throw error; }} = {}) {
    const schema = host.schema;
    const root = schema.nodes[schema.root];
    const paragraph = root?.default;
    if (root?.shape !== 'flow' || root.children?.length !== 1 || root.children[0] !== paragraph
        || schema.nodes[paragraph]?.shape !== 'text' || schema.nodes[paragraph].text === false
        || schema.nodes[paragraph].children?.length || Object.keys(root.childRules ?? {}).length
        || schema.marks.length
        || Object.keys(schema.markValues ?? {}).length
        || Object.keys(schema.nodes).length !== 2
        || Object.keys(root.attrs ?? {}).length || Object.keys(schema.nodes[paragraph].attrs ?? {}).length) {
        throw new Error('Custom textarea requires one plain paragraph type in a flow root, without marks or attributes');
    }
    const textOf = model => {
        if (model.type !== schema.root || !model.children?.length || model.runs || Object.keys(model.attrs ?? {}).length) throw new Error('Unsupported custom textarea root');
        return model.children.map(node => {
            if (node.type !== paragraph || node.children || Object.keys(node.attrs ?? {}).length) throw new Error('Unsupported custom textarea paragraph');
            return (node.runs ?? []).map(run => {
                if (!('text' in run) || Object.keys(run.marks ?? {}).length || /[\r\n]/.test(run.text)) throw new Error('Unsupported custom textarea run');
                return run.text;
            }).join('');
        }).join('\n');
    };
    const pathAt = (text, offset) => {
        offset = Math.max(0, Math.min(text.length, offset));
        const prefix = text.slice(0, offset).split('\n');
        return [prefix.length - 1, prefix.at(-1).length];
    };
    const offsetAt = (text, path) => {
        const lines = text.split('\n');
        if (!path || path.length !== 2 || path[0] < 0 || path[0] >= lines.length) return null;
        return lines.slice(0, path[0]).reduce((sum, line) => sum + line.length + 1, 0) + Math.min(lines[path[0]].length, Math.max(0, path[1]));
    };
    let disposed = false, painting = false, saved = null, beforeCaret = null;
    let session = null;
    let baseline = textOf(host.model().model);
    textarea.value = baseline;
    const view = () => session ?? host;
    const nativeRange = () => {
        const backward = textarea.selectionDirection === 'backward';
        return {anchor: pathAt(textarea.value, backward ? textarea.selectionEnd : textarea.selectionStart),
            focus: pathAt(textarea.value, backward ? textarea.selectionStart : textarea.selectionEnd)};
    };
    const capture = () => {
        if (disposed || painting) return;
        const range = nativeRange(), current = view();
        const anchor = current.captureAnchor(range.anchor), focus = current.captureAnchor(range.focus);
        saved = anchor && focus ? {anchor, focus} : null;
    };
    const resolve = (current, range) => {
        if (!range) return null;
        const anchor = current.locateAnchor(range.anchor, 'visible'), focus = current.locateAnchor(range.focus, 'visible');
        return anchor && focus ? {anchor, focus} : null;
    };
    const select = range => {
        if (!range) return;
        const anchor = offsetAt(textarea.value, range.anchor), focus = offsetAt(textarea.value, range.focus);
        if (anchor === null || focus === null) return;
        textarea.setSelectionRange(Math.min(anchor, focus), Math.max(anchor, focus), anchor > focus ? 'backward' : 'forward');
    };
    const render = () => {
        if (disposed) return;
        if (session) { session.reserveClock(); return; }
        const next = textOf(host.model().model), range = resolve(host, saved);
        painting = true;
        try { if (textarea.value !== next) textarea.value = next; baseline = next; select(range); }
        finally { painting = false; }
    };
    const guarded = action => event => {
        if (disposed) return;
        try { action(event); }
        catch (error) {
            session?.cancel(); session = null; beforeCaret = null;
            render(); onError(error);
        }
    };
    function input() {
        const next = textarea.value;
        if (next === baseline) { capture(); return; }
        const current = view();
        const old = baseline, range = nativeRange();
        let start = 0, oldEnd = old.length, newEnd = next.length;
        while (start < Math.min(oldEnd, newEnd) && old[start] === next[start]) start++;
        while (oldEnd > start && newEnd > start && old[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd--; }
        const at = pathAt(old, start), ops = [];
        const caretBefore = beforeCaret ?? saved?.focus ?? current.captureAnchor(at) ?? '';
        if (oldEnd > start) {
            const deleted = current.deleteRange(at, pathAt(old, oldEnd));
            if (!deleted) throw new Error('Custom textarea range is unavailable');
            ops.push(...deleted);
        }
        let [block, offset] = at;
        const parts = next.slice(start, newEnd).split('\n');
        for (let index = 0; index < parts.length; index++) {
            if (parts[index]) { ops.push(...current.apply([{op: 'insert', at: [block, offset], content: parts[index]}])); offset += parts[index].length; }
            if (index < parts.length - 1) { ops.push(...current.apply([{op: 'split', at: [block, offset]}])); block++; offset = 0; }
        }
        const caretAfter = current.captureAnchor(range.focus) ?? '';
        current.commit(ops, {caretBefore, caretAfter, typing: false});
        baseline = textOf(current.model().model);
        if (baseline !== next) throw new Error('Custom textarea edit did not match its model');
        beforeCaret = null;
        capture();
    }
    function history(redo) {
        if (session) { session.cancel(); session = null; }
        const key = redo ? host.redo() : host.undo();
        render();
        const path = key && host.locateAnchor(key, 'visible');
        if (path) select({anchor: path, focus: path});
        capture();
    }
    const listeners = {
        input: guarded(input),
        beforeinput: guarded(event => {
            if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
                event.preventDefault(); history(event.inputType === 'historyRedo'); return;
            }
            capture(); beforeCaret = saved?.focus ?? null;
        }),
        select: guarded(capture), keyup: guarded(capture), pointerup: guarded(capture),
        keydown: guarded(event => {
            if (event.isComposing || !(event.metaKey || event.ctrlKey) || event.altKey) return;
            const key = event.key.toLowerCase();
            if (key === 'z' || (key === 'y' && event.ctrlKey)) {
                event.preventDefault(); history(key === 'y' || event.shiftKey);
            }
        }),
        compositionstart: guarded(() => { capture(); beforeCaret = saved?.focus ?? null; session = host.createSession(); session.begin(); }),
        compositionend: guarded(() => {
            if (!session) return;
            input();
            const current = session, range = current.capture(nativeRange());
            current.end(); session = null;
            const restored = current.resolve(range);
            saved = null; render(); select(restored); capture(); beforeCaret = null;
        }),
    };
    capture();
    const unsubscribe = host.subscribe({modelEvents: render, update: render});
    for (const [name, listener] of Object.entries(listeners)) textarea.addEventListener(name, listener);
    return {
        readModel() {
            return {type: schema.root, children: textarea.value.split('\n').map(text => ({type: paragraph, runs: text ? [{text, marks: {}}] : []}))};
        },
        selection: () => disposed ? null : nativeRange(),
        setSelection(range) { if (!disposed) { select(range); capture(); } },
        undo() { if (!disposed) history(false); },
        redo() { if (!disposed) history(true); },
        dispose() {
            if (disposed) return;
            disposed = true; session?.cancel(); session = null; unsubscribe();
            for (const [name, listener] of Object.entries(listeners)) textarea.removeEventListener(name, listener);
        },
    };
}
