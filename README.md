# 🚦 YOUXIS IOT v2 — Plateforme IoT type « Blynk simplifié »

Plateforme web **locale** pour démontrer les concepts IoT d'un projet académique :
dashboard de widgets, capteurs, contrôle à distance et **temps réel** — le tout sans
matériel grâce à un simulateur Python (ouavec un vrai ESP32 plus tard).

```
ESP32 / simulateur ──POST /api/data (token)──▶ Backend (Node) ──WebSocket──▶ Dashboard React
```

## 🧱 Stack

| Couche | Technologie |
|---|---|
| Frontend | React 19 + Vite + Tailwind CSS v4 + recharts + socket.io-client |
| Backend | Node.js + Express + socket.io |
| Base | SQLite intégré (`node:sqlite`) — **aucune compilation native** |
| Auth | JWT (jsonwebtoken) + bcryptjs (pur JS) |
| Simulateur | Python (bibliothèque standard, zéro `pip install`) |

> ✅ **Aucun outil de compilation n'est nécessaire** : tous les paquets sont en pur JavaScript.

## 📁 Structure

```
yousis-iot-v2/
├── backend/              # API + WebSocket (port 3001)
│   ├── db/schema.sql     # schéma de la base
│   └── src/
│       ├── server.js     # point d'entrée
│       ├── db.js         # connexion SQLite + application du schéma
│       ├── auth.js       # JWT + bcryptjs
│       ├── routes/       # auth, devices, widgets, deviceApi
│       └── sockets/      # temps réel (socket.io)
├── frontend/             # interface React (port 5173 en dev)
│   └── src/              # pages (dont TableauDeBord.jsx), composants, widgets
├── simulator/
│   └── send_data.py      # script de démo sans matériel (mode capteurs ou feu)
└── arduino/
    ├── esp32_yousis_v2.ino  # vrai ESP32 + HC-SR04 (mode générique)
    └── esp32_yousis_feu.ino # vrai ESP32 feu tricolore (Blynk→YOUXIS, avec compteur piétons)
```

## 🚀 Lancement

**Prérequis** : Node.js ≥ 20 (v24 conseillé) et Python 3.

### 1) Backend (API + temps réel) — port 3001

Ouvre un terminal dans le dossier `backend` :

```bash
cd backend
npm install          # première fois uniquement
npm run dev
```

Tu dois voir : `YOUXIS IOT — backend prêt ! http://localhost:3001`

### 2) Frontend (interface) — port 5173

Ouvre un **second** terminal dans le dossier `frontend` :

```bash
cd frontend
npm install          # première fois uniquement
npm run dev
```

Puis ouvre **http://localhost:5173** dans le navigateur.

## 📱 iPhone / autre PC du même réseau local (comme Blynk mobile)

Pour **voir et commander** l'app depuis ton **iPhone** (même WiFi), on passe en mode
production : **un seul serveur, un seul port**.

1. **Construis le frontend une fois** (terminal dans `frontend/`) :
   ```bash
   npm run build
   ```
2. Le backend sert alors l'app sur **http://localhost:3001** (l'app n'est plus sur 5173).
3. Récupère l'**IP du PC** : commande `ipconfig` → adresse IPv4, ex. `192.168.1.42`
   (le backend l'affiche aussi au démarrage : ligne `📱 Réseau local (même WiFi) : …`).
4. Sur l'iPhone : Safari → **http://192.168.1.42:3001** → identifie-toi → dashboard.
   - **1ʳᵉ fois** : Windows demande l'autorisation du **pare-feu** →
     cocher « Réseaux privés » → **Autoriser**.
5. Optionnel : Safari → **Partager → Sur l'écran d'accueil** → l'app s'ouvre en plein
   écran, comme une appli Blynk.

> Le simulateur / l'ESP32 continue de tourner sur le PC et d'envoyer ses données.
> Les **boutons et sliders** du dashboard permettent de **commander** le device depuis le
> téléphone. Le **feu tricolore** est piloté par le device lui-même, mais tu peux le
> **commander** (durée du vert, mode, bouton piéton) depuis l'onglet **🚦 Tableau de bord**.
>
> 💡 Après chaque modification du code frontend, relance `npm run build` pour mettre à jour
> l'app mobile. Pour continuer à développer, tu peux toujours utiliser `npm run dev` (5173).

## 🎬 Démonstration en 4 étapes (sans matériel)

1. **Crée un compte** : `S'inscrire` → `email` + `mot de passe` (6 caractères min).
2. **Crée un device** (page *Devices*) : nom + type, par ex. « Feu intelligent » / « esp32 ».
   - Ouvre le device : tu y vois son **token** (bouton **Copier**) et ses datastreams.
   - Ajoute les datastreams du feu : `distance` (cm), `pedestrian` (0/1), `feu` (0=vert, 1=orange, 2=rouge).
3. **Lance le simulateur** dans un **3ᵉ terminal** :
   ```bash
   cd simulator
   python send_data.py --token <TOKEN_COPIE>
   ```
4. **Retourne sur le dashboard** : clique **« + Ajouter un widget »**,
   choisis le device, son datastream et le type de widget :
   - **Jauge** pour `distance`, **Graphique** pour voir l'historique,
   - **Bouton ON/OFF** ou **Slider** sur un datastream de commande pour piloter le device.

Le dashboard se met à jour **en temps réel** (ouvre la page dans **2 onglets**
pour le prouver). 🎉

## 🚦 Tableau de bord du feu intelligent (le vrai projet du module)

La plateforme peut simuler le **feu tricolore intelligent** (capteur HC-SR04) et le
**commander en temps réel**, comme une appli Blynk :

1. Menu **🚦 Tableau de bord** → bouton **« ⚙️ Créer le device Feu intelligent »**.
   - Il crée le device + ses 6 datastreams : `distance` (cm), `pedestrian` (0/1),
     `feu` (0 = vert, 1 = orange, 2 = rouge) et les **commandes** `duree_vert` (s),
     `mode` (0 auto / 1 vert forcé / 2 rouge forcé) et `bouton_pieton`.
2. Copie le **token** affiché.
3. Lance le simulateur côté feu (3ᵉ terminal) :
   ```bash
   cd simulator
   python send_data.py --token <TOKEN>
   ```
4. Retourne sur **🚦 Tableau de bord** : la page se met à jour **en temps réel**.
   Quand un piéton s'approche (distance < seuil), le feu passe
   **vert → orange (3 s) → rouge (10 s)** pendant que le piéton traverse, puis revient au vert.

La partie feu intelligente est **divisée en 2 pages** (le site remplace à la fois Blynk *et*
ThingSpeak) :

### 🚦 Tableau de bord — supervision & contrôle (style Blynk)
Page **interactive** qui supervise et commande le système en temps réel :
- **Compteur de passages piétons** (🚶) : incrémenté côté device à chaque front montant du
  piéton (broche 14 + ultrason), affiché en temps réel.
- **Graphique** de la distance + **journal d'événements** des détections.
- **Commandes** (sliders/boutons) :
  - **Durée du vert** (slider 1-30 s) : le feu reste vert au moins cette durée avant qu'un
    piéton puisse déclencher l'orange.
  - **Mode système** : Auto · **Vert forcé** (les voitures passent) · **Rouge forcé** (le
    piéton traverse).
  - **Bouton Piéton** : déclenche un passage à la demande (comme un bouton d'appel piéton).

### 📈 Cycles — historique persistant (style ThingSpeak)
Page qui **enregistre en temps réel les cycles du feu** (le rôle de ThingSpeak) :
- **3 compteurs** : passages piétons totaux, cycles enregistrés, état actuel du feu.
- **Graphique** de l'évolution des états (vert / orange / rouge) dans le temps.
- **Journal persistant** de tous les changements d'état (heure · état · piéton · distance),
  fusionnant l'historique sauvegardé en base et les événements WebSocket live.
- Les cycles sont stockés en base (`feu_cycles`) et consultables via l'API
  `GET /api/devices/:id/cycles` (JWT) ou `GET /api/devices/:token/cycles`.

**Logique côté device** : le simulateur (comme un vrai ESP32) mesure la distance, détecte le
piéton, pilote le feu **et lit chaque seconde les commandes** du tableau de bord via
`GET /api/devices/:token/latest`, puis **compte les passages piétons** (front montant) et
envoie `compteur_pietons`. La plateforme affiche, commande et **journalise**, le device décide.

→ avec un vrai ESP32, utilise **`arduino/esp32_yousis_feu.ino`** : il adapte l'ancien sketch
Blynk + ThingSpeak vers YOUXIS. Brochage : ROUGE 25 · ORANGE 26 · VERT 27 · PIET_R 32 ·
PIET_V 33 · BOUTON 14 · TRIG 4 · ECHO 35 · BUZZER 12. Remplis `WIFI_SSID`, `WIFI_PASS`,
`BACKEND_HOST`, `BACKEND_PORT` et `DEVICE_TOKEN`, puis uploade. (L'ancien
`esp32_yousis_v2.ino` — HC-SR04 TRIG 13 / ECHO 12 — reste valable pour le mode générique.)

Paramètres du simulateur : `--seuil 80` (distance de détection en cm), `--interval 1`
(secondes entre deux envois ; le mode feu passe automatiquement à 1 s).

## 🔐 API des appareils (compatible ESP32)

Le simulateur (ou un vrai microcontrôleur) envoie ses données ainsi :

```bash
# Envoyer une valeur
curl -X POST http://localhost:3001/api/data \
     -H "Content-Type: application/json" \
     -H "X-Device-Token: <TOKEN>" \
     -d '{"key":"distance","value":45.2}'

# Dernier état des datastreams
curl http://localhost:3001/api/devices/<TOKEN>/latest

# Historique
curl "http://localhost:3001/api/devices/<TOKEN>/history?key=distance&limit=50"

# Journal persistant des cycles du feu (token device, ex. depuis un ESP32/carte)
curl "http://localhost:3001/api/devices/<TOKEN>/cycles?limit=200"
```

Le device lit les commandes (bouton/slider) dans `/latest` : pour une valeur de
sortie, c'est la dernière commande reçue qui est renvoyée.

L'historique des cycles est aussi accessible côté utilisateur (JWT) :
`GET /api/devices/:id/cycles?limit=500` renvoie tous les changements d'état du feu
(`etat` 0/1/2, `pedestrian`, `distance`, `createdAt`), du plus ancien au plus récent.

## ⚙️ Configuration

- Ports et secret JWT : dans `backend/.env` (copier `.env.example` si besoin).
- Seuils d'alerte (ex. ⚠️ distance < 80) : page **Détail du device** → champ
  « Alerte si > max » → **Appliquer seuils**. La bannière rouge apparaît sur le dashboard.
- Statut en ligne/hors ligne : un device est « en ligne » s'il a envoyé une donnée
  il y a moins de 15 secondes.

## 🧠 Concept à retenir (pour la soutenance)

- **Auth device ≠ auth utilisateur** : l'utilisateur se connecte avec son JWT ;
  le device s'identifie par son **token unique**. Deux mécanismes séparés.
- **Le serveur décide qui reçoit quoi** : chaque utilisateur est dans sa propre
  « room » WebSocket — impossible de voir les données d'un autre.
- **Statut en ligne calculé** (pas stocké) : « en ligne » = donnée reçue < 15 s.

## 🐛 Dépannage

| Problème | Solution |
|---|---|
| `npm install` lent | Normal la 1ʳᵉ fois ; aucune compilation native requise. |
| Port 3001 déjà utilisé | Change `PORT` dans `backend/.env`. |
| Le simulateur dit « Serveur injoignable » | Le backend tourne-t-il ? (`npm run dev` dans `backend`) |
| « Device introuvable » | Vérifie que tu as copié le bon token. |
| Le dashboard ne se met pas à jour | Recharge la page (F5) ; vérifie que le simulateur tourne. |

## 🌐 Accès depuis l'extérieur (Ngrok — sans GitHub, PC allumé)

Pour que le site soit joignable depuis n'importe où **sans compte GitHub ni
hébergeur**, on utilise **Ngrok** : il crée un tunnel vers ton PC et donne une URL
publique (`https://xxxx.ngrok-free.app`). Le frontend étant servi par le backend
(port 3001), on expose uniquement ce port.

> ⚠️ **Le PC doit rester allumé** et le backend lancé. L'URL (gratuite) change à
> chaque relance de Ngrok — recopie-la. Suffisant pour une démo/soutenance.

### 1) Lancer le site en local (production)
Double-clique sur **`lancer-site.bat`** (à la racine) : il compile le frontend puis
démarre le backend sur `http://localhost:3001`. Laisse cette fenêtre ouverte.
Sinon, à la main :
```bash
cd frontend && npm run build && cd ../backend
node src/server.js
```

### 2) Créer le tunnel Ngrok
1. Télécharge `ngrok` sur [ngrok.com/download](https://ngrok.com/download) (pas
   besoin de GitHub) et décompresse le `.exe`.
2. Dans un **second terminal**, depuis le dossier de `ngrok.exe` :
   ```bash
   ngrok http 3001
   ```
3. Ngrok affiche une URL `https://xxxx.ngrok-free.app` → c'est l'adresse publique
   du site. Partage-la : le dashboard se met à jour en temps réel pour tous.

### 3) Alimenter le site depuis n'importe où
Le simulateur et l'ESP32 envoient leurs données vers l'URL Ngrok :
```bash
cd simulator
python send_data.py --token <TOKEN> --base https://xxxx.ngrok-free.app
```
Le sketch ESP32 (`arduino/esp32_yousis_v2.ino`) utilise `BACKEND_HOST` /
`BACKEND_PORT` → mets l'hôte Ngrok (sans `https://`) et le port `443`.

### 4) Nom de domaine personnalisé (optionnel, plus tard)
Pour `www.youxisiotv2.com` : achète le domaine, puis dans Ngroeb
(**Domains**) ajoute-le. Ngrok gratuit limite les domaines custom — l'option la
plus simple reste d'ajouter `www.youxisiotv2.com` comme CNAME vers ton URL Ngrok.
