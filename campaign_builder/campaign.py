"""RFdiffusion campaign manifest and SLURM script generation."""

import csv
import io
import os

MANIFEST_COLUMNS = [
    "task_id", "group_name", "target_pdb", "contigs", "hotspots", "designs",
]


def build_contigs(chain, start, end, len_min, len_max):
    return f"[{chain}{start}-{end}/0 {len_min}-{len_max}]"


def build_hotspots(residues):
    if not residues:
        return "[]"
    return "[" + ",".join(r.strip() for r in residues if r.strip()) + "]"


def generate_manifest(campaign_name, target_pdb_local, cells, rfd_root):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=MANIFEST_COLUMNS)
    writer.writeheader()

    target_filename = os.path.basename(target_pdb_local)
    container_pdb = f"/workspace/inputs/binder_design/{campaign_name}/{target_filename}"

    for i, cell in enumerate(cells):
        writer.writerow({
            "task_id": i,
            "group_name": cell["group_name"],
            "target_pdb": container_pdb,
            "contigs": build_contigs(
                cell["chain"], cell["start"], cell["end"],
                cell["length_min"], cell["length_max"],
            ),
            "hotspots": build_hotspots(cell.get("hotspots", [])),
            "designs": cell["designs"],
        })
    return buf.getvalue()


def generate_slurm(campaign_name, n_tasks, cfg):
    rfd = cfg.get("rfd_root", "/path/to/RFdiffusion")
    lines = [
        "#!/bin/bash",
        f"#SBATCH --job-name=rfdiff_{campaign_name}",
        f"#SBATCH --partition={cfg.get('partition', 'sla-prio')}",
        f"#SBATCH --account={cfg.get('account', 'your_slurm_account')}",
        "#SBATCH --gres=gpu:1",
        "#SBATCH --cpus-per-task=2",
        f"#SBATCH --mem={cfg.get('memory', '8G')}",
        f"#SBATCH --time={cfg.get('time_limit', '00:30:00')}",
        f"#SBATCH --array=0-{n_tasks - 1}",
        f"#SBATCH --output={rfd}/logs/%x_%A_%a.out",
        "",
        'trap \'echo "Job $SLURM_JOB_ID task $SLURM_ARRAY_TASK_ID exiting, code $?"\' EXIT TERM',
        "",
        f'RFD_ROOT="{rfd}"',
        f'CAMPAIGN="{campaign_name}"',
        'MANIFEST="$RFD_ROOT/inputs/binder_design/$CAMPAIGN/manifest.csv"',
        "",
        'eval $(python3 -c "',
        "import csv, sys",
        "with open(sys.argv[1]) as f:",
        "    rows = list(csv.DictReader(f))",
        "if int(sys.argv[2]) >= len(rows): sys.exit(1)",
        "row = rows[int(sys.argv[2])]",
        "for k, v in row.items():",
        r"""    print(f'export M_{k.upper()}=\"{v}\"')""",
        '" "$MANIFEST" "$SLURM_ARRAY_TASK_ID")',
        "",
        "if [ $? -ne 0 ]; then",
        '    echo "ERROR: Failed to parse manifest row $SLURM_ARRAY_TASK_ID"',
        "    exit 1",
        "fi",
        "",
        'OUT_DIR="$RFD_ROOT/outputs/binder_design/$CAMPAIGN/$M_GROUP_NAME"',
        'mkdir -p "$OUT_DIR"',
        "",
        "apptainer exec --nv \\",
        "    --bind $RFD_ROOT/models:/app/RFdiffusion/models \\",
        "    --bind $RFD_ROOT:/workspace \\",
        "    $RFD_ROOT/container/rfdiffusion.sif \\",
        "    python /app/RFdiffusion/scripts/run_inference.py \\",
        '        inference.output_prefix="$OUT_DIR/$M_GROUP_NAME" \\',
        '        inference.input_pdb="$M_TARGET_PDB" \\',
        "        'contigmap.contigs='\"$M_CONTIGS\" \\",
        "        'ppi.hotspot_res='\"$M_HOTSPOTS\" \\",
        "        inference.num_designs=$M_DESIGNS \\",
        f"        denoiser.noise_scale_ca={cfg.get('noise_ca', 0)} \\",
        f"        denoiser.noise_scale_frame={cfg.get('noise_frame', 0)} \\",
        "        inference.write_trajectory=False",
    ]
    return "\n".join(lines) + "\n"


def get_transfer_plan(campaign_name, target_pdb_local, rfd_root):
    remote_dir = f"{rfd_root}/inputs/binder_design/{campaign_name}"
    filename = os.path.basename(target_pdb_local)
    return [(target_pdb_local, f"{remote_dir}/{filename}")]


def validate_campaign(campaign_name, target_pdb_local, cells):
    errors = []
    if not campaign_name or not campaign_name.strip():
        errors.append("Campaign name is required")
    if not target_pdb_local or not os.path.isfile(target_pdb_local):
        errors.append(f"Target PDB not found: {target_pdb_local}")
    if not cells:
        errors.append("At least one cell is required")
    for i, cell in enumerate(cells):
        if not cell.get("group_name"):
            errors.append(f"Cell {i}: group name required")
        lmin = cell.get("length_min", 0)
        lmax = cell.get("length_max", 0)
        if lmin < 10:
            errors.append(f"Cell {i}: min binder length should be >= 10")
        if lmax > 200:
            errors.append(f"Cell {i}: max binder length should be <= 200")
        if lmin >= lmax:
            errors.append(f"Cell {i}: length_min must be < length_max")
        if cell.get("designs", 0) < 1:
            errors.append(f"Cell {i}: at least 1 design required")
    return errors
