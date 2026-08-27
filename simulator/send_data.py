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
    sous le seuil, le feu passe alors VERT -> ORANGE (3 s) -> ROUGE le temps
    de la traversée du piéton -> VERT. Le device envoie :
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
import socket
import subprocess
import sys
import tempfile
import time
import http.client
import urllib.error
import urllib.parse
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
# Seuil de détection piéton (cm). Aligné sur le reste du système (page
# Paramètres, feu.jsx -> SEUIL_DEFAUT = 80) : la route libre simulée vagabonde
# entre 120 et 220 cm, donc un seuil à 200 cm ferait passer la route libre
# AU-DESSUS et EN-DESSOUS du seuil en permanence -> sur-comptage des passages.
# À 80 cm : route libre (>=120) jamais détectée, piéton (20-70) toujours.
SEUIL_DEFAULT = 80  # cm : un HC-SR04 voit un piéton approcher à < 80 cm

# États du feu (lampes des voitures)
FEU_VERT, FEU_ORANGE, FEU_ROUGE, FEU_MAINT = 0, 1, 2, 3
NOMS_FEU = {FEU_VERT: "VERT", FEU_ORANGE: "ORANGE", FEU_ROUGE: "ROUGE", FEU_MAINT: "MAINTENANCE"}

# Modes de commande du système (boutons du tableau de bord)
NOMS_MODE = {0: "AUTO", 1: "VERT FORCE", 2: "ROUGE FORCE", 3: "MAINTENANCE"}


# Forcer l'IPv4 et allonger le timeout du handshake TLS.
#
# Problème observé sur Windows : urllib (OpenSSL) tente parfois l'IPv6 en
# premier ; si la pile IPv4/IPv6 de la machine ne répond pas, le handshake TLS
# « timed out » alors que curl/Schannel réussit. On force donc la résolution en
# IPv4 pour la socket, tout en GARDANT le nom d'hôte d'origine pour le SNI et
# l'en-tête Host → le certificat TLS est toujours validé (pas d'insecure skip).
# Le timeout de 5 s ne concernait que la lecture ; on le monte à 15 s pour
# laisser le handshake s'achever sur un réseau lent / distant (Railway).
_REQUEST_TIMEOUT = 15  # s : assez large pour un TLS de bout en bout (était 5)


class _IPv4HTTPSConnection(http.client.HTTPSConnection):
    """HTTPSConnection qui résout l'hôte en IPv4 uniquement (évite une
    tentative IPv6 bloquante sur certaines piles Windows), tout en conservant
    le nom d'hôte d'origine pour l'en-tête Host et le SNI (certificat validé)."""

    def connect(self):
        # Résolution IPv4 explicite, puis connexion TCP vers l'IP.
        addrs = socket.getaddrinfo(
            self.host, self.port, socket.AF_INET, socket.SOCK_STREAM
        )
        (family, _type, _proto, _canon, sockaddr) = addrs[0]
        self.sock = socket.socket(family, _type, _proto)
        if self.timeout is not socket._GLOBAL_DEFAULT_TIMEOUT:
            self.sock.settimeout(self.timeout)
        self.sock.connect(sockaddr)
        # Enveloppe TLS en conservant le nom d'hôte pour le SNI + validation.
        self.sock = self._context.wrap_socket(self.sock, server_hostname=self.host)


class _IPv4HTTPSHandler(urllib.request.HTTPSHandler):
    """Handler HTTPS qui ouvre des connexions IPv4 (SNI/Host préservés)."""

    def https_open(self, req):
        return self.do_open(_IPv4HTTPSConnection, req)


# Opener réutilisé (une seule instance) : HTTPS en IPv4 + fallback HTTP natif.
_opener = urllib.request.build_opener(_IPv4HTTPSHandler)


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
    # Pour https on passe par l'opener IPv4 ; pour http on laisse urllib natif.
    use_ipv4 = urllib.parse.urlparse(base).scheme == "https"
    opener = _opener if use_ipv4 else urllib.request.build_opener()
    with opener.open(req, timeout=_REQUEST_TIMEOUT) as resp:
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
        VERT --piéton--> ORANGE (3 s) --→ ROUGE (le temps de traversée) --→ VERT
    """

    DUREE_ORANGE = 3.0    # s : ambre — les voitures s'apprêtent à s'arrêter (standard FR)
    ROUGE_MIN = 2.0       # s : rouge minimal = plancher de sécurité (borné par la commande)
    ROUGE_MAX = 60.0      # s : rouge maximal (borne de sécurité haute)
    # Borne de sécurité indépendante du réglage : même SANS piéton, le feu ne
    # reste jamais plus de VERT_MAX_DEFAUT au vert (il boucle périodiquement,
    # comme un vrai feu de carrefour). On laisse 10 s de marge au-dessus de la
    # durée commandée, jamais 20 min — voir _vert_max().
    VERT_MAX_DEFAUT = 30.0  # s : borne absolue du vert même sans piéton
    DUREE_VERT_DEFAUT = 5.0  # s : durée du vert (commandée depuis la plateforme)
    ROUTE_DEGAGEE = (120.0, 220.0)  # cm : route libre, dans la portée fiable du HC-SR04 (≤250 cm)
    PIETON_DIST = (20.0, 70.0)      # cm : piéton devant le capteur
    PIETON_DUREE = (4.0, 8.0)       # s : temps de traversée REALISTE du piéton
    PROCHAIN_PIETON = (12.0, 20.0)  # s de vert calme avant le piéton suivant

    def __init__(self, seuil=SEUIL_DEFAULT, compteur_init=0):
        self.seuil = seuil
        self.duree_vert = 5.0      # s : durée du vert (commandée depuis la plateforme)
        self.duree_orange = 3.0    # s : durée de l'ambre (commandée depuis la plateforme)
        self.duree_rouge = 8.0     # s : durée du rouge (commandée depuis la plateforme)
        self.mode = 0              # 0 auto · 1 vert forcé · 2 rouge forcé · 3 maintenance
        self._distance = random.uniform(*self.ROUTE_DEGAGEE)
        self._ped_until = 0.0      # fin de la présence du piéton (time.monotonic)
        self._next_ped = self._now() + random.uniform(*self.PROCHAIN_PIETON)
        self._feu = FEU_VERT
        self._phase_until = 0.0    # instant de fin de la phase ORANGE / ROUGE en cours
        self._cycle_start = self._now()   # début du vert en cours
        self._appui = False        # demande de passage en attente (consommée à la fin du rouge)
        self._bouton_prec = 0      # valeur précédente du bouton (détection de front montant)
        self._compteur = int(compteur_init)  # repris depuis le backend (sinon 0)
        self._ped_prec = 0         # valeur précédente du piéton (détection de front)
        self._raz_guard = False    # garde à un coup après un RAZ compteur (supprime 1 front)
        self._cause = 0            # cause du déclenchement : 0 = capteur (ultrason),
                                    # 1 = bouton « Demander passage piéton ». Envoyée
                                    # dans le datastream 'cause' à chaque cycle.

    @staticmethod
    def _now():
        return time.monotonic()

    def _vert_max(self):
        """Borne de sécurité du vert : durée commandée + 10 s de marge, plafonnée
        à VERT_MAX_DEFAUT. Le réglage de l'utilisateur reste prioritaire tant
        qu'une demande arrive avant la borne."""
        return min(self.duree_vert + 10.0, self.VERT_MAX_DEFAUT)

    def appliquer_commandes(self, duree_vert, mode, bouton_pieton, reset_compteur=False,
                             duree_orange=None, duree_rouge=None):
        """Applique les commandes lues sur /latest (tableau de bord).

        Les durées (VERT / ORANGE / ROUGE) sont réglables finement depuis la
        page « Paramètres » du site : on les borne pour rester réaliste et
        éviter un feu bloqué. Elles persistent en base (device_commands) donc
        survivent à un redémarrage du simulateur.
        """
        if duree_vert is not None and 1 <= duree_vert <= 60:
            self.duree_vert = duree_vert
        if duree_orange is not None and 1 <= duree_orange <= 10:
            self.duree_orange = duree_orange
        if duree_rouge is not None and 2 <= duree_rouge <= 60:
            self.duree_rouge = duree_rouge
        if mode in (0, 1, 2, 3):
            # Sortie de MAINTENANCE (3 -> autre) : le feu doit repartir du VERT.
            # Sinon _feu reste bloqué en état 3, que la machine à états AUTO ne
            # gère pas → le feu resterait figé en MAINTENANCE pour toujours.
            if self.mode == 3 and mode != 3:
                self._feu = FEU_VERT
                self._cycle_start = self._now()
                self._phase_until = 0.0
            self.mode = mode
        # Bouton « Piéton » : un front montant (0 -> 1) déclenche UNE
        # demande de passage (mémorisée jusqu'à la fin du rouge). La commande
        # 'bouton_pieton' est une IMPULSION : le backend la SUPPRIME après
        # lecture (acquittement), donc aux cycles suivants /latest renvoie
        # None. On le traite comme un 0 (pas d'appui), sinon _bouton_prec
        # resterait à None et le test `== 0` échouerait pour TOUTES les
        # presses suivantes → cause coincée à 0 (« Distance critique »).
        bouton = bouton_pieton if bouton_pieton is not None else 0
        if bouton == 1 and self._bouton_prec == 0:
            self._appui = True
            self._cause = 1  # déclenchement par le bouton (et non le capteur)
        self._bouton_prec = bouton
        if reset_compteur:
            # Impulsion « Remise à zéro » du compteur de passages piétons,
            # envoyée par la plateforme (« Remettre à 0 » de la page Cycles).
            # Le compteur vit ici (pas en base), donc on le zéro en mémoire.
            # On active un garde à un coup qui supprime le front montant
            # immédiatement suivant le RAZ : ainsi le compteur retombe à 0 et
            # seuls les NOUVEAUX passages (après une absence) sont recomptés.
            self._compteur = 0
            self._raz_guard = True
            self._appui = False

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
        """Machine à états d'un feu tricolore ÉQUILIBRÉ.

        VERT   — les voitures passent pendant `duree_vert` (min garantie). Dès
                 qu'une demande existe APRÈS ce délai, ou que la borne de
                 sécurité `_vert_max()` est atteinte, on passe à l'ORANGE.
        ORANGE — `duree_orange` s (ambre, fixe).
        ROUGE  — `duree_rouge` s, fixée UNE FOIS à l'entrée en rouge. Le feu
                 repasse au VERT à cet instant, sans regarder la distance (qui
                 fluctue) → pas de décalage vert/rouge.

        Mode 1 = VERT forcé (le piéton attend) ; Mode 2 = ROUGE forcé ;
        Mode 3 = MAINTENANCE : feu figé en état 3, circulation coupée.
        """
        now = self._now()
        if self.mode == 3:  # MAINTENANCE : feu figé en état 3 (clignote côté UI)
            self._feu = FEU_MAINT
        elif self.mode == 1:  # VERT forcé : le piéton attend
            self._feu = FEU_VERT
        elif self.mode == 2:  # ROUGE forcé : le piéton traverse
            self._feu = FEU_ROUGE
        elif self._feu == FEU_VERT:
            elapsed = now - self._cycle_start
            # On coupe le vert dès qu'une demande existe après la durée minimale
            # garantie, OU à la borne de sécurité (feu qui boucle sans piéton).
            # `duree_vert` est la durée CIBLE, pas un « minimum avant de pouvoir
            # couper plus tard » : on n'allonge pas le vert indéfiniment.
            if (demande and elapsed >= self.duree_vert) or elapsed >= self._vert_max():
                self._feu = FEU_ORANGE
                self._phase_until = now + self.duree_orange
        elif self._feu == FEU_ORANGE and now >= self._phase_until:
            # Entrée en rouge : on FIXE la durée maintenant (une seule fois).
            # Elle vaut `duree_rouge` (bornée ROUGE_MIN..ROUGE_MAX) et ne dépend
            # plus de rien ensuite → cycle parfaitement équilibré.
            self._feu = FEU_ROUGE
            self._phase_until = now + self.duree_rouge
        elif self._feu == FEU_ROUGE and now >= self._phase_until:
            # Fin du rouge (durée fixée) : on repasse au vert, cycle propre.
            self._feu = FEU_VERT
            self._cycle_start = now
            self._appui = False  # la demande est consommée (passage effectué)
            self._cause = 0      # un nouveau cycle propre repart sans cause « bouton »
        return self._feu

    def etat(self):
        """Renvoie (distance_cm, pedestrian 0/1, feu 0/1/2/3, compteur)."""
        # En maintenance, la distance est figée et rien n'est compté.
        if self.mode == 3:
            pedestrian = 0
            self._ped_prec = pedestrian
            self._appui = False
            feu = self._mettre_a_jour_feu(False)
            return round(self._distance, 1), pedestrian, feu, self._compteur
        distance = round(self._nouvelle_distance(), 1)
        # Détection avec HYSTÉRÉSIS (bande morte) : on entre en « piéton »
        # sous le seuil, mais on ne « sort » qu'au-dessus de seuil*1.25. Sans
        # ça, le bruit du capteur autour du seuil générerait des allers-retours
        # 0/1 comptés comme autant de passages fantômes.
        if self._ped_prec == 1:
            pedestrian = 1 if distance < self.seuil * 1.25 else 0
        else:
            pedestrian = 1 if distance < self.seuil else 0
        # Comptabilise un passage sur le front montant du piéton (comme le sketch ESP32)
        if pedestrian == 1 and self._ped_prec == 0:
            self._appui = True
            # On ne « rétrograde » pas une cause « bouton » déjà active : si
            # l'utilisateur a cliqué « Demander passage piéton », le passage
            # reste attribué au BOUTON même si le capteur détecte un piéton en
            # même temps (le simulateur génère des piétons en continu). Sinon le
            # cycle serait à tort journalisé « Distance critique ».
            if self._cause != 1:
                self._cause = 0  # déclenchement par le capteur (ultrason), pas le bouton
            if self._raz_guard:
                # On vient de remettre le compteur à 0 : on consomme ce premier
                # front (le piéton déjà présent au RAZ) sans le compter, afin de
                # retomber proprement sur 0 et de ne compter que les NOUVEAUX
                # passages. Le garde est épuisé, les suivants seront comptés.
                self._raz_guard = False
            else:
                self._compteur += 1
                # Dès qu'un piéton est détecté, on ENGAGE une demande de traversée
                # (mémorisée jusqu'à la fin du rouge), comme le contrôleur d'un
                # vrai feu qui « retient » qu'un usager attend — même si la
                # distance fluctue ensuite.
                self._appui = True
        self._ped_prec = pedestrian
        # `self._appui` porte la demande (piéton OU bouton) ; la machine à états
        # la consomme à la fin du rouge. On la passe telle quelle (pas de reset
        # ici : sinon un bouton maintenu serait perdu avant le rouge).
        feu = self._mettre_a_jour_feu(bool(pedestrian) or self._appui)
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
        print("Le feu passe VERT → ORANGE (3 s) → ROUGE (le temps de traversée) → VERT.")
        print("Commandes lues chaque seconde depuis la plateforme : durée du vert, mode, bouton Piéton.")
    else:
        interval = args.interval if args.interval is not None else 3.0
        scenario = None
        print("Mode CAPTEURS générique (valeurs aléatoires 0-100).")

    print(f"Envoi toutes les {interval:g}s — Ctrl+C pour arrêter.\n")

    try:
        while True:
            if feu_mode:
                # Lit les commandes du tableau de bord (durée du vert, mode, bouton Piéton, RAZ compteur)
                duree, mode, bouton, raz = None, None, None, False
                try:
                    _, latest = request(args.base, "/api/devices/" + args.token + "/latest", token=args.token)
                    cmd = {s["key"]: s["value"] for s in latest.get("datastreams", [])}
                    duree = float(cmd["duree_vert"]) if cmd.get("duree_vert") is not None else None
                    dOrange = float(cmd["duree_orange"]) if cmd.get("duree_orange") is not None else None
                    dRouge = float(cmd["duree_rouge"]) if cmd.get("duree_rouge") is not None else None
                    mode = int(cmd["mode"]) if cmd.get("mode") is not None else None
                    bouton = int(cmd["bouton_pieton"]) if cmd.get("bouton_pieton") is not None else None
                    # RAZ compteur : impulsion -1 sur 'compteur_pietons' (consommée côté plateforme)
                    raz = cmd.get("compteur_pietons") == -1
                except Exception:
                    pass  # backend indisponible ponctuellement -> valeurs courantes conservées
                scenario.appliquer_commandes(duree, mode, bouton, reset_compteur=raz,
                                             duree_orange=dOrange, duree_rouge=dRouge)

                distance, pedestrian, feu, compteur = scenario.etat()
                # 'cause' est envoyé AVANT 'feu' : au moment où le backend journalise
                # le changement d'état (sur la réception de 'feu'), la dernière valeur
                # de 'cause' est déjà en base → la cause réelle est bien enregistrée
                # (sinon on retomberait sur la valeur par défaut 0).
                # NB : 'cause' est envoyé INCONDITIONNELLEMENT (hors garde `if key in
                # keys`) : s'il n'existait pas au démarrage (device créé manuellement
                # sans ce datastream), le backend l'auto-crée à la première réception.
                # Sinon le frontend n'aurait jamais byKey.cause → causeVal = undefined
                # → le badge tomberait TOUJOURS sur « Distance critique ».
                for key, value in (("distance", distance), ("pedestrian", pedestrian), ("cause", scenario._cause), ("feu", feu), ("compteur_pietons", compteur)):
                    if key != "cause" and key not in keys:
                        continue
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


def _pid_vivant(pid):
    """Renvoie True si le processus `pid` existe réellement.

    Sur Windows on interroge tasklist (kill -0 n'existe pas) ; sur Unix on
    utilise os.kill(pid, 0) qui ne tue rien mais lève ProcessLookupError si
    le PID est inconnu. En cas de doute (outil indispo) on considère le PID
    vivant pour rester prudent et ne pas écraser un vrai verrou."""
    if pid <= 0:
        return False
    if os.name == "nt":
        try:
            sortie = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}"],
                capture_output=True, text=True, timeout=5,
            ).stdout
            # tasklist liste le PID dans sa sortie uniquement s'il existe.
            return f" {pid}\n" in sortie or f" {pid}\r\n" in sortie
        except Exception:
            return True
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except Exception:
        return True


def make_lock(token):
    """Verrou sur le token : empêche 2 instances du même device de tourner
    en parallèle (sinon chaque instance a son propre compteur et les valeurs
    s'écrasent mutuellement → compteur qui saute côté site).

    Le verrou stocke le PID du propriétaire. Au démarrage, si un fichier
    existe déjà on vérifie que le PID qu'il annonce est RÉELLEMENT vivant :
    si non (PC éteint brutalement, crash sans Ctrl+C…), le verrou est un
    « fantôme » → on l'écrase et on continue. Sinon on refuse le lancement."""
    d = tempfile.gettempdir()
    path = os.path.join(d, "yousis_sim_" + token + ".lock")

    # Verrou préexistant : on vérifie si le PID annoncé est encore vivant.
    if os.path.exists(path):
        ancien_pid = None
        try:
            ancien_pid = int(open(path, "r").read().strip() or "0")
        except (ValueError, OSError):
            ancien_pid = None
        if ancien_pid is None or not _pid_vivant(ancien_pid):
            # Fantôme : on le supprime et on prend la main.
            try:
                os.remove(path)
            except OSError:
                pass
        else:
            print(f"✗ Une autre instance tourne déjà pour ce token ({token[:8]}…) "
                  f"[PID {ancien_pid}].")
            print("  Arrêtez-la (Ctrl+C) avant d'en relancer une.  → Arrêt.")
            sys.exit(1)

    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        # Course entre la vérif et l'ouverture (très rare) : on ré-évalue.
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
                val = int(float(s["value"]))
                # Une valeur négative (impulsion de RAZ -1 encore en attente)
                # n'est pas un comptage valide : on l'ignore et on repart de 0.
                return val if val >= 0 else 0
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    main()
