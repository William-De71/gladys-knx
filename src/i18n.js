// -----------------------------------------------------------------------------
// Runtime texts, in the four languages of the Gladys UI.
//
// `t(key, vars)` returns a multi-language object `{ en, fr, de, es }`
// (configuration buttons, widget, connection status); `text(key, language,
// vars)` returns one string (feature names, scene action errors: Gladys does
// not send the language of the user with a scan or a scene action, see
// `language` in config.js).
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

const MESSAGES = {
  // --- Feature names (`<device name> - <feature>`) ---------------------------
  switch: { en: 'On/Off', fr: 'Marche/arrêt', de: 'Ein/Aus', es: 'Encendido/apagado' },
  brightness: { en: 'Brightness', fr: 'Luminosité', de: 'Helligkeit', es: 'Brillo' },
  color: { en: 'Color', fr: 'Couleur', de: 'Farbe', es: 'Color' },
  color_temperature: {
    en: 'Color temperature',
    fr: 'Température de couleur',
    de: 'Farbtemperatur',
    es: 'Temperatura de color',
  },
  state: {
    en: 'Open/Close',
    fr: 'Ouverture/fermeture',
    de: 'Öffnen/Schließen',
    es: 'Abrir/cerrar',
  },
  position: { en: 'Position', fr: 'Position', de: 'Position', es: 'Posición' },
  target_temperature: { en: 'Setpoint', fr: 'Consigne', de: 'Sollwert', es: 'Consigna' },
  temperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  humidity: { en: 'Humidity', fr: 'Humidité', de: 'Luftfeuchtigkeit', es: 'Humedad' },
  illuminance: { en: 'Illuminance', fr: 'Luminosité', de: 'Helligkeit', es: 'Iluminancia' },
  co2: { en: 'CO2', fr: 'CO2', de: 'CO2', es: 'CO2' },
  pressure: { en: 'Pressure', fr: 'Pression', de: 'Luftdruck', es: 'Presión' },
  wind_speed: {
    en: 'Wind speed',
    fr: 'Vitesse du vent',
    de: 'Windgeschwindigkeit',
    es: 'Velocidad del viento',
  },
  power: { en: 'Power', fr: 'Puissance', de: 'Leistung', es: 'Potencia' },
  energy: { en: 'Energy', fr: 'Énergie', de: 'Energie', es: 'Energía' },
  energy_wh: { en: 'Energy', fr: 'Énergie', de: 'Energie', es: 'Energía' },
  voltage: { en: 'Voltage', fr: 'Tension', de: 'Spannung', es: 'Tensión' },
  current: { en: 'Current', fr: 'Courant', de: 'Strom', es: 'Corriente' },
  percent: { en: 'Percentage', fr: 'Pourcentage', de: 'Prozentsatz', es: 'Porcentaje' },
  counter: { en: 'Counter', fr: 'Compteur', de: 'Zähler', es: 'Contador' },
  motion: { en: 'Motion', fr: 'Mouvement', de: 'Bewegung', es: 'Movimiento' },
  presence: { en: 'Presence', fr: 'Présence', de: 'Anwesenheit', es: 'Presencia' },
  opening: { en: 'Opening', fr: 'Ouverture', de: 'Öffnung', es: 'Apertura' },
  smoke: { en: 'Smoke', fr: 'Fumée', de: 'Rauch', es: 'Humo' },
  leak: { en: 'Leak', fr: 'Fuite', de: 'Leck', es: 'Fuga' },
  rain: { en: 'Rain', fr: 'Pluie', de: 'Regen', es: 'Lluvia' },
  generic: { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' },

  // --- Kinds (lists of the configuration buttons) ----------------------------
  kind_switch: { en: 'switch', fr: 'interrupteur', de: 'Schalter', es: 'interruptor' },
  kind_light: { en: 'light', fr: 'lumière', de: 'Licht', es: 'luz' },
  kind_cover: { en: 'cover', fr: 'volet', de: 'Rollladen', es: 'persiana' },
  kind_sensor: { en: 'sensor', fr: 'capteur', de: 'Sensor', es: 'sensor' },
  kind_binary_sensor: {
    en: 'binary sensor',
    fr: 'capteur binaire',
    de: 'Binärsensor',
    es: 'sensor binario',
  },
  kind_climate: { en: 'thermostat', fr: 'thermostat', de: 'Thermostat', es: 'termostato' },

  // --- Connection status (Integrations page) ---------------------------------
  statusConnected: {
    en: 'Connected to the KNX bus through {gateway}.',
    fr: 'Connecté au bus KNX via {gateway}.',
    de: 'Mit dem KNX-Bus über {gateway} verbunden.',
    es: 'Conectado al bus KNX a través de {gateway}.',
  },
  statusConnecting: {
    en: 'Connecting to {gateway}…',
    fr: 'Connexion à {gateway}…',
    de: 'Verbindung mit {gateway} wird hergestellt…',
    es: 'Conectando con {gateway}…',
  },
  statusDisconnected: {
    en: 'Connection to {gateway} lost ({reason}), retrying.',
    fr: 'Connexion à {gateway} perdue ({reason}), nouvelle tentative en cours.',
    de: 'Verbindung zu {gateway} unterbrochen ({reason}), neuer Versuch läuft.',
    es: 'Conexión con {gateway} perdida ({reason}), reintentando.',
  },
  statusNoGateway: {
    en: 'No KNX IP interface found on the network: enter its IP address in the configuration.',
    fr: 'Aucune interface IP KNX trouvée sur le réseau : saisissez son adresse IP dans la configuration.',
    de: 'Keine KNX-IP-Schnittstelle im Netzwerk gefunden: Geben Sie ihre IP-Adresse in der Konfiguration ein.',
    es: 'No se encontró ninguna interfaz IP KNX en la red: introduzca su dirección IP en la configuración.',
  },
  statusConfigProblem: {
    en: 'Configuration to complete: {problem}',
    fr: 'Configuration à compléter : {problem}',
    de: 'Konfiguration unvollständig: {problem}',
    es: 'Configuración incompleta: {problem}',
  },

  // --- Configuration problems -------------------------------------------------
  configInvalidHost: {
    en: 'the address of the KNX IP interface is not an IP address nor a host name.',
    fr: 'l’adresse de l’interface IP KNX n’est ni une adresse IP ni un nom d’hôte.',
    de: 'die Adresse der KNX-IP-Schnittstelle ist weder eine IP-Adresse noch ein Hostname.',
    es: 'la dirección de la interfaz IP KNX no es una dirección IP ni un nombre de host.',
  },
  configInvalidIndividualAddress: {
    en: 'the individual address must look like 1.1.250 (ignored for now).',
    fr: 'l’adresse physique doit ressembler à 1.1.250 (ignorée pour l’instant).',
    de: 'die physikalische Adresse muss wie 1.1.250 aussehen (vorerst ignoriert).',
    es: 'la dirección individual debe tener la forma 1.1.250 (ignorada por ahora).',
  },
  configSecureTunnelAddress: {
    en: 'KNX IP Secure needs the individual address of the tunnel (e.g. 1.1.254).',
    fr: 'KNX IP Secure a besoin de l’adresse physique du tunnel (par ex. 1.1.254).',
    de: 'KNX IP Secure benötigt die physikalische Adresse des Tunnels (z. B. 1.1.254).',
    es: 'KNX IP Secure necesita la dirección individual del túnel (p. ej. 1.1.254).',
  },
  configSecurePassword: {
    en: 'KNX IP Secure needs the password of the tunnel user.',
    fr: 'KNX IP Secure a besoin du mot de passe de l’utilisateur du tunnel.',
    de: 'KNX IP Secure benötigt das Passwort des Tunnelbenutzers.',
    es: 'KNX IP Secure necesita la contraseña del usuario del túnel.',
  },
  configRoutingAddress: {
    en: 'routing needs an individual address for Gladys on the bus (e.g. 1.1.250).',
    fr: 'le routage a besoin d’une adresse physique pour Gladys sur le bus (par ex. 1.1.250).',
    de: 'Routing benötigt eine physikalische Adresse für Gladys am Bus (z. B. 1.1.250).',
    es: 'el enrutamiento necesita una dirección individual para Gladys en el bus (p. ej. 1.1.250).',
  },
  configSecureRouting: {
    en: 'KNX IP Secure is only available with tunnelling.',
    fr: 'KNX IP Secure n’est disponible qu’en tunneling.',
    de: 'KNX IP Secure ist nur mit Tunneling verfügbar.',
    es: 'KNX IP Secure solo está disponible con tunneling.',
  },
  configInvalidEvents: {
    en: 'group addresses ignored in “Group addresses for scenes”: {entries}.',
    fr: 'adresses de groupe ignorées dans « Adresses de groupe pour les scènes » : {entries}.',
    de: 'ignorierte Gruppenadressen in „Gruppenadressen für Szenen“: {entries}.',
    es: 'direcciones de grupo ignoradas en «Direcciones de grupo para escenas»: {entries}.',
  },

  // --- Configuration buttons --------------------------------------------------
  testConnected: {
    en: 'Connected to {gateway}. {devices} declared devices, {telegrams} telegrams in the last minute.',
    fr: 'Connecté à {gateway}. {devices} appareils déclarés, {telegrams} télégrammes dans la dernière minute.',
    de: 'Verbunden mit {gateway}. {devices} deklarierte Geräte, {telegrams} Telegramme in der letzten Minute.',
    es: 'Conectado a {gateway}. {devices} dispositivos declarados, {telegrams} telegramas en el último minuto.',
  },
  testNotConnected: {
    en: 'Not connected to {gateway}: {reason}.',
    fr: 'Non connecté à {gateway} : {reason}.',
    de: 'Nicht mit {gateway} verbunden: {reason}.',
    es: 'No conectado a {gateway}: {reason}.',
  },
  discoverNone: {
    en: 'No KNX IP interface answered. Check that it is on the same network as Gladys, or enter its IP address.',
    fr: 'Aucune interface IP KNX n’a répondu. Vérifiez qu’elle est sur le même réseau que Gladys, ou saisissez son adresse IP.',
    de: 'Keine KNX-IP-Schnittstelle hat geantwortet. Prüfen Sie, ob sie im selben Netzwerk wie Gladys ist, oder geben Sie ihre IP-Adresse ein.',
    es: 'Ninguna interfaz IP KNX respondió. Compruebe que está en la misma red que Gladys o introduzca su dirección IP.',
  },
  discoverFound: {
    en: 'KNX IP interfaces found: {list}',
    fr: 'Interfaces IP KNX trouvées : {list}',
    de: 'Gefundene KNX-IP-Schnittstellen: {list}',
    es: 'Interfaces IP KNX encontradas: {list}',
  },
  discoverRateLimited: {
    en: 'A search ran less than 10 seconds ago: try again in a moment.',
    fr: 'Une recherche a eu lieu il y a moins de 10 secondes : réessayez dans un instant.',
    de: 'Vor weniger als 10 Sekunden lief bereits eine Suche: Versuchen Sie es gleich noch einmal.',
    es: 'Hace menos de 10 segundos que se hizo una búsqueda: inténtelo de nuevo en un momento.',
  },
  deviceAdded: {
    en: '“{name}” declared. Open the Discover tab to add it to Gladys.',
    fr: '« {name} » déclaré. Ouvrez l’onglet Découverte pour l’ajouter à Gladys.',
    de: '„{name}“ deklariert. Öffnen Sie den Tab Entdecken, um es zu Gladys hinzuzufügen.',
    es: '«{name}» declarado. Abra la pestaña Descubrir para añadirlo a Gladys.',
  },
  deviceUpdated: {
    en: '“{name}” updated. If it is already in Gladys, update it from the Discover tab.',
    fr: '« {name} » mis à jour. S’il est déjà dans Gladys, mettez-le à jour depuis l’onglet Découverte.',
    de: '„{name}“ aktualisiert. Ist es bereits in Gladys, aktualisieren Sie es im Tab Entdecken.',
    es: '«{name}» actualizado. Si ya está en Gladys, actualícelo desde la pestaña Descubrir.',
  },
  deviceRemoved: {
    en: '“{name}” is no longer declared. If it was added to Gladys, delete it from the Devices tab too.',
    fr: '« {name} » n’est plus déclaré. S’il avait été ajouté à Gladys, supprimez-le aussi depuis l’onglet Appareils.',
    de: '„{name}“ ist nicht mehr deklariert. Wurde es zu Gladys hinzugefügt, löschen Sie es auch im Tab Geräte.',
    es: '«{name}» ya no está declarado. Si se añadió a Gladys, elimínelo también desde la pestaña Dispositivos.',
  },
  deviceNotFound: {
    en: 'No declared device has the name or the main group address “{query}”. The “List the devices” button shows them.',
    fr: 'Aucun appareil déclaré n’a le nom ou l’adresse de groupe principale « {query} ». Le bouton « Lister les appareils » les affiche.',
    de: 'Kein deklariertes Gerät hat den Namen oder die Hauptgruppenadresse „{query}“. Die Schaltfläche „Geräte auflisten“ zeigt sie an.',
    es: 'Ningún dispositivo declarado tiene el nombre o la dirección de grupo principal «{query}». El botón «Listar los dispositivos» los muestra.',
  },
  deviceAmbiguous: {
    en: 'Several declared devices are named “{query}”: give the main group address instead.',
    fr: 'Plusieurs appareils déclarés s’appellent « {query} » : indiquez plutôt l’adresse de groupe principale.',
    de: 'Mehrere deklarierte Geräte heißen „{query}“: Geben Sie stattdessen die Hauptgruppenadresse an.',
    es: 'Varios dispositivos declarados se llaman «{query}»: indique la dirección de grupo principal.',
  },
  listEmpty: {
    en: 'No device declared yet: use the “Declare a …” buttons.',
    fr: 'Aucun appareil déclaré pour l’instant : utilisez les boutons « Déclarer … ».',
    de: 'Noch kein Gerät deklariert: Verwenden Sie die Schaltflächen „… deklarieren“.',
    es: 'Aún no hay ningún dispositivo declarado: use los botones «Declarar …».',
  },
  listHeader: {
    en: '{count} declared devices: {list}',
    fr: '{count} appareils déclarés : {list}',
    de: '{count} deklarierte Geräte: {list}',
    es: '{count} dispositivos declarados: {list}',
  },
  registryFull: {
    en: 'Too many declared devices (at most {max}): remove some first.',
    fr: 'Trop d’appareils déclarés ({max} au maximum) : supprimez-en d’abord.',
    de: 'Zu viele deklarierte Geräte (höchstens {max}): Entfernen Sie zuerst einige.',
    es: 'Demasiados dispositivos declarados ({max} como máximo): elimine algunos primero.',
  },
  registryAddressTaken: {
    en: 'The main group address {address} is already the one of “{name}” ({kind}).',
    fr: 'L’adresse de groupe principale {address} est déjà celle de « {name} » ({kind}).',
    de: 'Die Hauptgruppenadresse {address} gehört bereits zu „{name}“ ({kind}).',
    es: 'La dirección de grupo principal {address} ya es la de «{name}» ({kind}).',
  },
  saveFailed: {
    en: 'The declared devices could not be saved in Gladys: {error}',
    fr: 'Les appareils déclarés n’ont pas pu être enregistrés dans Gladys : {error}',
    de: 'Die deklarierten Geräte konnten nicht in Gladys gespeichert werden: {error}',
    es: 'No se pudieron guardar los dispositivos declarados en Gladys: {error}',
  },

  // --- Errors (buttons, commands, scene actions) -----------------------------
  errorNameRequired: {
    en: 'The name is required.',
    fr: 'Le nom est obligatoire.',
    de: 'Der Name ist erforderlich.',
    es: 'El nombre es obligatorio.',
  },
  errorInvalidAddress: {
    en: '“{value}” ({field}) is not a group address: write it 1/2/3.',
    fr: '« {value} » ({field}) n’est pas une adresse de groupe : écrivez-la 1/2/3.',
    de: '„{value}“ ({field}) ist keine Gruppenadresse: Schreiben Sie sie als 1/2/3.',
    es: '«{value}» ({field}) no es una dirección de grupo: escríbala como 1/2/3.',
  },
  errorAddressRequired: {
    en: 'The group address “{field}” is required.',
    fr: 'L’adresse de groupe « {field} » est obligatoire.',
    de: 'Die Gruppenadresse „{field}“ ist erforderlich.',
    es: 'La dirección de grupo «{field}» es obligatoria.',
  },
  errorNoStopAddress: {
    en: 'This cover has no stop group address.',
    fr: 'Ce volet n’a pas d’adresse de groupe d’arrêt.',
    de: 'Dieser Rollladen hat keine Gruppenadresse zum Stoppen.',
    es: 'Esta persiana no tiene dirección de grupo de parada.',
  },
  errorNotConnected: {
    en: 'The KNX bus is not connected.',
    fr: 'Le bus KNX n’est pas connecté.',
    de: 'Der KNX-Bus ist nicht verbunden.',
    es: 'El bus KNX no está conectado.',
  },
  errorUnknownDevice: {
    en: 'This device is no longer declared in the KNX integration.',
    fr: 'Cet appareil n’est plus déclaré dans l’intégration KNX.',
    de: 'Dieses Gerät ist in der KNX-Integration nicht mehr deklariert.',
    es: 'Este dispositivo ya no está declarado en la integración KNX.',
  },
  errorReadOnly: {
    en: 'This feature is read only (no command group address).',
    fr: 'Cette fonctionnalité est en lecture seule (pas d’adresse de groupe de commande).',
    de: 'Diese Funktion ist schreibgeschützt (keine Befehlsgruppenadresse).',
    es: 'Esta función es de solo lectura (sin dirección de grupo de comando).',
  },
  errorInvalidDpt: {
    en: 'Unknown datapoint type “{dpt}”: write it like 1.001 or 9.001.',
    fr: 'Type de point de données « {dpt} » inconnu : écrivez-le comme 1.001 ou 9.001.',
    de: 'Unbekannter Datenpunkttyp „{dpt}“: Schreiben Sie ihn wie 1.001 oder 9.001.',
    es: 'Tipo de punto de datos «{dpt}» desconocido: escríbalo como 1.001 o 9.001.',
  },
  errorInvalidValue: {
    en: '“{value}” is not a valid value for DPT {dpt}.',
    fr: '« {value} » n’est pas une valeur valide pour le DPT {dpt}.',
    de: '„{value}“ ist kein gültiger Wert für DPT {dpt}.',
    es: '«{value}» no es un valor válido para el DPT {dpt}.',
  },
  errorReadTimeout: {
    en: 'No answer from {address} within {seconds} s (is its read flag set in ETS?).',
    fr: 'Pas de réponse de {address} en {seconds} s (son indicateur de lecture est-il activé dans ETS ?).',
    de: 'Keine Antwort von {address} innerhalb von {seconds} s (ist das Lesen-Flag in ETS gesetzt?).',
    es: 'Sin respuesta de {address} en {seconds} s (¿tiene activado el indicador de lectura en ETS?).',
  },
  errorSceneNumber: {
    en: 'The KNX scene number goes from 1 to 64.',
    fr: 'Le numéro de scène KNX va de 1 à 64.',
    de: 'Die KNX-Szenennummer reicht von 1 bis 64.',
    es: 'El número de escena KNX va de 1 a 64.',
  },

  // --- Widget -----------------------------------------------------------------
  widgetConnection: { en: 'KNX bus', fr: 'Bus KNX', de: 'KNX-Bus', es: 'Bus KNX' },
  widgetConnected: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  widgetDisconnected: { en: 'Disconnected', fr: 'Déconnecté', de: 'Getrennt', es: 'Desconectado' },
  widgetNotConfigured: {
    en: 'Not configured',
    fr: 'Non configuré',
    de: 'Nicht konfiguriert',
    es: 'Sin configurar',
  },
  widgetGateway: { en: 'Interface', fr: 'Interface', de: 'Schnittstelle', es: 'Interfaz' },
  widgetTelegrams: {
    en: 'Telegrams/min',
    fr: 'Télégrammes/min',
    de: 'Telegramme/Min.',
    es: 'Telegramas/min',
  },
  widgetDevices: { en: 'Devices', fr: 'Appareils', de: 'Geräte', es: 'Dispositivos' },
  widgetNoTelegram: {
    en: 'No telegram received yet.',
    fr: 'Aucun télégramme reçu pour l’instant.',
    de: 'Noch kein Telegramm empfangen.',
    es: 'Aún no se ha recibido ningún telegrama.',
  },
  widgetReadAll: {
    en: 'Read states',
    fr: 'Lire les états',
    de: 'Zustände lesen',
    es: 'Leer estados',
  },
  widgetReconnect: { en: 'Reconnect', fr: 'Reconnecter', de: 'Neu verbinden', es: 'Reconectar' },
  widgetReadSent: {
    en: 'Read requests sent to {count} group addresses.',
    fr: 'Demandes de lecture envoyées à {count} adresses de groupe.',
    de: 'Leseanfragen an {count} Gruppenadressen gesendet.',
    es: 'Solicitudes de lectura enviadas a {count} direcciones de grupo.',
  },
  widgetReconnecting: {
    en: 'Reconnecting to the KNX bus…',
    fr: 'Reconnexion au bus KNX…',
    de: 'Neuverbindung mit dem KNX-Bus…',
    es: 'Reconectando con el bus KNX…',
  },
  telegramDetail: {
    en: 'From {source}, {type}. Data: {raw}.',
    fr: 'De {source}, {type}. Données : {raw}.',
    de: 'Von {source}, {type}. Daten: {raw}.',
    es: 'De {source}, {type}. Datos: {raw}.',
  },
  type_write: { en: 'write', fr: 'écriture', de: 'Schreiben', es: 'escritura' },
  type_response: { en: 'response', fr: 'réponse', de: 'Antwort', es: 'respuesta' },
  type_read: {
    en: 'read request',
    fr: 'demande de lecture',
    de: 'Leseanfrage',
    es: 'solicitud de lectura',
  },
  valueOn: { en: 'On', fr: 'On', de: 'Ein', es: 'On' },
  valueOff: { en: 'Off', fr: 'Off', de: 'Aus', es: 'Off' },
  valueOpen: { en: 'Open', fr: 'Ouvert', de: 'Offen', es: 'Abierto' },
  valueClosed: { en: 'Closed', fr: 'Fermé', de: 'Geschlossen', es: 'Cerrado' },
  valueUp: { en: 'Up', fr: 'Monter', de: 'Auf', es: 'Subir' },
  valueDown: { en: 'Down', fr: 'Descendre', de: 'Ab', es: 'Bajar' },
  valueStop: { en: 'Stop', fr: 'Stop', de: 'Stopp', es: 'Parar' },
};

/**
 * @description Replace the `{name}` placeholders of a template.
 * @param {string} template - The template.
 * @param {object} vars - The values.
 * @returns {string} The text.
 */
function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] === undefined || vars[name] === null ? match : String(vars[name]),
  );
}

/**
 * @description A runtime text in the four languages.
 * @param {string} key - Message key.
 * @param {object} [vars] - Placeholder values, a value may itself be multi-language.
 * @returns {{en: string, fr: string, de: string, es: string}} The message.
 */
export function t(key, vars = {}) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, text(key, language, vars)]));
}

/**
 * @description A runtime text in one language (English when unknown).
 * @param {string} key - Message key.
 * @param {string} language - Language code.
 * @param {object} [vars] - Placeholder values, a value may itself be multi-language.
 * @returns {string} The text.
 */
export function text(key, language, vars = {}) {
  const message = MESSAGES[key];
  if (!message) {
    throw new Error(`Unknown message ${key}`);
  }
  const lang = LANGUAGES.includes(language) ? language : 'en';
  const resolved = Object.fromEntries(
    Object.entries(vars).map(([name, value]) => [name, pick(value, lang)]),
  );
  return fill(message[lang], resolved);
}

/**
 * @description The name of a feature in one language.
 * @param {string} key - Feature key, sensor type or binary sensor type.
 * @param {string} language - Language code.
 * @returns {string} The name.
 */
export function featureName(key, language) {
  return MESSAGES[key] ? text(key, language) : key;
}

/**
 * @description One language of a value that may be multi-language.
 * @param {*} value - A string, a number or `{ en, fr, ... }`.
 * @param {string} language - Language code.
 * @returns {*} The value in that language.
 */
export function pick(value, language) {
  if (value && typeof value === 'object') {
    return value[language] ?? value.en;
  }
  return value;
}

/**
 * @description Cut a text to a maximum length, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - Maximum length.
 * @returns {string} The text, at most `max` characters.
 */
export function truncate(value, max) {
  const string = String(value ?? '');
  return string.length <= max ? string : `${string.slice(0, max - 1).trimEnd()}…`;
}

/**
 * @description Cut every language of a multi-language text.
 * @param {object} message - `{ en, fr, ... }`.
 * @param {number} max - Maximum length.
 * @returns {object} The message.
 */
export function truncateAll(message, max) {
  return Object.fromEntries(
    Object.entries(message).map(([language, value]) => [language, truncate(value, max)]),
  );
}

export const MESSAGE_KEYS = Object.keys(MESSAGES);
export const MESSAGES_FOR_TESTS = MESSAGES;
