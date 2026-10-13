# KNX

## Présentation

Cette intégration relie Gladys à une installation KNX via une **interface ou un routeur IP KNX** de votre réseau local. Lumières, interrupteurs, volets et rideaux, capteurs et thermostats de pièce du bus KNX deviennent des appareils Gladys : vous les pilotez depuis le tableau de bord et les scènes, et leurs états suivent le bus en temps réel.

Les appareils KNX ne peuvent pas être découverts : la signification de chaque adresse de groupe se trouve dans votre projet ETS. Vous déclarez chaque appareil une fois dans la configuration de l’intégration, avec ses adresses de groupe, puis vous l’ajoutez depuis l’onglet **Découverte** comme n’importe quel appareil découvert.

Tout reste sur votre réseau local (badge **local**) : l’intégration dialogue avec l’interface en KNXnet/IP, aucune donnée ne part sur Internet.

![Widget Bus KNX : connexion, télégrammes par minute, derniers télégrammes et boutons (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-knx/main/docs/assets/widgets.fr.png)

## Prérequis

- Gladys Assistant 5.1.1 ou plus récent.
- Une interface IP KNX (tunneling) ou un routeur IP KNX sur le même réseau que Gladys, avec un tunnel libre.
- Votre projet ETS, ou au moins la liste des adresses de groupe des appareils à intégrer (avec leurs types de points de données, DPT).
- Pour une interface KNX IP Secure : l’adresse physique, l’ID utilisateur et le mot de passe d’un tunnel (ETS, propriétés de l’interface).

## Configuration

### Connexion

1. **Connexion** : le tunneling UDP convient à la plupart des interfaces. Choisissez le tunneling TCP pour KNX IP Secure et les interfaces récentes. Le routage (multicast) demande un routeur IP KNX et n’atteint généralement pas le conteneur de l’intégration : préférez le tunneling.
2. **Adresse de l’interface IP KNX** : son adresse IP ou son nom d’hôte. Laissez-la vide pour utiliser la première interface trouvée sur le réseau ; le bouton **Rechercher les interfaces IP KNX** liste celles qui répondent.
3. **Port** : 3671, sauf si votre interface en utilise un autre.
4. **Adresse physique de Gladys** : facultative en tunneling (l’interface donne l’adresse de son tunnel), obligatoire en routage (une adresse libre de la ligne, réservée dans ETS).
5. Enregistrez, puis appuyez sur **Tester la connexion**.

### KNX IP Secure

Choisissez le **tunneling TCP**, cochez **Utiliser KNX IP Secure**, puis renseignez l’**adresse physique du tunnel** (par exemple 1.1.254), l’**ID de l’utilisateur du tunnel** et le **mot de passe de l’utilisateur du tunnel** issus d’ETS. Le **code d’authentification de l’appareil** est facultatif : avec lui, l’intégration vérifie qu’elle parle bien à votre interface. KNX Data Secure (communication de groupe chiffrée) n’est pas pris en charge.

### Déclarer vos appareils

En bas de la page de configuration, un bouton par genre d’appareil ouvre un formulaire. Les adresses de groupe s’écrivent comme dans ETS : 1/2/3 (trois niveaux), 1/515 (deux niveaux) et 2563 (libre) sont la même adresse. L’**adresse d’état** est l’objet d’état de l’actionneur (indicateur de lecture activé dans ETS) : sans elle, Gladys garde la dernière commande comme état.

| Bouton                      | Adresses de groupe                                                                                                                                               | Fonctionnalités Gladys                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Déclarer une lumière        | commutation (DPT 1.001) et état, luminosité (5.001) et état, couleur RVB (232.600) et état, température de couleur (7.600) et état                               | marche/arrêt, luminosité, couleur, température de couleur |
| Déclarer un interrupteur    | commutation (1.001) et état                                                                                                                                      | marche/arrêt (prise, vanne, pompe…)                       |
| Déclarer un volet           | montée/descente (1.008), arrêt (1.007 ou 1.010), position (5.001) et état                                                                                        | ouvrir / fermer / arrêter, position                       |
| Déclarer un capteur         | valeur : température, humidité, luminosité, CO2, pression atmosphérique, vitesse du vent, puissance, compteur d’énergie, tension, courant, pourcentage, compteur | la mesure, avec son unité                                 |
| Déclarer un capteur binaire | état (1.x) : mouvement, présence, contact de fenêtre ou de porte, fumée, fuite d’eau, pluie, autre                                                               | l’état                                                    |
| Déclarer un thermostat      | consigne (9.001) et état, température mesurée                                                                                                                    | consigne, température                                     |

L’**adresse de groupe principale** (l’adresse de commutation, de montée/descente, de la valeur, de consigne) identifie l’appareil : déclarer de nouveau le même genre avec la même adresse principale le met à jour. **Lister les appareils** affiche les déclarations, **Retirer un appareil déclaré** prend un nom ou une adresse principale. Les déclarations sont enregistrées dans la configuration de Gladys, donc dans ses sauvegardes.

Ouvrez ensuite l’onglet **Découverte** et ajoutez les appareils. Un volet est ouvert à 100 % dans Gladys et fermé à 0 % (KNX dit l’inverse ; cochez **Inverser la position** si le vôtre le fait déjà). Une température, une puissance ou une tension envoyée en flottant sur 4 octets (DPT 14) est aussi comprise.

### États et scènes

- **Lire les états au démarrage** et **Relire les états toutes les (minutes)** : l’intégration demande leur valeur aux adresses d’état quand elle se connecte, puis à cet intervalle (0 : jamais). Les appareils KNX envoient eux-mêmes leurs changements ; cela rattrape seulement les télégrammes envoyés pendant que Gladys était arrêtée.
- **Adresses de groupe pour les scènes** : les télégrammes sur ces adresses déclenchent les scènes « Un télégramme KNX est reçu ». Séparez-les par des virgules, utilisez * pour tout un groupe principal ou intermédiaire (1/0/_, 2/_) et ajoutez :DPT pour décoder la valeur (1/0/7:9.001).
- **Langue des noms de fonctionnalités** : la langue des noms donnés aux fonctionnalités quand un appareil est ajouté.

## Utilisation

### Appareils

Les appareils ajoutés se comportent comme tout appareil Gladys : tableau de bord, pièces, historique, scènes, voix et chat. Un appareil sans adresse d’état affiche la dernière commande envoyée depuis Gladys, ainsi que les commandes venues du bus (un bouton-poussoir mural sur la même adresse de groupe).

### Widget

Le widget **Bus KNX** affiche la connexion, les télégrammes de la dernière minute, le nombre d’appareils déclarés et les derniers télégrammes avec le nom de l’appareil et sa valeur. **Lire les états** demande leur valeur à toutes les adresses d’état, **Reconnecter** ouvre une nouvelle connexion avec l’interface. Ses réglages : le nombre de télégrammes affichés et un filtre d’adresses de groupe (1/_, 2/1/_).

### Déclencheurs de scène

- **Un télégramme KNX est reçu** : sur une adresse du champ « Adresses de groupe pour les scènes ». Filtres : adresse de groupe (forme à trois niveaux), type de télégramme (écriture, réponse, demande de lecture), valeur (true, false, 21.5…). Variables : adresse de groupe, émetteur, type de télégramme, valeur, valeur numérique, données brutes.
- **La connexion KNX est perdue**, **La connexion KNX est rétablie** (après une perte) : l’interface et la raison, ou la durée de la coupure en secondes.

### Actions de scène

- **Envoyer une valeur sur le bus KNX** : une adresse de groupe, un type de point de données (1.001, 5.001, 9.001, 232.600…) et une valeur (on, off, 21.5, #ff8000, un texte ou une variable de scène). N’importe quelle adresse de groupe, même si elle n’est pas un appareil dans Gladys.
- **Lire une valeur sur le bus KNX** : demande sa valeur à une adresse de groupe ; les actions suivantes reçoivent la valeur, la valeur numérique et les données brutes.
- **Rappeler une scène KNX** : envoie un numéro de scène de 1 à 64 (DPT 17.001) à une adresse de groupe de scène.

### Exemples de scènes

- Quand le bouton-poussoir « Tout éteindre » de l’entrée (adresse de groupe 0/0/1 dans « Adresses de groupe pour les scènes ») envoie off → éteindre les lumières Gladys qui ne sont pas KNX et envoyer une notification.
- Quand l’alarme est activée → rappeler la scène KNX 3 « Absence » sur 0/1/0 et fermer les volets.
- Quand la connexion KNX est perdue → envoyer un message au foyer, avec la raison.

## Dépannage

- **« Aucune interface IP KNX trouvée »** : la recherche passe par le cœur de Gladys sur le réseau local ; certaines interfaces n’y répondent pas. Saisissez l’adresse IP de l’interface dans la configuration.
- **La connexion échoue ou tombe** : une interface n’a que quelques tunnels (souvent 4 ou 5), partagés avec ETS et d’autres logiciels. Fermez le moniteur de bus d’ETS, ou réservez un tunnel à Gladys dans ETS. Avec KNX IP Secure, vérifiez l’ID utilisateur et le mot de passe du tunnel.
- **Un état ne remonte jamais** : vérifiez que l’objet d’état de l’actionneur a son indicateur de lecture activé dans ETS, et que l’adresse d’état est la bonne (le moniteur de bus du widget montre ce qui arrive).
- **Une valeur fausse** (température aberrante, pourcentage à 255) : le type de point de données de l’adresse n’est pas celui attendu ; vérifiez-le dans ETS.
- **Un volet va dans le mauvais sens** : cochez ou décochez **Inverser la position** et déclarez-le de nouveau (même adresse de montée/descente : l’appareil est mis à jour).
- Journaux : onglet **Journaux** de l’intégration. Pour plus de détails, ajoutez la variable d’environnement `DEBUG=gladys-integration-sdk` au conteneur. Signalez les problèmes sur [GitHub](https://github.com/William-De71/gladys-knx/issues) avec la version de Gladys, la version de l’intégration, le modèle d’interface et les journaux.

KNX et le logo KNX sont des marques de KNX Association cvba. Cette intégration n’est ni affiliée, ni approuvée, ni certifiée par KNX Association.
