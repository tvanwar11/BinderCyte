/* Campaign form and design cell management */

let cellCounter = 0;

function esc(v) {
    return String(v == null ? "" : v)
        .replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function addCell(vals) {
    vals = vals || {};
    const tbody = document.getElementById("cells-body");
    const idx = cellCounter++;
    const name = vals.name != null ? vals.name : "cell_" + idx;
    const lmin = vals.lmin != null ? vals.lmin : 25;
    const lmax = vals.lmax != null ? vals.lmax : 50;
    const hot = vals.hotspots != null ? vals.hotspots : "";
    const designs = vals.designs != null ? vals.designs : 500;
    const tr = document.createElement("tr");
    tr.id = "cell-" + idx;
    tr.innerHTML =
        '<td><input type="text" class="cell-name" value="' + esc(name) + '"></td>' +
        '<td><input type="number" class="cell-lmin" value="' + esc(lmin) + '">' +
        '<input type="number" class="cell-lmax" value="' + esc(lmax) + '"></td>' +
        '<td><input type="text" class="cell-hotspots" placeholder="A39,A45" value="' + esc(hot) + '"></td>' +
        '<td><input type="number" class="cell-designs" value="' + esc(designs) + '" onchange="updateTotal()"></td>' +
        '<td><button class="btn btn-ghost small" onclick="removeCell(' + idx + ')" title="Remove cell">&times;</button></td>';
    tbody.appendChild(tr);
    updateTotal();
}

function removeCell(idx) {
    const row = document.getElementById("cell-" + idx);
    if (row) row.remove();
    updateTotal();
}

function getCells() {
    const rows = document.querySelectorAll("#cells-body tr");
    const chain = document.getElementById("target-chain").value;
    const start = document.getElementById("target-start").value;
    const end = document.getElementById("target-end").value;
    const cells = [];
    rows.forEach(function(tr) {
        cells.push({
            group_name: tr.querySelector(".cell-name").value,
            chain: chain,
            start: parseInt(start),
            end: parseInt(end),
            length_min: parseInt(tr.querySelector(".cell-lmin").value),
            length_max: parseInt(tr.querySelector(".cell-lmax").value),
            hotspots: tr.querySelector(".cell-hotspots").value
                .split(",").map(function(s) { return s.trim(); }).filter(Boolean),
            designs: parseInt(tr.querySelector(".cell-designs").value),
        });
    });
    return cells;
}

function browsePdb() {
    fetch("/api/browse-pdb", {method: "POST"})
    .then(function(r) { return r.json(); })
    .then(function(d) {
        if (d.path) document.getElementById("target-pdb").value = d.path;
        else if (d.error) toast("Browse failed: " + d.error, "error");
    });
}

function getSlurmConfig() {
    return {
        partition: document.getElementById("partition").value,
        account: document.getElementById("account").value,
        time_limit: document.getElementById("time-limit").value,
        memory: document.getElementById("memory").value,
        rfd_root: document.getElementById("rfd-root").value,
        noise_ca: parseFloat(document.getElementById("noise-ca").value),
        noise_frame: parseFloat(document.getElementById("noise-frame").value),
    };
}

function updateTotal() {
    const cells = getCells();
    const line = document.getElementById("total-line");
    if (!cells.length) {
        line.textContent = "No design cells — add at least one.";
        line.className = "hint error";
        return;
    }
    let total = 0;
    for (let i = 0; i < cells.length; i++) total += cells[i].designs || 0;
    const est = Math.round(total * 11 / 60);
    line.textContent = cells.length + " cell(s), " + total + " designs (~" + est + " GPU-min)";
    line.className = "hint";
}

function markInvalid(el, bad) {
    if (el) el.classList.toggle("input-invalid", !!bad);
}

/* Instant client-side checks — returns first offending element (or null). */
function validateForm() {
    let firstBad = null;
    const flag = function (el, bad) { markInvalid(el, bad); if (bad && !firstBad) firstBad = el; };

    const nameEl = document.getElementById("campaign-name");
    flag(nameEl, !nameEl.value.trim());
    const pdbEl = document.getElementById("target-pdb");
    flag(pdbEl, !pdbEl.value.trim());

    document.querySelectorAll("#cells-body tr").forEach(function (tr) {
        const nm = tr.querySelector(".cell-name");
        const lo = tr.querySelector(".cell-lmin");
        const hi = tr.querySelector(".cell-lmax");
        const dn = tr.querySelector(".cell-designs");
        const lmin = parseInt(lo.value), lmax = parseInt(hi.value), d = parseInt(dn.value);
        flag(nm, !nm.value.trim());
        flag(lo, !(lmin >= 10) || !(lmin < lmax));
        flag(hi, !(lmax <= 200) || !(lmin < lmax));
        flag(dn, !(d >= 1));
    });
    return firstBad;
}

function toggleSection(id) {
    const el = document.getElementById(id);
    el.classList.toggle("collapsed");
    const arrow = el.querySelector(".arrow");
    if (arrow) arrow.style.transform = el.classList.contains("collapsed") ? "" : "rotate(90deg)";
}

/* Clear an invalid highlight as soon as the user edits that field. */
document.addEventListener("input", function (e) {
    if (e.target.classList && e.target.classList.contains("input-invalid")) {
        e.target.classList.remove("input-invalid");
    }
});

addCell();
