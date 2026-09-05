/* Shared state, 3Dmol.js viewer, view modes, colorfuncs. */

const state = {
    residueIndex: {},
    hotspots: new Set(),
    focusChains: new Set(),
    focusRanges: {},
    labelsOn: false,
    contextOn: true,
    currentView: "cartoon",
    chains: [],
    residues: [],
    filters: { chain: "", chemistry: "", sasa_min: 0, orientation: "" },
    sortCol: null,
    sortAsc: true,
};

let viewer;

const KD = {
    ALA:1.8,ARG:-4.5,ASN:-3.5,ASP:-3.5,CYS:2.5,GLN:-3.5,GLU:-3.5,GLY:-0.4,
    HIS:-3.2,ILE:4.5,LEU:3.8,LYS:-3.9,MET:1.9,PHE:2.8,PRO:-1.6,SER:-0.8,
    THR:-0.7,TRP:-0.9,TYR:-1.3,VAL:4.2,
};

function initViewer() {
    viewer = $3Dmol.createViewer("viewer", { backgroundColor: "#1a1a2e" });
}

function loadModel(pdbStr) {
    viewer.removeAllModels();
    viewer.removeAllSurfaces();
    viewer.removeAllLabels();
    viewer.addModel(pdbStr, "pdb");
    setView("cartoon");
    viewer.zoomTo();
    viewer.render();
}

function lerp(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    const m = (s, e) => Math.round(s * (1 - t) + e * t);
    return (m((a>>16)&0xFF,(b>>16)&0xFF)<<16)|(m((a>>8)&0xFF,(b>>8)&0xFF)<<8)|m(a&0xFF,b&0xFF);
}
function lerp3(a, b, c, t) {
    return t < 0.5 ? lerp(a, b, t*2) : lerp(b, c, (t-0.5)*2);
}

function kdFunc(atom) {
    return lerp3(0x0000FF, 0xFFFFFF, 0x8B4513, ((KD[atom.resn]||0)+4.5)/9.0);
}
function sasaFunc(atom) {
    const e = state.residueIndex[atom.chain+":"+atom.resi];
    return e ? lerp3(0xFF0000, 0xFFFFFF, 0x0000FF, e.sasa_rel) : 0xCCCCCC;
}
function chemFunc(atom) {
    const e = state.residueIndex[atom.chain+":"+atom.resi];
    return {aromatic:0xFF8800, charged:0xDD0044, polar:0x00AA00,
            hydrophobic:0xCCBB00}[e?.chemistry] || 0xCCCCCC;
}

const OC = {outward:"green", inward:"red", lateral:"grey", "N/A":"white"};

function isFocused(ch, ri) {
    if (state.focusChains.size === 0) return true;
    if (!state.focusChains.has(ch)) return false;
    const r = state.focusRanges[ch];
    return !r || (ri >= r[0] && ri <= r[1]);
}

function focusSel() {
    if (state.focusChains.size === 0) return {};
    return { chain: [...state.focusChains] };
}
/* Surfaces must never include the membrane pseudo-atoms: with no focus chain
   set they would drag ~1200 extra spheres into the mesh and swamp the target. */
function surfSel() {
    return Object.assign({}, focusSel(), { not: { resn: ["MEM"] } });
}
function ghostSel() {
    if (state.focusChains.size === 0) return null;
    const non = state.chains.map(c => c.id).filter(c => !state.focusChains.has(c));
    return non.length ? { chain: non } : null;
}

function setView(mode) {
    state.currentView = mode;
    viewer.removeAllSurfaces();
    const fs = focusSel(), gs = ghostSel();
    if (gs) viewer.setStyle(gs, {cartoon:{opacity:0.15, color:"grey"}});

    const surfMap = {"surface-hydro":kdFunc, "surface-sasa":sasaFunc, "surface-chem":chemFunc};
    if (mode === "plddt")
        viewer.setStyle(fs, {cartoon:{colorscheme:{prop:"b",gradient:"roygb",min:0,max:100}}});
    else
        viewer.setStyle(fs, {cartoon:{}});

    const ss = surfSel();
    if (surfMap[mode])
        viewer.addSurface($3Dmol.SurfaceType.VDW, {opacity:0.7, colorfunc:surfMap[mode]}, ss, ss);
    if (mode === "composite")
        viewer.addSurface($3Dmol.SurfaceType.VDW, {opacity:0.4, colorfunc:chemFunc}, ss, ss);
    if (mode === "sticks-filtered" || mode === "composite") {
        for (const e of getFiltered())
            viewer.addStyle({chain:e.chain, resi:e.resi}, {stick:{radius:0.15}});
    }
    if (mode === "orientation") {
        for (const e of state.residues) {
            if (!isFocused(e.chain, e.resi)) continue;
            viewer.addStyle({chain:e.chain, resi:e.resi},
                {stick:{radius:0.15, color:OC[e.orientation]||"white"}});
        }
    }
    if (state.contextOn) renderContext();
    renderHotspots();
    if (state.labelsOn) refreshLabels();
    viewer.render();
    document.querySelectorAll("[data-view]").forEach(b =>
        b.classList.toggle("active", b.dataset.view === mode));
}

/* HETATM context: N-glycans and the membrane slab. These carry no cartoon, so
   without an explicit style they are simply invisible whatever the view mode. */
const GLYCAN_RESN = ["NAG", "MAN", "BMA", "FUC", "GAL"];

function renderContext() {
    viewer.addStyle({resn: GLYCAN_RESN},
        {stick: {radius: 0.16, colorscheme: "greenCarbon"}});
    viewer.addStyle({resn: "MEM"},
        {sphere: {radius: 1.1, color: 0x9DB8DC, opacity: 0.55}});
}

function toggleContext() {
    state.contextOn = !state.contextOn;
    document.getElementById("btn-context")?.classList.toggle("active", state.contextOn);
    setView(state.currentView);
}

function renderHotspots() {
    for (const key of state.hotspots) {
        const [ch, ri] = key.split(":");
        const sel = {chain:ch, resi:parseInt(ri)};
        viewer.addStyle(sel, {sphere:{radius:0.8, color:"red"}});
        viewer.addStyle(sel, {stick:{radius:0.15, color:"red"}});
    }
}

function toggleLabels() {
    state.labelsOn = !state.labelsOn;
    document.getElementById("btn-labels")?.classList.toggle("active", state.labelsOn);
    if (state.labelsOn) refreshLabels(); else viewer.removeAllLabels();
    viewer.render();
}

function refreshLabels() {
    viewer.removeAllLabels();
    for (const e of getFiltered()) {
        const atoms = viewer.selectedAtoms({chain:e.chain, resi:e.resi, atom:"CA"});
        if (atoms.length)
            viewer.addLabel(e.resi+" "+e.resn, {
                position:{x:atoms[0].x, y:atoms[0].y, z:atoms[0].z},
                backgroundColor:"rgba(0,0,0,0.7)", fontColor:"white",
                fontSize:10, showBackground:true,
            });
    }
}

function getFiltered() {
    const f = state.filters;
    return state.residues.filter(e =>
        (!f.chain || e.chain === f.chain) &&
        (!f.chemistry || e.chemistry === f.chemistry) &&
        (e.sasa_rel * 100 >= f.sasa_min) &&
        (!f.orientation || e.orientation === f.orientation) &&
        isFocused(e.chain, e.resi)
    );
}

document.addEventListener("DOMContentLoaded", initViewer);
