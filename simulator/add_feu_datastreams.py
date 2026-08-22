#!/usr/bin/env python3
"""Ajoute les datastreams du « Feu intelligent » à un device existant sur le cloud.

Usage:
  python add_feu_datastreams.py --base https://TON-URL.railway.app --token <DEVICE_TOKEN>

Le device doit déjà exister (créé depuis l'onglet Devices). Ce script ajoute
les 9 datastreams du feu manquants (feu, pedestrian, compteur_pietons, distance,
temperature, humidity, mode, duree_vert, bouton_pieton) à côté du 'value' par défaut.
Le simulateur passera alors en « Mode FEU INTELLIGENT ».
"""
import argparse
import json
import urllib.request
import urllib.error

# Datastreams du feu (en plus du 'value' créé par défaut à la création du device)
FEU_DATASTREAMS = [
    {"key": "temperature", "unit": "degC", "data_type": "number"},
    {"key": "humidity", "unit": "%", "data_type": "number"},
    {"key": "distance", "unit": "cm", "data_type": "number"},
    {"key": "feu", "unit": "", "data_type": "number"},
    {"key": "pedestrian", "unit": "", "data_type": "number"},
    {"key": "compteur_pietons", "unit": "", "data_type": "number"},
    {"key": "mode", "unit": "", "data_type": "number"},
    {"key": "duree_vert", "unit": "s", "data_type": "number"},
    {"key": "bouton_pieton", "unit": "", "data_type": "number"},
]


def request(base, path, token, data=None, method="GET"):
    url = base.rstrip("/") + path
    headers = {"X-Device-Token": token, "Content-Type": "application/json"}
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode())
        except Exception:
            msg = {"error": str(e)}
        return e.code, msg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, help="URL du backend (ex: https://xxx.railway.app)")
    ap.add_argument("--token", required=True, help="Token du device existant")
    args = ap.parse_args()

    # 1) Récupère l'état actuel du device + ses datastreams
    status, latest = request(args.base, "/api/devices/" + args.token + "/latest", args.token)
    if status != 200:
        print(f"✗ Impossible de lire le device (HTTP {status}) : {latest}")
        return
    existing = {s["key"]: s for s in latest.get("datastreams", [])}
    device_id = latest.get("device", {}).get("id")
    print(f"✓ Device id={device_id} — datastreams existants : {sorted(existing)}")

    # 2) Ajoute les datastreams du feu manquants
    added, skipped = [], []
    for ds in FEU_DATASTREAMS:
        if ds["key"] in existing:
            skipped.append(ds["key"])
            continue
        st, resp = request(
            args.base,
            f"/api/devices/{device_id}/datastreams",
            args.token,
            {"key": ds["key"], "unit": ds["unit"], "data_type": ds["data_type"]},
            method="POST",
        )
        if st in (200, 201):
            added.append(ds["key"])
        else:
            print(f"  ✗ {ds['key']} non ajouté (HTTP {st}) : {resp}")
    print(f"✓ Ajoutés : {added}")
    print(f"  Déjà présents : {skipped}")

    # 3) Vérifie que 'distance' + 'feu' sont là (déclenche le mode feu)
    status, latest = request(args.base, "/api/devices/" + args.token + "/latest", args.token)
    keys = {s["key"] for s in latest.get("datastreams", [])}
    if "distance" in keys and "feu" in keys:
        print("\n✅ Device prêt pour le « Mode FEU INTELLIGENT ».")
        print("   Relance le simulateur avec CE token :")
        print(f'   python send_data.py --token {args.token} --seuil 200 --base {args.base}')
    else:
        print("\n⚠️ Il manque encore 'distance' ou 'feu' — vérifie les erreurs ci-dessus.")


if __name__ == "__main__":
    main()
