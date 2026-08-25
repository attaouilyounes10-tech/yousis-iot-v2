/**
 * ============================================================
 *  YOUXIS IOT v2 — ESP32 « Feu intelligent »
 * ============================================================
 *  Firmware natif YOUXIS : la carte se connecte directement à NOTRE
 *  site web (backend Node + base SQLite), sans aucun service tiers.
 *  Dashboard temps réel (WebSocket) + historique persistant (SQLite).
 *
 *  Cycle du feu (côté device, comme sur le simulateur Python) :
 *    VERT --piéton/bouton--> ORANGE (duree_orange) --> ROUGE (duree_rouge)
 *    --> VERT, et ainsi de suite. Duréescommandées depuis la page
 *    « Paramètres » du site.
 *
 *  Le device :
 *   1) mesure la distance (HC-SR04) -> pedestrian = 1 si < SEUIL
 *   2) comptabilise les passages piétons (front montant + hystérésis)
 *   3) lit chaque seconde les COMMANDES du dashboard (GET /latest) :
 *        duree_vert (s), duree_orange (s), duree_rouge (s),
 *        mode (0 auto / 1 vert forcé / 2 rouge forcé / 3 maintenance),
 *        bouton_pieton (impulsion)
 *   4) pilote le feu tricolore (machine à états)
 *   5) envoie distance, pedestrian, feu, compteur vers l'API YOUXIS
 *      (POST /api/data avec X-Device-Token)
 *
 *  ── À RENSEIGNER dans la section « Configuration » ci-dessous :
 *     1) WIFI_SSID / WIFI_PASS : ton réseau
 *     2) BACKEND_HOST : IP locale de ton PC (ipconfig)  OU  hôte Ngrok
 *        + BACKEND_PORT (3001 en local, 443 si tunnel Ngrok https)
 *     3) DEVICE_TOKEN : copié dans la page Devices de YOUXIS IOT
 *        (crée un device « Feu intelligent » via le bouton du dashboard ;
 *         il faut les datastreams : distance, pedestrian, feu,
 *         duree_vert, duree_orange, duree_rouge, mode,
 *         bouton_pieton, compteur_pietons)
 *
 *  Broches :
 *    Feu voitures : ROUGE 25 · ORANGE 26 · VERT 27
 *    Feu piétons  : ROUGE 32 · VERT 33
 *    Bouton 14 (pull-up) · TRIG 4 · ECHO 35 · BUZZER 12
 * ============================================================
 */
#include <WiFi.h>
#include <HTTPClient.h>

// ======================= CONFIGURATION =======================
const char* WIFI_SSID = "WIN-N9NOB6KGKPH 1870";
const char* WIFI_PASS = "D081@a62";

// En local : IP de ton PC (ipconfig -> IPv4 Wi-Fi) + port 3001
// En tunnel Ngrok : hôte Ngrok SANS https://  + port 443
const char* BACKEND_HOST = "192.168.11.105";
const int   BACKEND_PORT = 3001;

const char* DEVICE_TOKEN = "METTRE_TOKEN_DEVICE_YOUXIS";
// =============================================================

// ----- Broches -----
const int PIN_ROUGE   = 25;
const int PIN_ORANGE  = 26;
const int PIN_VERT    = 27;
const int PIN_PIET_R  = 32;
const int PIN_PIET_V  = 33;
const int PIN_BOUTON  = 14;
const int PIN_TRIG    = 4;
const int PIN_ECHO    = 35;
const int PIN_BUZZER  = 12;

const float SEUIL_DISTANCE = 40.0;           // cm : sous ce seuil -> piéton

const unsigned long WIFI_TIMEOUT = 10000;
const unsigned long COOLDOWN = 5000;         // anti-répétition détection (ms)
const unsigned long INTERVALLE_ENVOI = 1000; // lecture commandes 1x/sec

// Durées de la machine à états (ms) — valeurs par défaut, surchargées
// à distance depuis la page « Paramètres » du site (duree_*/s).
const unsigned long DUREE_VERT_DEF  = 5000;  // vert (>= 5 s)
const unsigned long DUREE_ORANGE_DEF = 3000;  // ambre (3 s)
const unsigned long DUREE_ROUGE_DEF  = 8000; // piéton traverse (≈ 8 s)
const unsigned long DUREE_PIETON_DEF = 4000; // temps de traversée (état PIETON)

// ----- Commandes reçues du dashboard (GET /latest) -----
unsigned long dureeVertCmd  = DUREE_VERT_DEF;   // ms (>= 5 s)
unsigned long dureeOrangeCmd = DUREE_ORANGE_DEF; // ms
unsigned long dureeRougeCmd  = DUREE_ROUGE_DEF;  // ms
int   mode = 0;              // 0 auto · 1 vert forcé · 2 rouge forcé · 3 maintenance
bool  boutonHaut = false;    // impulsion bouton_pieton
bool  boutonPrec = false;    // détection de front

// ----- État local -----
bool wifiOK = false;
bool demandePieton = false;
bool ancienEtatBouton = HIGH;
int  compteurPietons = 0;
int  causeActuelle = 0;          // cause du déclenchement : 0 = capteur (ultrason),
                                 // 1 = bouton (physique ou « Demander passage piéton »)
bool pedestrianActuel = false;   // détection courante (avec hystérésis)
bool pedestrianPrec   = false;   // détection précédente (front montant)
unsigned long derniereDetection = 0;
bool buzzerEtat = false;
unsigned long dernierBip = 0;
unsigned long dernierEnvoi = 0;

enum EtatFeu { ROUGE, VERT, ORANGE, PIETON, MAINTENANCE };
EtatFeu etatActuel = ROUGE;
unsigned long tempsEntree = 0;

// ============================================================
//  WiFi
// ============================================================
void connecterWiFi() {
  Serial.println("Connexion WiFi...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long debut = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - debut < WIFI_TIMEOUT) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    wifiOK = true;
    Serial.println("WiFi connecte");
    Serial.print("Adresse IP : ");
    Serial.println(WiFi.localIP());
  } else {
    wifiOK = false;
    Serial.println("Echec connexion WiFi");
  }
}

// ============================================================
//  Envoi d'une valeur vers l'API YOUXIS (POST /api/data)
// ============================================================
void envoyerYOUXIS(const char* cle, float valeur) {
  if (!wifiOK || WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String("http://") + BACKEND_HOST + ":" + BACKEND_PORT + "/api/data";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  String body = "{\"key\":\"" + String(cle) + "\",\"value\":" + String(valeur, 1) + "}";
  int code = http.POST(body);
  if (code < 200 || code >= 300) {
    Serial.printf("  [YOUXIS] %s -> HTTP %d\n", cle, code);
  }
  http.end();
}

// ============================================================
//  Lecture des commandes du dashboard (GET /api/devices/:token/latest)
// ============================================================
float extraireNombre(const String& json, const String& cle) {
  String motif = "\"key\":\"" + cle + "\"";
  int i = json.indexOf(motif);
  if (i < 0) return -999.0f;
  int j = json.indexOf("\"value\":", i);
  if (j < 0) return -999.0f;
  j += 8;
  while (j < (int)json.length() && (json[j] == ' ' || json[j] == '\t')) j++;
  if (j >= (int)json.length() || json[j] == 'n') return -999.0f; // null
  int k = j;
  while (k < (int)json.length() && ((json[k] >= '0' && json[k] <= '9') || json[k] == '-' || json[k] == '.')) k++;
  return json.substring(j, k).toFloat();
}

void lireCommandesYOUXIS() {
  if (!wifiOK || WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String("http://") + BACKEND_HOST + ":" + BACKEND_PORT
             + "/api/devices/" + DEVICE_TOKEN + "/latest";
  http.begin(url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  int code = http.GET();
  if (code >= 200 && code < 300) {
    String body = http.getString();
    // Durées (secondes -> ms), bornées pour rester réalistes
    float dv = extraireNombre(body, "duree_vert");
    if (dv >= 1 && dv <= 60) dureeVertCmd = (unsigned long)(dv * 1000.0f);
    float do_ = extraireNombre(body, "duree_orange");
    if (do_ >= 1 && do_ <= 10) dureeOrangeCmd = (unsigned long)(do_ * 1000.0f);
    float dr = extraireNombre(body, "duree_rouge");
    if (dr >= 2 && dr <= 60) dureeRougeCmd = (unsigned long)(dr * 1000.0f);
    // Mode système
    float m = extraireNombre(body, "mode");
    if (m >= 0 && m <= 3) mode = (int)m;
    // Bouton piéton (impulsion)
    float bp = extraireNombre(body, "bouton_pieton");
    boutonHaut = (bp == 1);
  }
  http.end();
}

// ============================================================
//  Feux + buzzer
// ============================================================
void eteindreTout() {
  digitalWrite(PIN_ROUGE, LOW);
  digitalWrite(PIN_ORANGE, LOW);
  digitalWrite(PIN_VERT, LOW);
  digitalWrite(PIN_PIET_R, LOW);
  digitalWrite(PIN_PIET_V, LOW);
  noTone(PIN_BUZZER);
}

void entrerDansEtat(EtatFeu nouvelEtat) {
  eteindreTout();
  etatActuel = nouvelEtat;
  tempsEntree = millis();

  String etatTexte;
  int feuCode;       // 0=vert, 1=orange, 2=rouge (convention YOUXIS)
  int pedCode;       // 0/1

  switch (etatActuel) {
    case ROUGE:
      digitalWrite(PIN_ROUGE, HIGH);
      digitalWrite(PIN_PIET_R, HIGH);
      etatTexte = "ROUGE"; feuCode = 2; pedCode = 0;
      break;
    case VERT:
      digitalWrite(PIN_VERT, HIGH);
      digitalWrite(PIN_PIET_R, HIGH);
      etatTexte = "VERT"; feuCode = 0; pedCode = 0;
      break;
    case ORANGE:
      digitalWrite(PIN_ORANGE, HIGH);
      digitalWrite(PIN_PIET_R, HIGH);
      etatTexte = "ORANGE"; feuCode = 1; pedCode = 0;
      break;
    case PIETON:
      digitalWrite(PIN_ROUGE, HIGH);
      digitalWrite(PIN_PIET_V, HIGH);
      etatTexte = "PIETON"; feuCode = 2; pedCode = 1;
      // NB : le comptage des passages se fait sur le FRONT MONTANT de la
      // détection (voir loop()), pas ici — sinon un retour en état PIETON
      // (ex. mode rouge forcé) re-compterait le même passage.
      break;
    case MAINTENANCE:
      // Feu orange clignotant + buzzer (géré par clignoterMaintenance() dans loop)
      etatTexte = "MAINTENANCE"; feuCode = 3; pedCode = 0;
      break;
  }

  Serial.println(etatTexte);

  // Envoi de l'état vers YOUXIS
  envoyerYOUXIS("feu", feuCode);
  envoyerYOUXIS("pedestrian", pedCode);
  envoyerYOUXIS("compteur_pietons", compteurPietons);
  envoyerYOUXIS("cause", causeActuelle);
}

void gererBuzzer() {
  if (etatActuel != PIETON && etatActuel != MAINTENANCE) {
    noTone(PIN_BUZZER);
    buzzerEtat = false;
    return;
  }
  if (millis() - dernierBip >= 300) {
    dernierBip = millis();
    buzzerEtat = !buzzerEtat;
    if (buzzerEtat) tone(PIN_BUZZER, 1000);
    else noTone(PIN_BUZZER);
  }
}

// Feu en maintenance : orange clignotant (non bloquant) + buzzer.
void clignoterMaintenance() {
  static unsigned long dernierClignote = 0;
  static bool orangeOn = false;
  if (millis() - dernierClignote >= 500) {
    dernierClignote = millis();
    orangeOn = !orangeOn;
    if (orangeOn) {
      digitalWrite(PIN_ROUGE, LOW);
      digitalWrite(PIN_VERT, LOW);
      digitalWrite(PIN_ORANGE, HIGH);
    } else {
      digitalWrite(PIN_ORANGE, LOW);
    }
  }
  gererBuzzer();
}

// ============================================================
//  Bouton physique + ultrason
// ============================================================
void lireBouton() {
  bool etat = digitalRead(PIN_BOUTON);
  if (ancienEtatBouton == HIGH && etat == LOW) {
    demandePieton = true;
    causeActuelle = 1;   // déclenchement par le bouton physique
    Serial.println("Demande par Bouton");
  }
  ancienEtatBouton = etat;
}

float lireUltrason() {
  static unsigned long derniereMesure = 0;
  if (millis() - derniereMesure < 300) return -1;
  derniereMesure = millis();

  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  long duree = pulseIn(PIN_ECHO, HIGH, 30000);
  if (duree == 0) return -1;
  return duree * 0.0343 / 2.0;
}

// ============================================================
//  setup / loop
// ============================================================
void setup() {
  Serial.begin(115200);
  pinMode(PIN_ROUGE, OUTPUT);
  pinMode(PIN_ORANGE, OUTPUT);
  pinMode(PIN_VERT, OUTPUT);
  pinMode(PIN_PIET_R, OUTPUT);
  pinMode(PIN_PIET_V, OUTPUT);
  pinMode(PIN_BOUTON, INPUT_PULLUP);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  connecterWiFi();
  entrerDansEtat(ROUGE);
}

void loop() {
  // Reconnexion WiFi si perdu
  if (wifiOK && WiFi.status() != WL_CONNECTED) {
    wifiOK = false;
    connecterWiFi();
  }

  lireBouton();

  float distance = lireUltrason();
  if (distance >= 0) {
    Serial.print("Distance : ");
    Serial.print(distance);
    Serial.println(" cm");
    envoyerYOUXIS("distance", distance);   // historique + graphe

    // Détection piéton avec HYSTÉRÉSIS (bande morte) : on entre en « piéton »
    // sous le seuil, on ne « sort » qu'au-dessus de SEUIL_DISTANCE*1.25. Sans
    // ça, le bruit du capteur autour du seuil générerait des allers-retours
    // 0/1 comptés comme autant de passages fantômes (comme dans le simulateur).
    if (pedestrianPrec) {
      pedestrianActuel = (distance >= 1 && distance < SEUIL_DISTANCE * 1.25);
    } else {
      pedestrianActuel = (distance >= 1 && distance < SEUIL_DISTANCE);
    }

    // FRONT MONTANT (0 -> 1) : un passage piéton est compté UNE SEULE FOIS,
    // avec un COOLDOWN anti-répétition (filtre le bruit du capteur). Le
    // compteur est incrémenté puis envoyé immédiatement vers YOUXIS.
    if (pedestrianActuel && !pedestrianPrec) {
      if (millis() - derniereDetection >= COOLDOWN) {
        derniereDetection = millis();
        compteurPietons++;
        envoyerYOUXIS("compteur_pietons", compteurPietons);
        Serial.println("Passage pieton comptabilise (ultrason)");
      }
      demandePieton = true;   // déclenche la traversée (pilote le feu)
      // On ne « rétrograde » pas une cause « bouton » déjà active : si
      // l'utilisateur a cliqué « Demander passage piéton » (causeActuelle = 1),
      // le passage reste attribué au BOUTON même si le capteur détecte un
      // piéton en même temps. Sinon le cycle serait à tort journalisé
      // « Distance critique ».
      if (causeActuelle != 1) {
        causeActuelle = 0;   // déclenchement par le capteur (distance critique)
      }
      Serial.println("Demande par Ultrason");
    }
    pedestrianPrec = pedestrianActuel;
  }

  gererBuzzer();

  // ---- Commandes du dashboard (front montant du bouton_pieton) ----
  bool appui = boutonHaut && !boutonPrec;
  boutonPrec = boutonHaut;
  if (appui) {
    demandePieton = true;
    causeActuelle = 1;   // déclenchement par le bouton du dashboard
    Serial.println("Demande par Dashboard (bouton_pieton)");
  }

  // ---- Modes forcés (dashboard) ----
  if (mode == 3) {            // MAINTENANCE : feu orange clignotant + buzzer
    if (etatActuel != MAINTENANCE) {
      entrerDansEtat(MAINTENANCE);
      envoyerYOUXIS("feu", 3);
      envoyerYOUXIS("pedestrian", 0);
    }
    clignoterMaintenance();
  } else if (mode == 1) {     // VERT forcé : les voitures passent
    if (etatActuel != VERT) entrerDansEtat(VERT);
  } else if (mode == 2) {     // ROUGE forcé : le piéton traverse
    if (etatActuel != PIETON) entrerDansEtat(PIETON);
  } else {
    // ---- Machine à états AUTO (durées commandées depuis le site) ----
    unsigned long ecoule = millis() - tempsEntree;
    switch (etatActuel) {
      case ROUGE:
        if (ecoule >= dureeRougeCmd) {
          // Fin de la traversée : la demande est consommée et un cycle
          // propre repart au VERT sans cause « bouton » (sinon un clic
          // resterait attribué à tous les cycles suivants).
          causeActuelle = 0;
          entrerDansEtat(VERT);
        }
        break;
      case VERT:
        if (ecoule >= dureeVertCmd) entrerDansEtat(ORANGE);
        break;
      case ORANGE:
        if (ecoule >= dureeOrangeCmd) {
          if (demandePieton) {
            demandePieton = false;
            entrerDansEtat(PIETON);
          } else {
            entrerDansEtat(ROUGE);
          }
        }
        break;
      case PIETON:
        if (ecoule >= DUREE_PIETON_DEF) entrerDansEtat(ROUGE);
        break;
    }
  }

  // ---- Lecture des commandes 1x/sec ----
  if (millis() - dernierEnvoi >= INTERVALLE_ENVOI) {
    dernierEnvoi = millis();
    lireCommandesYOUXIS();
  }

  delay(50);
}
