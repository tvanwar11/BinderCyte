# BinderCyte

Two small local GUIs for the front half of a de novo protein binder design
campaign: preparing a target PDB, and launching the RFdiffusion backbone run on
a SLURM cluster.

Both are single-user Flask apps. They run on `127.0.0.1`, open a browser tab,
and keep all state in memory. There is no database, no account system, and
nothing is uploaded anywhere.

| Tool | Port | What it does |
|---|---|---|
| **PDB Builder** | 5000 | Load a structure, inspect chains and residues, pick hotspots, export an RFdiffusion-ready target |
| **Backbone Builder** | 5001 | Configure a design campaign, generate `manifest.csv` + a SLURM array script, transfer over SSH, submit |

They are designed to be used in that order, but neither depends on the other.

## Install

```bash
git clone https://github.com/tvanwar11/BinderCyte.git
cd BinderCyte
python -m venv .venv && . .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```bash
python pdb_builder/app.py                # optionally: app.py mystructure.pdb
python campaign_builder/app.py
```

On Windows the two `.bat` files launch the same thing by double-click.

## PDB Builder

Loads a PDB, builds a per-residue inventory (chain, position, name, chemistry
class), and lets you select a hotspot set interactively. Pairwise distance
readout helps you check that a candidate hotspot group is actually one patch
rather than residues on opposite faces of a domain — a distinction that is easy
to miss from sequence position alone.

Export writes a cropped, renumbered target PDB plus the hotspot string in the
form RFdiffusion expects, and validates that every hotspot survived the crop.

## Backbone Builder

Configure binder length range, designs per batch, batch count, and the SLURM
parameters, then:

1. **Generate** — writes `manifest.csv` and a SLURM array script locally.
2. **Transfer** — SCPs the campaign directory to the cluster.
3. **Submit** — runs `sbatch` and reports the job ID.

Connection is real SSH via paramiko, including keyboard-interactive MFA (Duo
and similar): enter your password, then approve the push on your device. The
status pill moves Authenticating → Awaiting MFA → Connected.

**Credentials are never written to disk.** They are held in memory for the
lifetime of the process and used only to open the transport. There is no
credential store, and nothing is logged. Fill in your own host, username and
account — the shipped defaults are placeholders.

`campaign.py` is deliberately structured so later pipeline stages (sequence
design, structure prediction) can be added alongside the backbone stage.

## Requirements

Python 3.8+, plus a cluster with RFdiffusion installed and reachable over SSH.
Set the RFdiffusion root path in the Backbone Builder form; nothing about the
installation layout is hardcoded.

## Scope

These are lab tools, not a framework. They do one narrow job each and assume a
single user on a trusted local machine. Do not expose either port to a network.

## License

Not yet licensed. Until a LICENSE file is added, all rights are reserved.
