/* Live SLURM job status polling */

let _jid = null;
let _jobTimer = null;
const JOB_POLL_MS = 15000;
const TERMINAL = /COMPLETED|FAILED|CANCELLED|TIMEOUT|OUT_OF_MEMORY|NODE_FAIL|BOOT_FAIL|DEADLINE/;

function startJobMonitor(jid) {
    _jid = jid;
    document.getElementById("job-id").textContent = jid;
    document.getElementById("job-info").classList.remove("hidden");
    stopJobMonitor();
    setLive(true);
    fetchJobStatus();
    _jobTimer = setInterval(fetchJobStatus, JOB_POLL_MS);
}

function stopJobMonitor() {
    if (_jobTimer) { clearInterval(_jobTimer); _jobTimer = null; }
}

function fetchJobStatus() {
    if (!_jid) return;
    fetch("/api/job-status", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({job_id: _jid}),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        const out = data.output || data.error || "(waiting for scheduler…)";
        document.getElementById("job-output").textContent = out;
        if (TERMINAL.test(out)) { stopJobMonitor(); setLive(false); }
    })
    .catch(function() { /* transient poll error — keep the last-known status */ });
}

/* Manual refresh button. */
function checkJobStatus() { fetchJobStatus(); }

function setLive(on) {
    const el = document.getElementById("job-live");
    if (el) el.classList.toggle("hidden", !on);
}
