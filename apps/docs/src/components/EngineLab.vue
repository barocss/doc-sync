<script setup>
import {ref, onMounted, onBeforeUnmount} from 'vue';
import {createEngineLab, LAB_SCHEMA, LAB_STEPS, modelText} from './engine-lab.mjs';
const state = ref(null), busy = ref(true), error = ref('');
let lab, generation = 0;
async function reset() {
    const current = ++generation;
    busy.value = true; error.value = ''; lab?.close();
    try {
        const created = await createEngineLab();
        if (current !== generation) { created.close(); return; }
        lab = created; state.value = lab.snapshot();
    } catch (failure) { if (current === generation) error.value = failure.message; }
    finally { if (current === generation) busy.value = false; }
}
async function next() {
    if (busy.value || !lab || state.value?.index === LAB_STEPS.length - 1) return;
    const current = generation;
    busy.value = true; error.value = '';
    try { const result = await lab.next(); if (current === generation) state.value = result; }
    catch (failure) { if (current === generation) error.value = failure.message; }
    finally { if (current === generation) busy.value = false; }
}
onMounted(reset);
onBeforeUnmount(() => { generation++; lab?.close(); });
</script>

<template>
<section class="engine-lab" aria-labelledby="engine-lab-title">
    <h2 id="engine-lab-title">Run the engine, step by step</h2>
    <p>Real <code>SyncClient</code> × 2 + real <code>DocHub</code>, running only in this page.
       Each card renders the current engine model, not a prewritten result.</p>
    <div class="lab-controls">
        <button type="button" @click="next" :aria-disabled="busy || !state || state.index === LAB_STEPS.length - 1">Next step</button>
        <button type="button" @click="!busy && reset()" :aria-disabled="busy">Reset example</button>
        <span v-if="state">Step {{state.index + 1}} / {{LAB_STEPS.length}}</span>
    </div>
    <p v-if="error" role="alert">Example stopped: {{error}}. Reset to start again.</p>
    <div v-if="state" aria-live="polite" aria-atomic="true" class="lab-status">
        <strong>{{state.title}}</strong>
        <p>{{state.explanation}}</p>
        <p class="lab-summary">A: {{modelText(state.replicas[0].model) || '(empty)'}};
            B: {{modelText(state.replicas[1].model) || '(empty)'}};
            hub: {{modelText(state.hub.model) || '(empty)'}}</p>
    </div>
    <p v-else role="status">Starting the local engine…</p>
    <div v-if="state" class="lab-replicas">
        <article v-for="replica in [...state.replicas, state.hub]" :key="replica.name" :aria-label="`${replica.name} current document`" class="lab-replica">
            <h3>{{replica.name === 'Hub' ? 'Accepted at hub' : `Client ${replica.name}`}}</h3>
            <p class="lab-meta">{{replica.name === 'Hub' ? 'In-memory hub' : replica.online ? 'Connected' : 'Disconnected'}} · serverSeq {{replica.serverSeq}}</p>
            <div class="lab-paper">
                <small>content [ ]</small>
                <div v-for="(node, n) in replica.model.children" :key="n" class="lab-paragraph">
                    <small>{{node.type}} [{{n}}]</small>
                    <p v-if="node.runs?.length" class="lab-text"><template v-for="(run, r) in node.runs" :key="r"><span :class="{'lab-bold': run.marks?.bold}">{{run.text}}</span></template></p>
                    <p v-else class="lab-empty">Empty paragraph</p>
                </div>
            </div>
            <p v-if="replica.pending" class="lab-meta">Pending: {{replica.pending.length}} · Undo: {{replica.canUndo ? 'available' : 'empty'}}</p>
            <details><summary>Actual model JSON</summary><pre>{{JSON.stringify(replica.model, null, 2)}}</pre></details>
            <details v-if="replica.pending?.length"><summary>Queued token operations</summary><pre>{{JSON.stringify(replica.pending, null, 2)}}</pre></details>
        </article>
    </div>
    <details><summary>Schema used by all three instances</summary><pre>{{JSON.stringify(LAB_SCHEMA, null, 2)}}</pre></details>
    <details v-if="state?.rejection"><summary>Actual rejected edit diagnostic</summary><pre>{{state.rejection}}</pre></details>
    <p class="lab-limit">Controlled in-memory delivery, not HTTP, a process restart, disk persistence, or durable recovery.
        Reset discards only this page’s synthetic example. No document data is sent to a service.</p>
</section>
</template>

<style scoped>
.engine-lab{border:1px solid var(--vp-c-divider);border-radius:16px;padding:20px;margin:28px 0;background:var(--vp-c-bg-soft)}
.engine-lab h2{margin:0 0 14px;padding:0;border:0}.engine-lab h3{margin:0;font-size:17px}
.lab-controls{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:20px 0}
button{border:1px solid var(--vp-c-brand-1);border-radius:8px;padding:9px 14px;color:var(--vp-c-brand-1);font-weight:600;background:var(--vp-c-bg)}
button[aria-disabled="true"]{opacity:.5;cursor:not-allowed}button:focus-visible,summary:focus-visible{outline:3px solid var(--vp-c-brand-1);outline-offset:3px}
.lab-status{padding:12px;border-left:4px solid var(--vp-c-brand-1);background:var(--vp-c-bg)}.lab-status p{margin:6px 0}
.lab-replicas{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0}.lab-replica{min-width:0}
.lab-paper{min-height:140px;background:var(--vp-c-bg);border:1px solid var(--vp-c-divider);border-radius:8px;padding:12px}
.lab-paragraph{border-left:3px solid var(--vp-c-brand-1);padding:4px 10px;margin-top:8px}.lab-text{font-size:28px;letter-spacing:3px;min-height:38px;margin:8px 0;overflow-wrap:anywhere}.lab-bold{font-weight:800}.lab-empty{font-style:italic;color:var(--vp-c-text-2)}
.lab-meta,small,.lab-limit{font-size:12px;color:var(--vp-c-text-2);line-height:1.6}.lab-meta{min-height:38px;margin:8px 0}summary{cursor:pointer;font-size:13px;margin:10px 0}pre{font-size:11px;line-height:1.6;overflow:auto;max-height:220px;background:var(--vp-c-bg);padding:10px}.lab-summary{font-size:13px}
@media(max-width:700px){.lab-replicas{grid-template-columns:1fr}.lab-paper{min-height:110px}.lab-meta{min-height:0}.engine-lab{padding:14px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style>
