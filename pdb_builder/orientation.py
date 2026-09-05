"""Sidechain orientation: Ca->Cg dot local surface normal."""

import numpy as np
from Bio.PDB import NeighborSearch

SC_ATOM = {
    "GLY": None, "ALA": None,
    "SER": "CB", "THR": "CB", "CYS": "CB", "VAL": "CB",
    "ILE": "CG1",
}
NEIGHBOR_RADIUS = 10.0


def _sc_atom_name(resn):
    if resn in SC_ATOM:
        return SC_ATOM[resn]
    return "CG"


def _collect_ca(structure):
    atoms = []
    for chain in structure[0]:
        for res in chain:
            if res.id[0] == " " and "CA" in res:
                atoms.append(res["CA"])
    return atoms


def compute_orientations(structure, inventory):
    ca_atoms = _collect_ca(structure)
    if not ca_atoms:
        for e in inventory:
            e["orientation"] = "N/A"
        return

    ns = NeighborSearch(ca_atoms)
    model = structure[0]

    for entry in inventory:
        sc_name = _sc_atom_name(entry["resn"])
        if sc_name is None:
            entry["orientation"] = "N/A"
            continue

        try:
            res = model[entry["chain"]][(" ", entry["resi"], " ")]
        except KeyError:
            entry["orientation"] = "N/A"
            continue

        if "CA" not in res or sc_name not in res:
            entry["orientation"] = "N/A"
            continue

        ca = res["CA"].get_vector().get_array()
        sc = res[sc_name].get_vector().get_array()
        sc_vec = sc - ca
        n = np.linalg.norm(sc_vec)
        if n < 1e-6:
            entry["orientation"] = "N/A"
            continue
        sc_vec = sc_vec / n

        neighbors = ns.search(ca, NEIGHBOR_RADIUS)
        if len(neighbors) < 2:
            entry["orientation"] = "N/A"
            continue

        centroid = np.mean(
            [a.get_vector().get_array() for a in neighbors], axis=0
        )
        normal = ca - centroid
        nn = np.linalg.norm(normal)
        if nn < 1e-6:
            entry["orientation"] = "N/A"
            continue
        normal = normal / nn

        dot = float(np.dot(sc_vec, normal))
        if dot > 0.3:
            entry["orientation"] = "outward"
        elif dot < -0.3:
            entry["orientation"] = "inward"
        else:
            entry["orientation"] = "lateral"
