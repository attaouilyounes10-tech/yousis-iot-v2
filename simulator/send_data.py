#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YOUXIS IOT — Simulateur de capteurs
====================================
Envoie de fausses données vers l'API toutes les N secondes, exactement comme
le ferait un vrai ESP32. Aucune dépendance (bibliothèque standard uniquement).

Usage :
    python send_data.py --token <token_du_device> --interval 3
    python send_data.py --token <token_device_feu> --seuil 80    # mode "feu"

Deux modes, détectés automatiquement au démarrage :
  * mode "capteurs" (défaut) : valeurs aléatoires 0-100 pour chaque datastream.
  * mode "feu" : si le device possède les datastreams "distance" ET "feu".
    On simule un piéton qui s'approche du capteur HC-SR04 : la distance chute
    sous le seuil, le feu passe alors VERT -> ORANGE (2 s) -> ROUGE (6 s)
    -> VERT pendant que le piéton traverse. Le device envoie :
      - distance   (cm)
      - pedestrian (0 = personne, 1 = piéton détecté)
      - feu        (0 = vert, 1 = orange, 2 = rouge)  → feu des voitures

Commandes lues chaque seconde via GET /latest (envoyées depuis l'onglet
« Tableau de bord » de la plateforme) :
  - duree_vert    (s) : durée minimale du vert avant un passage piéton (déf. 5)
  - mode          0 = auto · 1 = vert forcé · 2 = rouge forcé (déf. 0)
  - bouton_pieton impulsion 1 pour déclencher un passage à la demande

Le token se copie dans l'interface YOUXIS IOT (page Devices → le code affiché).
"""

import argparse
import atexit
import json
import os
import random
import sys
import tempfile
import time
import urllib.error
import urllib.request

# Sur Windows, la console par défaut (cp1252) refuse les caractères UTF-8
# (✓, ✗, ·, →…) et lève UnicodeEncodeError. On force UTF-8 sur stdout/stderr
# pour que le simulateur s'affiche correctement quel que soit l'OS.
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

DEFAULT_BASE = "http://localhost:3001"
SEUIL_DEFAULT = 80  # cm

# États du feu (lampes des voitures)
FEU_VERT, FEU_ORANGE, FEU_ROUGE, FEU_MAINT = 0, 1, 2, 3
NOMS_FEU = {FEU_VERT: "VERT", FEU_ORANGE: "ORANGE", FEU_ROUGE: "ROUGE", FEU_MAINT: "MAINTENANCE"}

# Modes de commande du système (boutons du tableau de bord)
NOMS_MODE = {0: "AUTO", 1: "VERT FORCE", 2: "ROUGE FORCE", 3: "MAINTENANCE"}


def request(base, path, token=None, body=None):
    """Fait une requête HTTP et renvoie (status, payload dict)."""
    headers = {}
    data = None
    if token:
        headers["X-Device-Token"] = token
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=5) as resp:
        raw = resp.read().decode() or "{}"
        return resp.status, json.loads(raw)


def random_value_for(key, data_type):
    """Génère une valeur plausible (générique) pour un datastream."""
    if data_type == "boolean":
        return random.randint(0, 1)
    return round(random.uniform(0.0, 100.0), 1)


class FeuScenario:
    """Simule un passage piéton et la logique du feu tricolore (côté device).

    C'est exactement ce que ferait un vrai ESP32 branché au HC-SR04 :
    on mesure la distance, on détecte le piéton (distance < seuil) et on
    pilote le feu avec une petite machine à états :
        VERT --piéton--> ORANGE (3 s) --→ ROUGE (10 s) --→ VERT
    """

    DUREE_ORANGE = 3.0    # s : les voitures s'apprêtent à s'arrêter
    DUREE_ROUGE = 10.0    # s : le piéton traverse (durée lisible pour la démo)
    DUREE_PIETON = 4.0    # s : temps de traversée du piéton (feu rouge pour voitures)
    ROUTE_DEGAGEE = (140.0, 400.0)  # cm : route libre (pas de piéton)
    PIETON_DIST = (20.0, 70.0)      # cm : piéton devant le capteur
    PIETON_DUREE = (12.0, 18.0)    # s : présence du piéton (reste détecté le temps de traverser)
    PROCHAIN_PIETON = (45.0, 75.0)  # s de vert calme avant le piéton suivant (cycles bien espacés)

    def __init__(self, seuil=SEUIL_DEFAULT, compteur_init=0):
        self.seuil = seuil
        self.duree_vert = 5.0      # s : durée minimale du vert (commandée depuis la plateforme)
        self.mode = 0              # 0 auto · 1 vert forcé · 2 rouge forcé · 3 maintenance
        self._distance = random.uniform(*self.ROUTE_DEGAGEE)
        self._ped_until = 0.0      # fin de la présence du piéton (time.monotonic)
        self._next_ped = self._now() + random.uniform(*self.PROCHAIN_PIETON)
        self._feu = FEU_VERT
        self._phase_until = 0.0    # fin de la phase ORANGE / ROUGE
        self._cycle_start = self._now()   # début du vert en cours
        self._pending = False      # un passage a été demandé (piéton ou bouton)
        self._appui = False        # impulsion du bouton « Piéton » en attente
        self._bouton_prec = 0      # valeur précédente du bouton (détection de front)
        self._compteur = int(compteur_init)  # repris depuis le backend (sinon 0)
        self._ped_prec = 0         # valeur précédente du piéton (détection de front)

    @staticmethod
    def _now():
        return time.monotonic()

    def appliquer_commandes(self, duree_vert, mode, bouton_pieton):
        """Applique les commandes lues sur /latest (tableau de bord)."""
        if duree_vert is not None and 1 <= duree_vert <= 60:
            self.duree_vert = duree_vert
        if mode in (0, 1, 2, 3):
            self.mode = mode
        if bouton_pieton is not None:
            # Front montant (0 -> 1) = une demande de passage à la demande
            if bouton_pieton == 1 and self._bouton_prec != 1:
                self._appui = True
            self._bouton_prec = bouton_pieton

    def _nouvelle_distance(self):
        """La distance évolue doucement vers sa cible (aller-retour d'un piéton)."""
        now = self._now()
        # Un piéton commence à s'approcher ?
        if now >= self._next_ped and now >= self._ped_until:
            self._ped_until = now + random.uniform(*self.PIETON_DUREE)
            self._next_ped = now + random.uniform(*self.PROCHAIN_PIETON)
        cible = (
            random.uniform(*self.PIETON_DIST)
            if now < self._ped_until
            else random.uniform(*self.ROUTE_DEGAGEE)
        )
        self._distance += (cible - self._distance) * 0.4
        return max(5.0, self._distance)

    def _mettre_a_jour_feu(self, demande):
        """Machine à états : durée minimale de vert, mode auto/forcé, bouton piéton.

        Le bouton piéton (ou un piéton auto détecté) agit IMMÉDIATEMENT quand le
        feu est vert : il interrompt le vert sans attendre la durée minimale, pour
        que l'action de l'utilisateur soit visible tout de suite. Le vert minimal
        ne s'applique qu'au déclenchement automatique (le feu ne passe pas orange
        tout seul trop tôt).

        Mode 3 = MAINTENANCE : le feu se fige en état 3 (clignote orange côté
        interface), la circulation est coupée, aucun passage n'est compté.
        """
        now = self._now()
        if self.mode == 3:  # MAINTENANCE : feu clignotant (état 3)
            self._feu = FEU_MAINT
            self._pending = False
        elif self.mode == 1:  # VERT forcé : le piéton attend
            self._feu = FEU_VERT
            self._cycle_start = now
            self._pending = False
        elif self.mode == 2:  # ROUGE forcé : le piéton traverse
            self._feu = FEU_ROUGE
            self._cycle_start = now
            self._pending = False
        elif self._feu == FEU_VERT:
            if demande:
                # Demande (piéton détecté OU bouton) : on passe au orange immédiatement.
                # Sans demande, le feu RESTE VERT (comportement d'un vrai feu) :
                # il ne doit jamais cycler tout seul en boucle.
                self._feu = FEU_ORANGE
                self._phase_until = now + self.DUREE_ORANGE
                self._pending = False
        elif self._feu == FEU_ORANGE and now >= self._phase_until:
            self._feu = FEU_ROUGE
            self._phase_until = now + self.DUREE_ROUGE
        elif self._feu == FEU_ROUGE and now >= self._phase_until:
            self._feu = FEU_VERT
            self._cycle_start = now
            self._pending = False
        return self._feu

    def etat(self):
        """Renvoie (distance_cm, pedestrian 0/1, feu 0/1/2/3, compteur)."""
        # En maintenance, la distance est figée et rien n'est compté.
        if self.mode == 3:
            pedestrian = 0
            self._ped_prec = pedestrian
            appui = self._appui
            self._appui = False
            feu = self._mettre_a_jour_feu(False)
            return round(self._distance, 1), pedestrian, feu, self._compteur
        distance = round(self._nouvelle_distance(), 1)
        pedestrian = 1 if distance < self.seuil else 0
        # Comptabilise un passage sur le front montant du piéton (comme le sketch ESP32)
        if pedestrian == 1 and self._ped_prec == 0:
            self._compteur += 1
        self._ped_prec = pedestrian
        appui = self._appui
        self._appui = False
        feu = self._mettre_a_jour_feu(bool(pedestrian) or appui)
        return distance, pedestrian, feu, self._compteur


def envoyer(base, token, key, value):
    """POST /api/data ; renvoie True si OK, sinon affiche l'erreur en silence."""
    try:
        request(base, "/api/data", token=token, body={"key": key, "value": value})
        return True
    except urllib.error.HTTPError as e:
        print(f"      ✗ {key} → HTTP {e.code}")
        return False
    except Exception as e:
        print(f"      ✗ {key} → {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Simulateur de capteurs YOUXIS IOT")
    parser.add_argument("--token", required=True, help="Token du device (copié dans l'interface)")
    parser.add_argument("--interval", type=float, default=None,
                        help="Secondes entre deux envois (défaut 3 ; 1 en mode feu)")
    parser.add_argument("--base", default=DEFAULT_BASE, help=f"URL du backend (défaut {DEFAULT_BASE})")
    parser.add_argument("--seuil", type=float, default=SEUIL_DEFAULT,
                        help=f"Seuil de détection piéton en cm (mode feu, défaut {SEUIL_DEFAULT})")
    args = parser.parse_args()

    # Verrou : une seule instance par token (sinon 2 compteurs indépendants
    # s'écrivent par-dessus → le compteur « saute » et diverge du site).
    make_lock(args.token)

    print(f"YOUXIS IOT simulateur — backend : {args.base}")
    print("Découverte des datastreams du device…")

    try:
        _, data = request(args.base, "/api/devices/" + args.token + "/latest", token=args.token)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"✗ Device introuvable. Vérifie le token : {args.token}")
        else:
            print(f"✗ Erreur {e.code} — le backend tourne-t-il bien sur {args.base} ?")
        return
    except Exception as e:
        print(f"✗ Serveur injoignable ({e}) — le backend est-il lancé ?")
        return

    streams = data.get("datastreams", [])
    if not streams:
        print("✗ Ce device n'a aucun datastream. Ajoute-en un (page Détail du device).")
        return

    keys = {s["key"] for s in streams}
    feu_mode = "distance" in keys and "feu" in keys

    print(f"✓ Device « {data['device']['name']} » — {len(streams)} datastream(s) détecté(s) :")
    for s in streams:
        print(f"    - {s['key']}  (type: {s['data_type']})")

    if feu_mode:
        interval = args.interval if args.interval is not None else 1.0
        compteur_init = lire_compteur(args.base, args.token)
        scenario = FeuScenario(seuil=args.seuil, compteur_init=compteur_init)
        print(f"Mode FEU INTELLIGENT — seuil de détection : {scenario.seuil:g} cm · compteur repris à {scenario._compteur}")
        print("Le feu passe VERT → ORANGE (3 s) → ROUGE (10 s) quand un piéton s'approche.")
        print("Commandes lues chaque seconde depuis la plateforme : durée du vert, mode, bouton Piéton.")
    else:
        interval = args.interval if args.interval is not None else 3.0
        scenario = None
        print("Mode CAPTEURS générique (valeurs aléatoires 0-100).")

    print(f"Envoi toutes les {interval:g}s — Ctrl+C pour arrêter.\n")

    try:
        while True:
            if feu_mode:
                # Lit les commandes du tableau de bord (durée du vert, mode, bouton Piéton)
                duree, mode, bouton = None, None, None
                try:
                    _, latest = request(args.base, "/api/devices/" + args.token + "/latest", token=args.token)
                    cmd = {s["key"]: s["value"] for s in latest.get("datastreams", [])}
                    duree = float(cmd["duree_vert"]) if cmd.get("duree_vert") is not None else None
                    mode = int(cmd["mode"]) if cmd.get("mode") is not None else None
                    bouton = int(cmd["bouton_pieton"]) if cmd.get("bouton_pieton") is not None else None
                except Exception:
                    pass  # backend indisponible ponctuellement -> valeurs courantes conservées
                scenario.appliquer_commandes(duree, mode, bouton)

                distance, pedestrian, feu, compteur = scenario.etat()
                for key, value in (("distance", distance), ("pedestrian", pedestrian), ("feu", feu), ("compteur_pietons", compteur)):
                    if key in keys:
                        envoyer(args.base, args.token, key, value)
                print(f"[{time.strftime('%H:%M:%S')}] distance={distance} cm · "
                      f"piéton={'OUI ' if pedestrian else 'NON '}· feu={NOMS_FEU[feu]} · "
                      f"passages={compteur} · "
                      f"mode={NOMS_MODE.get(scenario.mode, '?')} (vert {scenario.duree_vert:g} s)")
            else:
                for s in streams:
                    value = random_value_for(s["key"], s["data_type"])
                    try:
                        status, _ = request(args.base, "/api/data", token=args.token,
                                            body={"key": s["key"], "value": value})
                        print(f"[{time.strftime('%H:%M:%S')}] {s['key']} = {value}  → HTTP {status}")
                    except urllib.error.HTTPError as e:
                        detail = e.read().decode()[:120] if e.fp else ''
                        print(f"[{time.strftime('%H:%M:%S')}] ✗ {s['key']} → HTTP {e.code} {detail}")
                    except Exception as e:
                        print(f"[{time.strftime('%H:%M:%S')}] ✗ {s['key']} → {e}")
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\nSimulateur arrêté.")


def make_lock(token):
    """Verrou sur le token : empêche 2 instances du même device de tourner
    en parallèle (sinon chaque instance a son propre compteur et les valeurs
    s'écrasent mutuellement → compteur qui saute côté site)."""
    d = tempfile.gettempdir()
    path = os.path.join(d, "yousis_sim_" + token + ".lock")
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        print(f"✗ Une autre instance tourne déjà pour ce token ({token[:8]}…).")
        print("  Arrêtez-la (Ctrl+C) avant d'en relancer une.  → Arrêt.")
        sys.exit(1)
    os.write(fd, str(os.getpid()).encode())
    os.close(fd)

    def release():
        try:
            os.remove(path)
        except OSError:
            pass

    atexit.register(release)
    return release


def lire_compteur(base, token):
    """Reprend le compteur déjà comptabilisé côté backend (dernière valeur
    de 'compteur_pietons') pour ne pas repartir de 0 à chaque lancement."""
    try:
        _, latest = request(base, "/api/devices/" + token + "/latest", token=token)
        for s in latest.get("datastreams", []):
            if s["key"] == "compteur_pietons" and s.get("value") is not None:
                return int(float(s["value"]))
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    main()
