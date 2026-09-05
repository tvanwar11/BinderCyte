/* Generate, transfer, and submit pipeline */

function btnBusy(btn, busy, busyText) {
    if (!btn) return;
    if (busy) {
        if (btn._label == null) btn._label = btn.textContent;
        if (busyText) btn.textContent = busyText;
        btn.disabled = true;
        btn.classList.add("loading");
    } else {
        if (btn._label != null) { btn.textContent = btn._label; btn._label = null; }
        btn.disabled = false;
        btn.classList.remove("loading");
    }
}

function showTab(name) {
    ["manifest", "slurm", "transfer"].forEach(function(t) {
        document.getElementById("pane-" + t).classList.toggle("hidden", t !== name);
    });
    document.querySelectorAll(".tab").forEach(function(b) {
        b.classList.toggle("active", b.dataset.tab === name);
    });
}

function toast(msg, cls) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.className = "toast " + (cls || "");
    clearTimeout(el._t);
    el._t = setTimeout(function() { el.className = "toast hidden " + (cls || ""); }, 3800);
}

function setStep(id, cls) {
    const el = document.getElementById(id);
    el.classList.remove("active", "done");
    if (cls) el.classList.add(cls);
}

function setStatus(msg, cls) {
    const el = document.getElementById("pipeline-status");
    el.textContent = msg;
    el.className = "status-box " + (cls || "");
}

function doGenerate() {
    const cells = getCells();
    if (cells.length === 0) {
        toast("Add at least one design cell", "error");
        return;
    }
    const bad = validateForm();
    if (bad) {
        bad.focus();
        setStatus("Fix the highlighted field(s), then Generate.", "error");
        toast("Check the highlighted fields", "error");
        return;
    }
    const data = {
        campaign_name: document.getElementById("campaign-name").value,
        target_pdb: document.getElementById("target-pdb").value,
        cells: cells,
        slurm_config: getSlurmConfig(),
    };

    const gbtn = document.getElementById("btn-generate");
    btnBusy(gbtn, true, "Generating…");
    setStatus("Generating campaign files...");
    fetch("/api/generate", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(data),
    })
    .then(function(r) { return r.json().then(function(d) { return {ok: r.ok, data: d}; }); })
    .then(function(res) {
        if (!res.ok) {
            const msgs = res.data.errors || [res.data.error];
            setStatus("Validation failed:\n- " + msgs.join("\n- "), "error");
            toast("Validation failed", "error");
            return;
        }
        document.getElementById("pane-manifest").textContent = res.data.manifest;
        document.getElementById("pane-slurm").textContent = res.data.slurm;

        const lines = res.data.transfer_plan.map(function(p) { return p.local + "\n  -> " + p.remote; });
        lines.push("(generated) manifest.csv");
        lines.push("(generated) rfdiffusion_array.slurm");
        document.getElementById("pane-transfer").textContent = lines.join("\n\n");

        document.getElementById("btn-transfer").disabled = false;
        setStep("ps-generate", "done");
        setStep("ps-transfer", "active");
        setStatus("Generated. Review the preview, then Transfer.", "success");
        toast("Campaign generated", "success");
    })
    .catch(function(err) {
        setStatus("Network error: " + err, "error");
        toast("Generate failed", "error");
    })
    .finally(function() { btnBusy(document.getElementById("btn-generate"), false); });
}

function doTransfer() {
    if (!ensureConnected()) return;
    setStatus("Transferring files to cluster...");
    document.getElementById("btn-transfer").disabled = true;
    fetch("/api/transfer", {method: "POST"})
    .then(function(r) { return r.json().then(function(d) { return {ok: r.ok, data: d}; }); })
    .then(function(res) {
        if (!res.ok) {
            setStatus("Transfer error: " + res.data.error, "error");
            document.getElementById("btn-transfer").disabled = false;
            toast("Transfer failed", "error");
            return;
        }
        setStatus("Transferred:\n- " + res.data.results.join("\n- "), "success");
        document.getElementById("btn-submit").disabled = false;
        setStep("ps-transfer", "done");
        setStep("ps-submit", "active");
        toast("Files transferred", "success");
    });
}

function doSubmit() {
    if (!ensureConnected()) return;
    setStatus("Submitting job to SLURM...");
    document.getElementById("btn-submit").disabled = true;
    fetch("/api/submit", {method: "POST"})
    .then(function(r) { return r.json().then(function(d) { return {ok: r.ok, data: d}; }); })
    .then(function(res) {
        if (!res.ok) {
            setStatus("Submit error: " + res.data.error, "error");
            document.getElementById("btn-submit").disabled = false;
            toast("Submit failed", "error");
            return;
        }
        setStep("ps-submit", "done");
        setStatus(res.data.output, "success");
        toast("Job " + res.data.job_id + " submitted", "success");
        startJobMonitor(res.data.job_id);
    });
}

function ensureConnected() {
    const label = document.getElementById("conn-label").textContent;
    if (label !== "Connected") {
        toast("Connect to the cluster first", "error");
        return false;
    }
    return true;
}

setStep("ps-generate", "active");
