"""SASA computation and chemistry classification for PDB residues."""

from Bio.PDB import ShrakeRupley

# Tien et al. 2013, PLoS ONE 8(11):e80635 -- Gly-X-Gly reference maxima
MAX_SASA = {
    "ALA": 129, "ARG": 274, "ASN": 195, "ASP": 193, "CYS": 167,
    "GLN": 225, "GLU": 223, "GLY": 104, "HIS": 224, "ILE": 197,
    "LEU": 197, "LYS": 236, "MET": 224, "PHE": 240, "PRO": 159,
    "SER": 155, "THR": 172, "TRP": 285, "TYR": 263, "VAL": 174,
}

CHEMISTRY = {
    "PHE": "aromatic", "TYR": "aromatic", "TRP": "aromatic",
    "ASP": "charged", "GLU": "charged", "LYS": "charged",
    "ARG": "charged", "HIS": "charged",
    "SER": "polar", "THR": "polar", "ASN": "polar", "GLN": "polar",
    "CYS": "polar",
    "ALA": "hydrophobic", "VAL": "hydrophobic", "ILE": "hydrophobic",
    "LEU": "hydrophobic", "MET": "hydrophobic", "PRO": "hydrophobic",
    "GLY": "hydrophobic",
}

STANDARD = set(MAX_SASA)


def compute_sasa(structure):
    sr = ShrakeRupley()
    sr.compute(structure[0], level="R")


def classify(resn):
    return CHEMISTRY.get(resn, "other")


def build_inventory(structure):
    compute_sasa(structure)
    inventory = []
    for chain in structure[0]:
        for res in chain:
            if res.id[0] != " ":
                continue
            resn = res.get_resname().strip()
            resi = res.id[1]
            abs_sasa = round(res.sasa, 1) if hasattr(res, "sasa") else 0.0
            max_val = MAX_SASA.get(resn, 0)
            rel_sasa = round(abs_sasa / max_val, 3) if max_val > 0 else 0.0
            inventory.append({
                "chain": chain.id,
                "resi": resi,
                "resn": resn,
                "sasa_abs": abs_sasa,
                "sasa_rel": rel_sasa,
                "chemistry": classify(resn),
                "is_std": resn in STANDARD,
            })
    return inventory
