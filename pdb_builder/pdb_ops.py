"""PDB loading and residue inventory assembly."""

import io
import numpy as np
from Bio.PDB import PDBParser

from residue_chemistry import build_inventory
from orientation import compute_orientations


def load_pdb(pdb_string):
    parser = PDBParser(QUIET=True)
    structure = parser.get_structure("target", io.StringIO(pdb_string))
    chains = []
    for chain in structure[0]:
        residues = [r for r in chain if r.id[0] == " "]
        if not residues:
            continue
        resis = [r.id[1] for r in residues]
        chains.append({
            "id": chain.id,
            "start": min(resis),
            "end": max(resis),
            "count": len(residues),
        })
    return structure, chains


def get_inventory(structure):
    inv = build_inventory(structure)
    compute_orientations(structure, inv)
    return inv


def pairwise_distances(structure, keys):
    model = structure[0]
    coords = {}
    for key in keys:
        parts = key.split(":")
        if len(parts) != 2:
            continue
        cid, resi_str = parts
        try:
            res = model[cid][(" ", int(resi_str), " ")]
            if "CA" in res:
                coords[key] = res["CA"].get_vector().get_array()
        except (KeyError, ValueError):
            pass

    pairs = []
    ks = list(coords.keys())
    for i in range(len(ks)):
        for j in range(i + 1, len(ks)):
            d = float(np.linalg.norm(coords[ks[i]] - coords[ks[j]]))
            pairs.append({"r1": ks[i], "r2": ks[j], "dist": round(d, 1)})
    return pairs
