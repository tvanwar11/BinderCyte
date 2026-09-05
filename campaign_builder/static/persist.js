/* Persist form state across launches (localStorage). Password is never stored. */

const PERSIST_KEY = "backbone_builder_state_v1";
const PERSIST_FIELDS = [
    "hostname", "username", "campaign-name", "target-pdb",
    "target-chain", "target-start", "target-end",
    "partition", "memory", "account", "time-limit", "rfd-root",
    "noise-ca", "noise-frame",
];

function readCellRows() {
    return Array.from(document.querySelectorAll("#cells-body tr")).map(function (tr) {
        return {
            name: tr.querySelector(".cell-name").value,
            lmin: tr.querySelector(".cell-lmin").value,
            lmax: tr.querySelector(".cell-lmax").value,
            hotspots: tr.querySelector(".cell-hotspots").value,
            designs: tr.querySelector(".cell-designs").value,
        };
    });
}

function saveState() {
    const state = {cells: readCellRows()};
    PERSIST_FIELDS.forEach(function (id) {
        const el = document.getElementById(id);
        if (el) state[id] = el.value;
    });
    try { localStorage.setItem(PERSIST_KEY, JSON.stringify(state)); } catch (e) { /* quota/private mode */ }
}

function restoreState() {
    let state;
    try { state = JSON.parse(localStorage.getItem(PERSIST_KEY)); } catch (e) { return; }
    if (!state) return;
    PERSIST_FIELDS.forEach(function (id) {
        const el = document.getElementById(id);
        if (el && state[id] != null) el.value = state[id];
    });
    if (Array.isArray(state.cells) && state.cells.length) {
        document.getElementById("cells-body").innerHTML = "";
        cellCounter = 0;
        state.cells.forEach(function (c) { addCell(c); });
    }
    updateTotal();
}

restoreState();
document.addEventListener("input", saveState);
document.addEventListener("change", saveState);
new MutationObserver(saveState).observe(
    document.getElementById("cells-body"), {childList: true}
);
