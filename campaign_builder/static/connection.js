/* SSH connection management with Duo MFA polling */

let pollTimer = null;

function doConnect() {
    const data = {
        hostname: document.getElementById("hostname").value,
        username: document.getElementById("username").value,
        password: document.getElementById("password").value,
    };
    if (!data.username || !data.password) {
        setConnMsg("Username and password required", "error");
        return;
    }
    fetch("/api/connect", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(data),
    }).then(function(r) { return r.json(); }).then(function() { startPolling(); });
}

function doDisconnect() {
    fetch("/api/disconnect", {method: "POST"}).then(function() {
        stopPolling();
        setConnState("disconnected");
    });
}

function startPolling() {
    stopPolling();
    pollTimer = setInterval(pollStatus, 1000);
}

function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function pollStatus() {
    fetch("/api/status").then(function(r) { return r.json(); }).then(function(s) {
        setConnState(s.state, s.error);
        if (s.state === "connected" || s.state === "error") stopPolling();
    });
}

function setConnState(state, error) {
    const dot = document.getElementById("conn-dot");
    const label = document.getElementById("conn-label");
    const btn = document.getElementById("btn-connect");
    const colors = {
        disconnected: "gray", authenticating: "yellow",
        awaiting_mfa: "blue", connected: "green", error: "red",
    };
    const labels = {
        disconnected: "Disconnected", authenticating: "Authenticating",
        awaiting_mfa: "Awaiting Duo", connected: "Connected", error: "Error",
    };
    dot.className = "dot " + (colors[state] || "gray");
    label.textContent = labels[state] || "Disconnected";

    const msgs = {
        disconnected: "",
        authenticating: "Authenticating...",
        awaiting_mfa: "Approve the Duo push on your phone.",
        connected: "Connected to HPC.",
        error: error || "Connection failed.",
    };
    setConnMsg(msgs[state] || "", state === "error" ? "error" : "");

    const gate = document.getElementById("conn-gate");
    if (gate) gate.classList.toggle("hidden", state === "connected");

    if (state === "connected") {
        btn.textContent = "Disconnect";
        btn.disabled = false;
        btn.onclick = doDisconnect;
        const pw = document.getElementById("password");
        if (pw) pw.value = "";
    } else if (state === "disconnected" || state === "error") {
        btn.textContent = "Connect";
        btn.disabled = false;
        btn.onclick = doConnect;
    } else {
        btn.textContent = "Connecting...";
        btn.disabled = true;
    }
}

function setConnMsg(msg, cls) {
    const el = document.getElementById("conn-msg");
    el.textContent = msg;
    el.className = "hint " + (cls || "");
}

/* Enter in any credential field triggers Connect (when not already connecting). */
["hostname", "username", "password"].forEach(function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("keydown", function (e) {
        const btn = document.getElementById("btn-connect");
        if (e.key === "Enter" && btn.textContent === "Connect") { e.preventDefault(); doConnect(); }
    });
});
