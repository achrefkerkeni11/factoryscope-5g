# FactoryScope 5G

FactoryScope 5G est un laboratoire pédagogique de supervision industrielle. Il permet de simuler le trafic de capteurs, d'observer des indicateurs réseau et de comparer trois architectures dans différents scénarios d'incident.

- Application en production : <https://factoryscope-5g.vercel.app>
- Dépôt GitHub : <https://github.com/achrefkerkeni11/factoryscope-5g>

## Comment fonctionne l'application ?

La simulation s'exécute entièrement dans le navigateur. Aucune donnée n'est envoyée à un serveur et aucun équipement industriel, réseau 5G, point d'accès Wi-Fi ou broker MQTT réel n'est utilisé.

Le modèle commun (`public/src/model.js`) génère des messages périodiques et simule leur passage dans une file réseau. Il applique à chaque profil une capacité, des délais, une gigue et un taux de perte hypothétiques. La graine rend les résultats reproductibles : à configuration et graine identiques, les mêmes tirages aléatoires sont utilisés.

En parallèle, deux lignes de production virtuelles produisent des pièces. Leur TRS est calculé indépendamment du réseau : une coupure réseau n'arrête donc pas la production simulée. Les valeurs illustrent le fonctionnement du modèle et ne sont ni des mesures sur site ni une comparaison normative des technologies.

## Guide d'utilisation

### 1. Ouvrir la vue atelier

Choisissez **Vue atelier** dans le menu. La configuration se trouve en haut de la page :

- **Architecture réseau** : 5G privée + edge, 5G + cloud distant ou Wi-Fi de référence.
- **Scénario** : production nominale, congestion, liaison dégradée, coupure de liaison ou surchauffe de la machine B.
- **Capteurs** : nombre de capteurs simulés, de 20 à 400 par incréments de 20.
- **Graine** : valeur entière utilisée pour reproduire une expérience.

Cliquez sur **Appliquer & réinitialiser** pour valider la configuration et démarrer une nouvelle session. La configuration est conservée dans le stockage local du navigateur.

### 2. Lancer et piloter une simulation

- **Démarrer / Pause / Reprendre** contrôle l'horloge simulée.
- **+ 10 s** fait avancer la simulation de dix secondes.
- **Vitesse** règle la vitesse d'animation, sans changer le temps simulé.
- Le bouton de réinitialisation remet la session à zéro avec la configuration courante.

Une session dure au maximum 120 secondes simulées. Les scénarios réseau perturbés s'activent après 20 secondes : la congestion et la liaison dégradée durent jusqu'à 40 secondes, tandis que la coupure dure de 20 à 30 secondes. Le scénario de surchauffe affecte la machine B à partir de 20 secondes, sans modifier le réseau.

### 3. Lire les résultats

- **Latence p95** : 95e percentile des latences des paquets reçus.
- **Livrés en ≤ 50 ms** : messages reçus dans le délai cible, rapportés à tous les messages émis.
- **Pertes de paquets** : messages abandonnés, rapportés à tous les messages émis.
- **TRS de l'atelier** : disponibilité × performance × qualité de la production virtuelle.

La courbe montre le p95 cumulé et indique le budget de supervision de 50 ms. Le chemin modélisé détaille les délais supposés pour chaque étape réseau. Les cartes des machines affichent leur production, leur qualité, leur température et l'état de la télémétrie. Les commandes d'arrêt et de reprise sont purement simulées et ne sont pas des fonctions de sécurité.

### 4. Comparer les réseaux

Ouvrez **Comparer les réseaux**, puis cliquez sur **Lancer la comparaison**. Les trois profils sont évalués avec la configuration courante, le même trafic et la même graine sur 60 secondes. Le modèle vide ensuite la file pour inclure les paquets encore en transit dans les résultats.

Comparez le p95, les pertes et le taux de livraison à l'heure ensemble : une faible latence calculée uniquement sur les paquets reçus ne suffit pas à caractériser la qualité du service. Le bouton d'export permet de télécharger le résultat complet en JSON.

### 5. Exporter une session

Dans **Vue atelier**, lancez au moins une émission :

- **Exporter JSON** télécharge la configuration, les indicateurs, l'état de la production, le journal et les enregistrements des paquets.
- **Paquets CSV** télécharge les détails des paquets, exploitables notamment dans un tableur ou avec Python.

Un export de session peut signaler des paquets encore en transit. La comparaison, elle, termine la livraison des paquets avant le calcul des indicateurs.

## Exécution locale et développement

Prérequis : Node.js 20 ou supérieur. Aucun paquet tiers n'est nécessaire.

```bash
npm run dev
```

Ouvrez <http://localhost:3000>. Pour créer le site statique, exécutez `npm run build` ; les fichiers prêts à publier sont générés dans `dist/`.

Commandes utiles :

```bash
npm test
npm run experiment
npm run build
```

Les expériences reproductibles écrivent leurs résultats dans `results/`.

## Déploiement sur Vercel

Le site est publié sur <https://factoryscope-5g.vercel.app>. Pour connecter le dépôt GitHub à Vercel ou le redéployer :

1. Importez `achrefkerkeni11/factoryscope-5g` dans Vercel.
2. Gardez le dossier racine comme **Root Directory** et choisissez **Other** comme framework si demandé.
3. Utilisez `npm run build` comme commande de build et `dist` comme dossier de sortie.
4. Aucune variable d'environnement n'est requise.

La configuration correspondante est définie dans [`vercel.json`](./vercel.json).

## Périmètre et limites

Les profils réseau et les incidents sont des hypothèses pédagogiques. Le modèle ne simule pas une liaison radio réelle, l'ordonnanceur NR, les retransmissions, une tranche réseau, MQTT ou Sparkplug B. Une mise en œuvre industrielle nécessiterait notamment des équipements, des mesures sur site, une authentification, une validation de sécurité et une architecture edge adaptée.
