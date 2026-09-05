"""Flask server for PDB Builder."""

import json
import os
import sys
import webbrowser
from flask import Flask, render_template, request, jsonify

from pdb_ops import load_pdb, get_inventory, pairwise_distances
from campaign_export import export_target, validate_hotspots

app = Flask(__name__)
_state = {
    "structure": None, "inventory": None,
    "chains": None, "pdb_string": None,
}

# optional file to open on startup: `python app.py <file.pdb>`
_preload = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else None


def _ingest(pdb_string):
    structure, chains = load_pdb(pdb_string)
    inventory = get_inventory(structure)
    _state.update(structure=structure, inventory=inventory,
                  chains=chains, pdb_string=pdb_string)
    return jsonify({"pdb_string": pdb_string, "chains": chains,
                    "residues": inventory})


@app.route("/")
def index():
    return render_template("viewer.html")


@app.route("/api/preload")
def api_preload():
    if not _preload or not os.path.isfile(_preload):
        return jsonify({"none": True})
    with open(_preload, encoding="utf-8", errors="ignore") as f:
        return _ingest(f.read())


@app.route("/api/load", methods=["POST"])
def api_load():
    if "file" in request.files:
        pdb_string = request.files["file"].read().decode("utf-8", errors="ignore")
    elif request.json and "pdb_string" in request.json:
        pdb_string = request.json["pdb_string"]
    else:
        return jsonify({"error": "No PDB data"}), 400
    return _ingest(pdb_string)


@app.route("/api/distances", methods=["POST"])
def api_distances():
    keys = request.json.get("residues", [])
    if not _state["structure"]:
        return jsonify({"error": "No structure loaded"}), 400
    return jsonify({"pairs": pairwise_distances(_state["structure"], keys)})


@app.route("/api/validate", methods=["POST"])
def api_validate():
    data = request.json
    hotspots = data.get("hotspots", [])
    threshold = data.get("sasa_threshold", 0.3)
    if not _state["inventory"]:
        return jsonify({"error": "No structure loaded"}), 400
    checks = validate_hotspots(_state["inventory"], hotspots, threshold)
    return jsonify({"valid": all(c["passed"] for c in checks),
                    "checks": checks})


@app.route("/api/export", methods=["POST"])
def api_export():
    data = request.json
    focus_chains = data.get("focus_chains", [])
    focus_ranges = {k: tuple(v) for k, v in data.get("focus_ranges", {}).items()}
    hotspots = data.get("hotspots", [])
    binder_len = tuple(data.get("binder_length", [40, 50]))
    name = data.get("name", "target")
    out_dir = data.get("output_dir", ".")

    pdb_str, config, chain_map = export_target(
        _state["structure"], focus_chains, focus_ranges,
        hotspots, _state["inventory"], binder_len)

    config["target_pdb"] = f"{name}_target.pdb"
    pdb_path = os.path.join(out_dir, config["target_pdb"])
    cfg_path = os.path.join(out_dir, f"{name}_config.json")

    os.makedirs(out_dir, exist_ok=True)
    with open(pdb_path, "w", newline="\n") as f:
        f.write(pdb_str)

    dists = pairwise_distances(_state["structure"], hotspots)
    config["pairwise_distances"] = {
        f"{p['r1']}-{p['r2']}": p["dist"] for p in dists}
    config["warnings"] = [
        f"{p['r1']}-{p['r2']} distance {p['dist']} A -- near edge of binder reach"
        for p in dists if p["dist"] > 20]

    with open(cfg_path, "w", newline="\n") as f:
        json.dump(config, f, indent=2)

    return jsonify({"target_path": pdb_path, "config_path": cfg_path,
                    "chain_map": chain_map})


if __name__ == "__main__":
    webbrowser.open("http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)
