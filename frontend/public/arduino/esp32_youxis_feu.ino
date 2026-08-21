/**
 * ============================================================
 *  YOUXIS IOT v2 — ESP32 « Feu intelligent » (version adaptée)
 * ============================================================
 *  Anciennement : sketch Blynk + ThingSpeak.
 *  Désormais : LA MEME LOGIQUE MATERIELLE, mais branchée sur la
 *  plateforme YOUXIS (un seul site fait le dashboard + l'historique).
 *
 *  → Blynk        est remplacé par le DASHBOARD YOUXIS (WebSocket)
 *  → ThingSpeak   est remplacé par la BASE SQLite du backend (data_points)
 *
 *  Le device :
 *   1) mesure la distance (HC-SR04) -> pedestrian = 1 si < SEUIL
 *   2) comptabilise les passages piétons
 *   3) lit chaque seconde les COMMANDES du dashboard (GET /latest) :
 *        duree_vert (s), mode (0 auto / 1 vert forcé / 2 rouge forcé),
 *        bouton_pieton (impulsion)
 *   4) pilote le feu tricolore (machine à états ROUGE/VERT/ORANGE/PIETON)
 *   5) envoie distance, pedestrian, feu, compteur à l'API YOUXIS
 *      (POST /api/data avec X-Device-Token)
 *
 *  ── À ADAPTER dans les "" ci-dessous :
 *     1) identifiants WiFi
 *     2) BACKEND_HOST : IP locale de ton PC (ipconfig)  OU  hôte Ngrok
 *        + BACKEND_PORT (3001 en local, 443 si tunnel Ngrok https)
 *     3) DEVICE_TOKEN : copié dans la page Devices de YOUXIS IOT
 *        (crée un device « Feu intelligent » via le bouton du dashboard,
 *         il faut les datastreams : distance, pedestrian, feu,
 *         duree_vert, mode, bouton_pieton, compteur_pietons)
 *
 *  Broches (identiques à ton ancien sketch) :
 *    Feu voitures : ROUGE 25 · ORANGE 26 · VERT 27
 *    Feu piétons  : ROUGE 32 · VERT 33
 *    Bouton 14 (pull-up) · TRIG 4 · ECHO 35 · BUZZER 12
 * ============================================================
 */
#include <WiFi.h>
#include <HTTPClient.h>

// ====== À ADAPTER ======
const char* WIFI_SSID = "WIN-N9NOB6KGKPH 1870";
const char* WIFI_PASS = "D081@a62";

// En local : IP de ton PC (ipconfig -> IPv4 Wi-Fi) + port 3001
// En tunnel Ngrok : hôte Ngrok SANS https://  + port 443
const char* BACKEND_HOST = "192.168.11.105";
const int   BACKEND_PORT = 3001;

const char* DEVICE_TOKEN = "METTRE_TOKEN_DEVICE_YOUXIS";
// =======================

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
const unsigned long COOLDOWN = 5000;         // anti-répétition détection

// Durées de la machine à états (ms) — harmonisées avec le simulateur
const unsigned long dureeRouge  = 10000;     // le piéton traverse (10 s)
unsigned long dureeVert = 5000;             // vert minimal (>= 5 s), modifiable depuis le dashboard
const unsigned long dureeOrange = 3000;     // les voitures s'arrêtent (3 s)
const unsigned long dureePieton = 4000;     // temps de traversée du piéton (4 s)

// ----- Commandes reçues du dashboard (GET /latest) -----
float dureeVertCmd = 5.0f;   // s (>= 5 s)
int   mode = 0;              // 0 auto · 1 vert forcé · 2 rouge forcé · 3 maintenance
bool  boutonHaut = false;    // impulsion bouton_pieton
bool  boutonPrec = false;    // détection de front

// ----- État local -----
bool wifiOK = false;
bool demandePieton = false;
bool ancienEtatBouton = HIGH;
int  compteurPietons = 0;
unsigned long derniereDetection = 0;
bool buzzerEtat = false;
unsigned long dernierBip = 0;
unsigned long dernierEnvoi = 0;
const unsigned long INTERVALLE_ENVOI = 1000;   // envoi vers YOUXIS toutes les 1 s

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
    Serial.println("WiFi Connecte");
    Serial.print("Adresse IP : ");
    Serial.println(WiFi.localIP());
  } else {
    wifiOK = false;
    Serial.println("Echec connexion WiFi");
  }
}

// ============================================================
//  Envoi vers YOUXIS (remplace Blynk + ThingSpeak)
// ============================================================
void envoyerYOUGIS(const char* cle, float valeur) {
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
//  Lecture des commandes du dashboard (remplace BLYNK_WRITE)
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
    float dv = extraireNombre(body, "duree_vert");
    if (dv > 0) dureeVertCmd = dv;
    float m = extraireNombre(body, "mode");
    if (m >= 0 && m <= 3) mode = (int)m;
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
      // comptage d'un passage piéton
      compteurPietons++;
      break;
    case MAINTENANCE:
      // Feu orange clignotant + buzzer (géré par clignoteMaintenance() dans loop)
      etatTexte = "MAINTENANCE"; feuCode = 3; pedCode = 0;
      break;
  }

  Serial.println(etatTexte);

  // Envoi de l'état vers YOUXIS (remplace Blynk V0 + LED V2)
  envoyerYOUGIS("feu", feuCode);
  envoyerYOUGIS("pedestrian", pedCode);
  envoyerYOUGIS("compteur_pietons", compteurPietons);
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
// L'état 3 est envoyé vers YOUXIS à chaque entrée dans l'état.
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
//  Bouton physique + ultrason (inchangés)
// ============================================================
void lireBouton() {
  bool etat = digitalRead(PIN_BOUTON);
  if (ancienEtatBouton == HIGH && etat == LOW) {
    demandePieton = true;
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
    envoyerYOUGIS("distance", distance);   // historique + graphe (remplace ThingSpeak)

    if (distance >= 1 && distance < SEUIL_DISTANCE) {
      if (millis() - derniereDetection >= COOLDOWN) {
        demandePieton = true;
        derniereDetection = millis();
        Serial.println("Demande par Ultrason");
      }
    }
  }

  gererBuzzer();

  // ---- Commandes du dashboard (front montant du bouton_pieton) ----
  bool appui = boutonHaut && !boutonPrec;
  boutonPrec = boutonHaut;
  if (appui) {
    demandePieton = true;
    Serial.println("Demande par Dashboard (bouton_pieton)");
  }

  // ---- Application de la durée du vert commandée ----
  dureeVert = (unsigned long)(dureeVertCmd * 1000.0f);

  // ---- Modes forcés (dashboard) ----
  if (mode == 3) {            // MAINTENANCE : feu orange clignotant + buzzer
    if (etatActuel != MAINTENANCE) {
      entrerDansEtat(MAINTENANCE);
      envoyerYOUGIS("feu", 3);
      envoyerYOUGIS("pedestrian", 0);
    }
    clignoterMaintenance();
  } else if (mode == 1) {     // VERT forcé : les voitures passent
    if (etatActuel != VERT) entrerDansEtat(VERT);
  } else if (mode == 2) {     // ROUGE forcé : le piéton traverse
    if (etatActuel != PIETON) entrerDansEtat(PIETON);
  } else {
    // ---- Machine à états auto ----
    unsigned long ecoule = millis() - tempsEntree;
    switch (etatActuel) {
      case ROUGE:
        if (ecoule >= dureeRouge) entrerDansEtat(VERT);
        break;
      case VERT:
        if (ecoule >= dureeVert) entrerDansEtat(ORANGE);
        break;
      case ORANGE:
        if (ecoule >= dureeOrange) {
          if (demandePieton) {
            demandePieton = false;
            entrerDansEtat(PIETON);
          } else {
            entrerDansEtat(ROUGE);
          }
        }
        break;
      case PIETON:
        if (ecoule >= dureePieton) entrerDansEtat(ROUGE);
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
