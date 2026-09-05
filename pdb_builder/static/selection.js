/* Click-to-select, chemistry filters, hotspot state, upload, export. */

function setupUpload() {
    const input = document.getElementById("pdb-file");
    const zone = document.getElementById("drop-zone");
    input.onchange = () => { if (input.files.length) uploadFile(input.files[0]); };
    zone.ondragover = (e) => { e.preventDefault(); zone.classList.add("dragover"); };
    zone.ondragleave = () => zone.classList.remove("dragover");
    zone.ondrop = (e) => {
        e.preventDefault(); zone.classList.remove("dragover");
        if (e.dataTransfer.files.length) uploadFile(e.dataTransfer.files[0]);
    };
}

async function uploadFile(file) {
    document.getElementById("loading").classList.remove("hidden");
    const form = new FormData();
    form.append("file", file);
    try {
        const resp = await fetch("/api/load", {method: "POST", body: form});
        const data = await resp.json();
        document.getElementById("loading").classList.add("hidden");
        if (data.error) { document.getElementById("exp-status").textContent = data.error; return; }
        onPdbLoaded(data);
    } catch (err) {
        document.getElementById("loading").classList.add("hidden");
        document.getElementById("exp-status").textContent = "Load failed: " + err.message;
    }
}

function onPdbLoaded(data) {
    state.chains = data.chains;
    state.residues = data.residues;
    state.residueIndex = {};
    state.hotspots.clear();
    state.focusChains.clear();
    state.focusRanges = {};
    for (const r of data.residues)
        state.residueIndex[r.chain + ":" + r.resi] = r;

    loadModel(data.pdb_string);
    setupClickable();
    buildChainLegend();
    buildTable(data.residues);

    for (const id of ["view-controls","filter-controls","focus-section",
                       "table-section","hotspot-panel","export-section"])
        document.getElementById(id).classList.remove("hidden");

    const sel = document.getElementById("f-chain");
    sel.innerHTML = '<option value="">All</option>';
    for (const c of data.chains)
        sel.innerHTML += `<option value="${c.id}">${c.id} (${c.start}-${c.end})</option>`;
}

function buildChainLegend() {
    const div = document.getElementById("chain-legend");
    div.innerHTML = "";
    for (const c of state.chains) {
        const el = document.createElement("div");
        el.className = "chain-entry";
        el.textContent = `${c.id}: ${c.start}-${c.end} (${c.count} res)`;
        el.onclick = () => {
            if (state.focusChains.has(c.id)) state.focusChains.delete(c.id);
            else state.focusChains.add(c.id);
            el.classList.toggle("selected", state.focusChains.has(c.id));
            setView(state.currentView);
        };
        div.appendChild(el);
    }
}

function setupClickable() {
    viewer.setClickable({}, true, (atom) => {
        toggleHotspot(atom.chain + ":" + atom.resi);
        highlightRow(atom.chain + ":" + atom.resi);
    });
    viewer.setHoverable({}, true,
        (atom) => {
            const e = state.residueIndex[atom.chain+":"+atom.resi];
            if (!e) return;
            viewer.addLabel(
                `${e.chain}:${e.resi} ${e.resn}  ${Math.round(e.sasa_rel*100)}%  ${e.chemistry}  ${e.orientation}`,
                {position:{x:atom.x,y:atom.y,z:atom.z}, backgroundColor:"rgba(0,0,0,0.8)",
                 fontColor:"#4fc3f7", fontSize:11, showBackground:true, fixed:true});
            viewer.render();
        },
        () => { viewer.removeAllLabels(); if (state.labelsOn) refreshLabels(); viewer.render(); }
    );
}

function toggleHotspot(key) {
    if (state.hotspots.has(key)) state.hotspots.delete(key);
    else state.hotspots.add(key);
    updateStars();
    updateHotspotPanel();
    setView(state.currentView);
}

async function updateHotspotPanel() {
    const keys = [...state.hotspots];
    document.getElementById("hs-count").textContent = `(${keys.length})`;
    document.getElementById("hs-list").innerHTML = keys.map(k => {
        const e = state.residueIndex[k] || {};
        return `<div class="hs-entry"><span>${k} ${e.resn||"?"} ${Math.round((e.sasa_rel||0)*100)}% ${e.orientation||""}</span><span class="hs-rm" onclick="toggleHotspot('${k}')">x</span></div>`;
    }).join("");

    if (keys.length < 2) { document.getElementById("hs-dists").innerHTML = ""; return; }
    const resp = await fetch("/api/distances", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({residues: keys})});
    const data = await resp.json();
    document.getElementById("hs-dists").innerHTML = data.pairs.map(p =>
        `<div class="${p.dist>20?'dist-warn':''}">${p.r1}-${p.r2}: ${p.dist}A${p.dist>20?' !':''}</div>`
    ).join("");
}

function applyFilters() {
    state.filters.chain = document.getElementById("f-chain").value;
    state.filters.chemistry = document.getElementById("f-chem").value;
    state.filters.sasa_min = parseInt(document.getElementById("f-sasa").value);
    state.filters.orientation = document.getElementById("f-orient").value;
    filterTable();
    setView(state.currentView);
}

function clearFilters() {
    document.getElementById("f-chain").value = "";
    document.getElementById("f-chem").value = "";
    document.getElementById("f-sasa").value = "0";
    document.getElementById("sasa-val").textContent = "0%";
    document.getElementById("f-orient").value = "";
    state.filters = {chain:"", chemistry:"", sasa_min:0, orientation:""};
    filterTable();
    setView(state.currentView);
}

function setFocusFromInput() {
    const raw = document.getElementById("focus-input").value.trim();
    if (!raw) return;
    const m = raw.match(/^([A-Za-z]):?(\d+)?-?(\d+)?$/);
    if (!m) return;
    const ch = m[1].toUpperCase();
    state.focusChains.add(ch);
    if (m[2] && m[3]) state.focusRanges[ch] = [parseInt(m[2]), parseInt(m[3])];
    document.querySelectorAll(".chain-entry").forEach(e => {
        if (e.textContent.startsWith(ch+":")) e.classList.add("selected");
    });
    setView(state.currentView);
    viewer.zoomTo(focusSel(), 500);
    viewer.render();
}

function clearFocus() {
    state.focusChains.clear();
    state.focusRanges = {};
    document.querySelectorAll(".chain-entry").forEach(e => e.classList.remove("selected"));
    document.getElementById("focus-input").value = "";
    setView(state.currentView);
}

function promoteSelected() {
    for (const e of getFiltered()) state.hotspots.add(e.chain+":"+e.resi);
    updateStars();
    updateHotspotPanel();
    setView(state.currentView);
}

async function validateExport() {
    const threshold = parseInt(document.getElementById("f-sasa").value)/100 || 0.3;
    const resp = await fetch("/api/validate", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({hotspots:[...state.hotspots], sasa_threshold:threshold})});
    const data = await resp.json();
    document.getElementById("exp-status").innerHTML =
        data.checks.map(c => `<div class="${c.passed?'chk-pass':'chk-fail'}">${c.passed?'\u2713':'\u2717'} ${c.detail}</div>`).join("")
        + `<div>${data.valid ? 'Ready to export' : 'Fix warnings above'}</div>`;
}

async function doExport() {
    const name = document.getElementById("exp-name").value || "target";
    const bl = document.getElementById("exp-binder").value.split("-").map(Number);
    const fc = state.focusChains.size > 0 ? [...state.focusChains] : state.chains.map(c=>c.id);
    const resp = await fetch("/api/export", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
            focus_chains:fc, focus_ranges:state.focusRanges,
            hotspots:[...state.hotspots], binder_length:[bl[0]||40, bl[1]||50],
            name:name, output_dir:document.getElementById("exp-dir").value||"."})});
    const data = await resp.json();
    document.getElementById("exp-status").innerHTML = data.error
        ? `<div class="chk-fail">${data.error}</div>`
        : `<div class="chk-pass">Exported:<br>${data.target_path}<br>${data.config_path}</div>`;
}

async function tryPreload() {
    try {
        const data = await fetch("/api/preload").then(r => r.json());
        if (data && data.pdb_string) onPdbLoaded(data);
    } catch (err) { /* no preload configured */ }
}

document.addEventListener("DOMContentLoaded", () => {
    setupUpload();
    document.getElementById("f-sasa").oninput = function() {
        document.getElementById("sasa-val").textContent = this.value + "%";
    };
    tryPreload();
});
