"""Backbone Builder — Flask GUI for an RFdiffusion backbone pipeline on SLURM."""

import os
import webbrowser
from flask import Flask, request, jsonify, render_template
from ssh_manager import SSHManager
from campaign import generate_manifest, generate_slurm, get_transfer_plan, validate_campaign

app = Flask(__name__)
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
app.config["TEMPLATES_AUTO_RELOAD"] = True
ssh = SSHManager()
_state = {}


@app.route("/")
def index():
    return render_template("builder.html")


@app.route("/api/connect", methods=["POST"])
def connect():
    d = request.json
    if not d.get("username") or not d.get("password"):
        return jsonify({"error": "Username and password required"}), 400
    ssh.connect(
        d.get("hostname", "login.hpc.example.edu"),
        int(d.get("port", 22)),
        d["username"],
        d["password"],
    )
    return jsonify({"status": "authenticating"})


@app.route("/api/browse-pdb", methods=["POST"])
def browse_pdb():
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        path = filedialog.askopenfilename(
            parent=root,
            title="Select target PDB",
            filetypes=[("PDB files", "*.pdb"), ("All files", "*.*")],
        )
        root.destroy()
        return jsonify({"path": path or ""})
    except Exception as e:
        return jsonify({"path": "", "error": str(e)}), 500


@app.route("/api/status")
def status():
    return jsonify(ssh.get_status())


@app.route("/api/disconnect", methods=["POST"])
def disconnect():
    ssh.disconnect()
    return jsonify({"status": "disconnected"})


@app.route("/api/generate", methods=["POST"])
def generate():
    d = request.json
    name = d["campaign_name"]
    pdb = d["target_pdb"]
    cells = d["cells"]
    cfg = d.get("slurm_config", {})
    rfd_root = cfg.get("rfd_root", "/path/to/RFdiffusion")

    errors = validate_campaign(name, pdb, cells)
    if errors:
        return jsonify({"errors": errors}), 400

    manifest = generate_manifest(name, pdb, cells, rfd_root)
    slurm = generate_slurm(name, len(cells), cfg)
    plan = get_transfer_plan(name, pdb, rfd_root)

    _state.update(
        campaign_name=name, target_pdb=pdb, cells=cells,
        slurm_config=cfg, manifest=manifest, slurm=slurm, plan=plan,
    )
    return jsonify({
        "manifest": manifest,
        "slurm": slurm,
        "transfer_plan": [{"local": l, "remote": r} for l, r in plan],
    })


@app.route("/api/transfer", methods=["POST"])
def transfer():
    if ssh.get_status()["state"] != "connected":
        return jsonify({"error": "Not connected to HPC"}), 400
    if "manifest" not in _state:
        return jsonify({"error": "Generate campaign first"}), 400

    name = _state["campaign_name"]
    cfg = _state.get("slurm_config", {})
    rfd_root = cfg.get("rfd_root", "/path/to/RFdiffusion")
    remote_dir = f"{rfd_root}/inputs/binder_design/{name}"
    results = []

    try:
        for local_path, remote_path in _state["plan"]:
            ssh.upload_file(local_path, remote_path)
            results.append(f"Uploaded {os.path.basename(local_path)}")

        ssh.upload_string(_state["manifest"], f"{remote_dir}/manifest.csv")
        results.append("Uploaded manifest.csv")

        ssh.upload_string(_state["slurm"], f"{remote_dir}/rfdiffusion_array.slurm")
        results.append("Uploaded rfdiffusion_array.slurm")

        ssh.exec_command(f"mkdir -p {rfd_root}/logs")
        return jsonify({"results": results})
    except Exception as e:
        return jsonify({"error": str(e), "results": results}), 500


@app.route("/api/submit", methods=["POST"])
def submit():
    if ssh.get_status()["state"] != "connected":
        return jsonify({"error": "Not connected to HPC"}), 400
    if "campaign_name" not in _state:
        return jsonify({"error": "Generate and transfer first"}), 400

    name = _state["campaign_name"]
    cfg = _state.get("slurm_config", {})
    rfd_root = cfg.get("rfd_root", "/path/to/RFdiffusion")
    slurm_path = f"{rfd_root}/inputs/binder_design/{name}/rfdiffusion_array.slurm"

    stdout, stderr, code = ssh.exec_command(f"sbatch {slurm_path}")
    if code != 0:
        return jsonify({"error": f"sbatch failed: {stderr}"}), 500

    job_id = stdout.strip().split()[-1] if stdout.strip() else None
    return jsonify({"job_id": job_id, "output": stdout.strip()})


@app.route("/api/job-status", methods=["POST"])
def job_status():
    if ssh.get_status()["state"] != "connected":
        return jsonify({"error": "Not connected"}), 400
    jid = request.json.get("job_id")
    if not jid:
        return jsonify({"error": "No job ID"}), 400
    stdout, stderr, _ = ssh.exec_command(
        f"sacct -j {jid} --format=JobID,State,Elapsed,ExitCode --noheader"
    )
    return jsonify({"output": stdout.strip()})


if __name__ == "__main__":
    webbrowser.open("http://127.0.0.1:5001")
    app.run(host="127.0.0.1", port=5001, debug=False)
