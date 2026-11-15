# FactoryScope 5G

Application de supervision industrielle et de comparaison réseau simulées.

## Exécution locale
Prérequis : Node.js 20 ou supérieur. Aucun paquet tiers requis.

```bash
npm run dev
```
Ouvrir http://localhost:3000.

## Déploiement Vercel
Décompresser cette archive et déposer son contenu à la racine du dépôt GitHub.
Importer le dépôt dans Vercel ; conserver la racine comme Root Directory.
Framework : Other. La configuration vercel.json indique déjà :
- Build Command : npm run build
- Output Directory : dist
Aucune variable d’environnement n’est nécessaire.

## Vérification et expériences
```bash
npm test
npm run experiment
npm run build
```
Les expériences écrivent leurs résultats dans results/.

Les données et incidents sont simulés ; aucun réseau 5G ni broker MQTT réel n’est utilisé.
