/**
 * ============================================================
 *  YOUXIS IOT v2 — ESP32 + capteur ultrason (HC-SR04) « Feu intelligent »
 * ============================================================
 *  Version du moniteur série pour la plateforme yousis-iot-v2.
 *
 *  Ce sketch fait exactement ce que fait le simulateur Python :
 *   1) mesure la distance avec le HC-SR04 (présence d'un piéton)
 *   2) détecte le piéton : pedestrian = 1 si distance < SEUIL_CM
 *   3) lit chaque seconde les COMMANDES du tableau de bord (GET /latest) :
 *        duree_vert (s), mode (0 auto / 1 vert forcé / 2 rouge forcé),
 *        bouton_pieton (impulsion)
 *   4) pilote le feu tricolore (machine à états) :
 *        VERT (durée min duree_vert) --piéton--> ORANGE (2 s) --> ROUGE (6 s) --> VERT
 *   5) envoie les valeurs à l'API (POST /api/data) avec X-Device-Token :
 *        distance, pedestrian (0/1), feu (0=vert, 1=orange, 2=rouge)
 *
 *  Le tableau de bord (page /tableau-bord) affiche et commande
 *  (WebSocket pour l'affichage, /latest pour les commandes).
 *
 *  ── Ce qu'il faut adapter dans les "" ci-dessous :
 *     1) les identifiants de ton WiFi
 *     2) localhost : l'IP locale de ton PC (commande "ipconfig" dans cmd)
 *        + le port du backend (3001 par défaut)
 *     3) le token du device (copié dans la page Devices de YOUXIS IOT)
 *
 *  Le capteur :  VCC -> 3.3V | GND -> GND | TRIG -> GPIO 13 | ECHO -> GPIO 12
 * ============================================================
 */
#include <WiFi.h>
#include <HTTPClient.h>

// ====== À ADAPTER ======
const char* WIFI_SSID = "TON_WIFI";
const char* WIFI_PASS = "TON_MOT_DE_PASSE";
const char* PC_IP     = "192.168.1.42";     // IP locale de ton PC (ipconfig)
const int   BACKEND_PORT = 3001;            // port du backend YOUXIS IOT
const char* DEVICE_TOKEN = "TOKEN_DU_DEVICE"; // copié dans l'interface
// =======================

#define TRIG_PIN 13
#define ECHO_PIN 12

const float SEUIL_CM = 80.0;   // distance sous laquelle un piéton est détecté

// États du feu (feu des voitures) : 0 = vert, 1 = orange, 2 = rouge
const int FEU_VERT = 0, FEU_ORANGE = 1, FEU_ROUGE = 2;
const unsigned long DUREE_ORANGE = 2000; // ms
const unsigned long DUREE_ROUGE  = 6000; // ms
const float DUREE_VERT_DEFAUT = 5.0f;    // s : durée minimale du vert

// Commandes lues sur /latest (tableau de bord)
float dureeVert = DUREE_VERT_DEFAUT; // s
int mode = 0;                        // 0 auto · 1 vert forcé · 2 rouge forcé
bool boutonHaut = false;             // impulsion du bouton « Piéton »
bool boutonPrec = false;             // valeur précédente (détection de front)

int feu = FEU_VERT;
unsigned long phaseUntil = 0;   // fin de la phase ORANGE / ROUGE
unsigned long cycleStart = 0;   // début du vert en cours
bool pending = false;           // un passage a été demandé

const unsigned long SEND_INTERVAL = 1000; // ms entre deux envois

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  Serial.print("Connexion au WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("WiFi connecté ! IP locale : ");
  Serial.println(WiFi.localIP());
  Serial.printf("Seuil de détection : %.0f cm\n", SEUIL_CM);
}

void loop() {
  static unsigned long lastSend = 0;
  if (millis() - lastSend >= SEND_INTERVAL) {
    lastSend = millis();

    lireCommandes();          // durée du vert, mode, bouton piéton

    float distance = lireDistance();

    // Détection du piéton (distance valide et inférieure au seuil)
    int pedestrian = (distance > 0 && distance < SEUIL_CM) ? 1 : 0;

    // Machine à états du feu (front montant du bouton = demande)
    bool appui = boutonHaut && !boutonPrec;
    boutonPrec = boutonHaut;
    majFeu(pedestrian, appui);

    // Envoi des 3 valeurs à la plateforme
    envoyer("distance", String(distance, 1));
    envoyer("pedestrian", String(pedestrian));
    envoyer("feu", String(feu));

    Serial.printf("distance=%.1f cm · piéton=%s · feu=%d (%s) · mode=%d · vert %.0f s\n",
                  distance,
                  pedestrian ? "OUI " : "NON ",
                  feu,
                  feu == FEU_VERT ? "VERT" : feu == FEU_ORANGE ? "ORANGE" : "ROUGE",
                  mode, dureeVert);
  }
}

/** Mesure la distance en cm avec le HC-SR04. Retourne 0 si aucune mesure. */
float lireDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duree = pulseIn(ECHO_PIN, HIGH, 30000); // timeout 30 ms (~5 m max)
  if (duree == 0) return 0.0;
  return duree * 0.034 / 2.0;
}

/** Machine à états : durée minimale de vert, mode auto/forcé, bouton piéton. */
void majFeu(int pedestrian, bool appui) {
  unsigned long now = millis();
  if (mode == 1) {            // VERT forcé : le piéton attend
    feu = FEU_VERT;
    cycleStart = now;
    pending = false;
  } else if (mode == 2) {     // ROUGE forcé : le piéton traverse
    feu = FEU_ROUGE;
    cycleStart = now;
    pending = false;
  } else if (feu == FEU_VERT) {
    if (pedestrian || appui) pending = true;  // le passage reste demandé
    if (pending && now - cycleStart >= (unsigned long)(dureeVert * 1000)) {
      feu = FEU_ORANGE;
      phaseUntil = now + DUREE_ORANGE;
    }
  } else if (feu == FEU_ORANGE && now >= phaseUntil) {
    feu = FEU_ROUGE;
    phaseUntil = now + DUREE_ROUGE;
  } else if (feu == FEU_ROUGE && now >= phaseUntil) {
    feu = FEU_VERT;
    cycleStart = now;
    pending = false;
  }
}

/** Lit les commandes du tableau de bord (GET /latest) et met à jour les globals. */
void lireCommandes() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String("http://") + PC_IP + ":" + BACKEND_PORT + "/api/devices/" + DEVICE_TOKEN + "/latest";
  http.begin(url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  int code = http.GET();
  if (code >= 200 && code < 300) {
    String body = http.getString();
    float dv = extraireNombre(body, "duree_vert");
    if (dv > 0) dureeVert = dv;
    int m = (int)extraireNombre(body, "mode");
    if (m >= 0 && m <= 2) mode = m;
    float bp = extraireNombre(body, "bouton_pieton");
    boutonHaut = (bp == 1);
  }
  http.end();
}

/** Extrait la valeur numérique de `"key":"cle"` … `"value":…` d'un JSON. -999 si absente. */
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

/** Envoie {key, value} à POST /api/data avec l'en-tête X-Device-Token. */
void envoyer(const char* cle, const String& valeur) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi perdu, envoi annulé.");
    return;
  }

  HTTPClient http;
  String url = String("http://") + PC_IP + ":" + BACKEND_PORT + "/api/data";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);

  String body = "{\"key\":\"" + String(cle) + "\",\"value\":" + valeur + "}";
  int code = http.POST(body);

  if (code < 200 || code >= 300) {
    Serial.printf("  ✗ %s -> HTTP %d (%s)\n", cle, code, body.c_str());
  }
  http.end();
}