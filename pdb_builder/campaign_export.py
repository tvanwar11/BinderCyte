"""Export trimmed PDB and campaign config for RFdiffusion."""

import io
from Bio.PDB import StructureBuilder, PDBIO


def export_target(structure, focus_chains, focus_ranges, hotspots,
                  inventory, binder_length=(40, 50)):
    sb = StructureBuilder.StructureBuilder()
    sb.init_structure("export")
    sb.init_model(0)

    labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    chain_map = {}
    ci = 0
    inv_lookup = {f"{e['chain']}:{e['resi']}": e for e in inventory}

    for chain in structure[0]:
        if chain.id not in focus_chains:
            continue
        if ci >= len(labels):
            break
        new_cid = labels[ci]
        ci += 1
        sb.init_chain(new_cid)
        sb.init_seg(" ")
        new_resi = 1
        for res in chain:
            if res.id[0] != " ":
                continue
            resi = res.id[1]
            if chain.id in focus_ranges:
                s, e = focus_ranges[chain.id]
                if not (s <= resi <= e):
                    continue
            chain_map[f"{new_cid}:{new_resi}"] = f"{chain.id}:{resi}"
            sb.init_residue(res.get_resname(), " ", new_resi, " ")
            for atom in res:
                sb.init_atom(
                    atom.get_name(), atom.get_coord().tolist(),
                    atom.get_bfactor(), atom.get_occupancy(),
                    atom.get_altloc(), atom.get_fullname(), atom.element,
                )
            new_resi += 1

    out = io.StringIO()
    writer = PDBIO()
    writer.set_structure(sb.get_structure())
    writer.save(out)
    pdb_str = out.getvalue().encode("ascii", errors="ignore").decode("ascii")

    reverse = {v: k for k, v in chain_map.items()}
    mapped = []
    for h in hotspots:
        nk = reverse.get(h)
        if not nk:
            continue
        cid, resi = nk.split(":")
        e = inv_lookup.get(h, {})
        mapped.append({
            "chain": cid, "resi": int(resi), "resn": e.get("resn", "UNK"),
            "orig_resi": int(h.split(":")[1]),
            "sasa_abs": e.get("sasa_abs", 0), "sasa_rel": e.get("sasa_rel", 0),
            "chemistry": e.get("chemistry", "other"),
            "orientation": e.get("orientation", "N/A"),
        })

    rng = f"1-{new_resi - 1}" if new_resi > 1 else "1-1"
    contig = f"[{labels[0]}{rng}/0 {binder_length[0]}-{binder_length[1]}]"

    config = {
        "chains_kept": list(focus_chains),
        "residue_range": rng,
        "chain_map": chain_map,
        "hotspots": [h["resi"] for h in mapped],
        "hotspot_residues": mapped,
        "contig_string": contig,
        "binder_length_range": list(binder_length),
    }
    return pdb_str, config, chain_map


def validate_hotspots(inventory, hotspot_keys, sasa_threshold=0.3):
    lookup = {f"{e['chain']}:{e['resi']}": e for e in inventory}
    checks = []
    for key in hotspot_keys:
        entry = lookup.get(key)
        if not entry:
            checks.append({"name": f"exists_{key}", "passed": False,
                           "detail": f"{key} not found"})
            continue
        pct = f"{entry['sasa_rel']:.0%}"
        thr = f"{sasa_threshold:.0%}"
        if entry["sasa_rel"] < sasa_threshold:
            checks.append({"name": f"sasa_{key}", "passed": False,
                           "detail": f"{key} relSASA {pct} < {thr}"})
        else:
            checks.append({"name": f"sasa_{key}", "passed": True,
                           "detail": f"{key} relSASA {pct}"})
        if not entry["is_std"]:
            checks.append({"name": f"std_{key}", "passed": False,
                           "detail": f"{key} non-standard ({entry['resn']})"})
        if entry["orientation"] == "inward":
            checks.append({"name": f"orient_{key}", "passed": False,
                           "detail": f"{key} sidechain points inward"})
    return checks
