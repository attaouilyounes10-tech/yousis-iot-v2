# 🚀 Déploiement sur Railway (site accessible 24/7, même PC éteint)

Ce guide explique comment mettre le site YOUXIS IoT en ligne sur **Railway**,
un hébergeur cloud. Une fois en ligne, le site tourne en permanence sur un
serveur distant : **même si ton PC est éteint, le site reste accessible.**

> 🎓 **Pour la soutenance :** on remplace Ngrok (qui exigeait un PC allumé) par
> un vrai hébergeur. Le reste du code ne change pas : seul l'ESP32/simulateur
> pointe vers la nouvelle adresse internet.

---

## 📋 Prérequis (déjà faits)

- ✅ Le code est sur GitHub : `https://github.com/attaouilyounes10-tech/yousis-iot-v2`
- ✅ Le fichier `railway.json` est à la racine (il dit à Railway comment build et lancer le site)
- ⏳ Un compte Railway (gratuit, carte bancaire demandée mais crédit offert)

---

## 🪜 Étape 1 — Créer un compte Railway

1. Va sur **https://railway.app**
2. Clique **« Login »** → choisis **« Login with GitHub »**
3. Autorise Railway à accéder à ton compte GitHub (case à cocher → Authorize)
4. Railway demande une carte bancaire. **C'est normal** (anti-fraude). Un **crédit
   gratuit** est offert — le déploiement de démo ne coûte rien si tu supprimes le
   projet après la soutenance.

---

## 🪜 Étape 2 — Créer le projet depuis GitHub

1. Sur le tableau de bord Railway, clique **« New Project »**
2. Choisis **« Deploy from GitHub repo »**
3. Sélectionne le dépôt **`yousis-iot-v2`**
4. Railway lit automatiquement le fichier `railway.json` et lance :
   - le **build** (installation des dépendances + compilation du frontend)
   - le **démarrage** (`node src/server.js`)

⏳ Le 1ᵉʳ déploiement prend **2 à 4 minutes** (installation de Node, npm, build React).
Un journal (logs) défile en direct. Attends « Deployment succeeded ».

---

## 🪜 Étape 3 — Régler les variables (important)

Le site a besoin d'une **clé secrète** pour les comptes. Sans ça, les inscriptions
peuvent échouer.

1. Dans le projet Railway, onglet **« Variables »** (ou « Settings » → Variables)
2. Clique **« New Variable »**
3. Ajoute :
   - **Name** : `JWT_SECRET`
   - **Value** : une phrase au hasard, ex. `yousis-soutenance-2026-secret`
4. **Add** → Railway redémarre automatiquement le site.

> 💡 Pas besoin de régler `PORT` : Railway le met tout seul.

---

## 🪜 Étape 4 — Récupérer l'adresse publique

1. Onglet **« Settings »** du service
2. Section **« Networking »** → clique **« Generate Domain »** (ou « Public Domain »)
3. Railway donne une adresse du type :
   ```
   https://yousis-iot-v2-production.up.railway.app
   ```
   👉 **C'est l'adresse de ton site**, valable 24/7. Ouvre-la dans un navigateur :
   tu dois voir la page de connexion YOUXIS.

---

## 🪜 Étape 5 — Pointer l'ESP32 / le simulateur dessus

Le boîtier (ou le simulateur Python) doit maintenant envoyer ses données à
**cette adresse internet** au lieu de `localhost`.

### Simulateur Python
```bash
cd simulator
python send_data.py --token <TOKEN> --base https://yousis-iot-v2-production.up.railway.app
```

### Vrai ESP32 (`arduino/esp32_youxis_feu.ino`)
Modifie les 2 lignes (sans `https://`, port 443) :
```cpp
const char* BACKEND_HOST = "yousis-iot-v2-production.up.railway.app";
const int   BACKEND_PORT = 443;
```
Puis recompile et uploade le sketch.

---

## ⚠️ Point à connaître pour la soutenance (base de données)

Sur Railway, le disque est **temporaire** : la base SQLite (`backend/data/yousis.db`)
peut être **effacée au redémarrage** du service. Conséquences :
- Les comptes et l'historique des cycles repartent à zéro après un redémarrage.
- **Pour une démo**, ce n'est pas grave : on recrée un compte et on relance le
  simulateur en direct.

**Évolution prévue (si on veut des données persistantes) :**
- Ajouter un **Volume** Railway monté sur `/data`, et régler `DB_PATH=/data/yousis.db`
  dans les Variables → la base survit aux redémarrages.
- Ou migrer vers une base managée (Postgres) — plus robuste, plus coûteux.

> 🗣️ **Phrase à dire au jury :** « Sur le cloud gratuit, notre base est sur un disque
> éphémère. Pour la rendre permanente, on ajoute un Volume — c'est une évolution
> qu'on a prévue. »

---

## 🧹 Pour arrêter (après la soutenance)

Dans Railway → projet → **« Delete Project »**. Comme le crédit est gratuit, tu ne
paieras rien si tu supprimes le projet.

---

## 🆘 Dépannage

| Problème | Solution |
|---|---|
| « Deployment failed » | Onglet **Logs** : cherche une erreur rouge. Souvent `npm install` qui rate → vérifie que le repo GitHub est complet. |
| Page blanche | Le build frontend a peut-être échoué. Relance un déploiement (Redeploy). |
| « Cannot connect » depuis l'ESP32 | Vérifie `BACKEND_HOST` (sans `https://`) et `BACKEND_PORT=443`. |
| Comptes qui disparaissent | Normal (disque éphémère). Recrée un compte et relance le simulateur. |

---

## 🔁 Résumé en une image

```
Avant (Ngrok) :  Boîtier ──▶ TON PC (allumé) ◀── Téléphone
                  ❌ PC éteint = plus rien

Après (Railway) : Boîtier ──▶ SERVEUR CLOUD 24/7 ◀── Téléphone
                   ✅ PC éteint = ça marche quand même
```
