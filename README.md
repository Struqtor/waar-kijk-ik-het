# Waar kijk ik het?

Zoek een film of serie en zie meteen waar je hem kunt kijken in het land waar je bent: in een abonnement, gratis, te huur of te koop.

- Gegevens: JustWatch, via de TMDB-API. Je hebt een gratis, persoonlijk TMDB **API Read Access Token** nodig; dat blijft in je browser.
- Locatie: wordt op je toestel omgezet naar een land met [country-coder](https://github.com/rapideditor/country-coder). Je coördinaten worden niet verstuurd of bewaard.
- Statische site (HTML, CSS, JS), geen build-stap, strikte Content-Security-Policy.

Lokaal draaien:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Dit product gebruikt de TMDB-API maar is niet goedgekeurd of gecertificeerd door TMDB.
