/* Sortable, filterable residue inventory table. */

function buildTable(residues) {
    const tbody = document.getElementById("res-tbody");
    tbody.innerHTML = "";
    for (const r of residues) {
        const tr = document.createElement("tr");
        tr.dataset.key = r.chain + ":" + r.resi;
        tr.dataset.chain = r.chain;
        tr.dataset.resi = r.resi;
        tr.dataset.resn = r.resn;
        tr.dataset.chemistry = r.chemistry;
        tr.dataset.sasa = r.sasa_rel;
        tr.dataset.orientation = r.orientation;

        const starTd = document.createElement("td");
        starTd.className = "col-star";
        const star = document.createElement("span");
        star.className = "star";
        star.textContent = "\u2605";
        star.onclick = (e) => { e.stopPropagation(); toggleHotspot(tr.dataset.key); };
        starTd.appendChild(star);
        tr.appendChild(starTd);

        let chem = r.chemistry;
        if (r.resn === "HIS") chem += "*";
        const sasaPct = Math.round(r.sasa_rel * 100) + "%";
        for (const v of [r.chain, r.resi, r.resn, chem, sasaPct, r.orientation]) {
            const td = document.createElement("td");
            td.textContent = v;
            tr.appendChild(td);
        }

        tr.onclick = () => {
            viewer.zoomTo({chain: r.chain, resi: r.resi}, 500);
            highlightRow(tr.dataset.key);
            viewer.render();
        };
        tbody.appendChild(tr);
    }
    updateCount();
}

function sortTable(col) {
    if (state.sortCol === col) state.sortAsc = !state.sortAsc;
    else { state.sortCol = col; state.sortAsc = true; }

    const tbody = document.getElementById("res-tbody");
    const rows = Array.from(tbody.rows);
    rows.sort((a, b) => {
        let va, vb;
        if (col === "sasa_rel") {
            va = parseFloat(a.dataset.sasa); vb = parseFloat(b.dataset.sasa);
        } else if (col === "resi") {
            va = parseInt(a.dataset.resi); vb = parseInt(b.dataset.resi);
        } else {
            va = a.dataset[col] || ""; vb = b.dataset[col] || "";
        }
        if (va < vb) return state.sortAsc ? -1 : 1;
        if (va > vb) return state.sortAsc ? 1 : -1;
        return 0;
    });
    for (const r of rows) tbody.appendChild(r);
}

function filterTable() {
    const f = state.filters;
    const tbody = document.getElementById("res-tbody");
    for (const tr of tbody.rows) {
        const match =
            (!f.chain || tr.dataset.chain === f.chain) &&
            (!f.chemistry || tr.dataset.chemistry === f.chemistry) &&
            (parseFloat(tr.dataset.sasa) * 100 >= f.sasa_min) &&
            (!f.orientation || tr.dataset.orientation === f.orientation);
        tr.classList.toggle("hidden", !match);
    }
    updateCount();
}

function updateCount() {
    const tbody = document.getElementById("res-tbody");
    const shown = Array.from(tbody.rows).filter(r => !r.classList.contains("hidden")).length;
    const total = state.residues.length;
    document.getElementById("res-count").textContent =
        shown < total ? `(${shown}/${total})` : `(${total})`;
}

function highlightRow(key) {
    document.querySelectorAll("#res-tbody tr.hl").forEach(r => r.classList.remove("hl"));
    const row = document.querySelector(`#res-tbody tr[data-key="${key}"]`);
    if (row) { row.classList.add("hl"); row.scrollIntoView({block: "nearest"}); }
}

function updateStars() {
    for (const tr of document.getElementById("res-tbody").rows) {
        const star = tr.querySelector(".star");
        if (!star) continue;
        const on = state.hotspots.has(tr.dataset.key);
        star.classList.toggle("on", on);
        tr.classList.toggle("hotspot-row", on);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("#res-table th[data-col]").forEach(th => {
        if (th.dataset.col !== "star")
            th.onclick = () => sortTable(th.dataset.col);
    });
});
