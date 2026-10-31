# Waar kijk ik het?

Zoek een film of serie en zie meteen waar je hem kunt kijken in het land waar je bent: in een abonnement, gratis, te huur of te koop. Met de schakelaar "Hier te zien" of "In mijn diensten" verberg je wat je toch niet kunt kijken.

- Gegevens: JustWatch, via de TMDB-API. Je hebt een gratis, persoonlijk TMDB **API Read Access Token** nodig; dat blijft in je browser.
- Lokale diensten: per land in `LOCAL` in `app.js`. Ze komen bovenaan in "Mijn diensten". Diensten die TMDB niet kent (in België: Play, Streamz en Arte) krijgen per titel een zoeklink naar hun eigen site. Of de titel daar echt staat, weet de app niet.
- Locatie: wordt op je toestel omgezet naar een land met [country-coder](https://github.com/rapideditor/country-coder). Je coördinaten worden niet verstuurd of bewaard.
- Statische site (HTML, CSS, JS), geen build-stap, strikte Content-Security-Policy.

Lokaal draaien:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Versies en wijzigingen: [CHANGELOG.md](CHANGELOG.md). Nog te bouwen: [BACKLOG.md](BACKLOG.md).

Dit product gebruikt de TMDB-API maar is niet goedgekeurd of gecertificeerd door TMDB.
