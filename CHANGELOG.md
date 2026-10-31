# Changelog — Waar kijk ik het?

Een versie staat live op https://struqtor.github.io/waar-kijk-ik-het/ zodra ze
naar `main` gepusht is. Het nummer staat ook onderaan in de app en in het
venster **Mijn diensten**. Zo zie je welke versie je toestel echt draait. De
app op het beginscherm kan de vorige versie nog tonen tot je haar sluit en
opnieuw opent.

## Versieafspraak

Dezelfde regel als bij het U12-scorebord:

| | wanneer | voorbeeld |
|---|---|---|
| **derde cijfer** (1.0.x) | correcties en toevoegingen waarvoor je niets nieuws moet leren | 1.0.1, meer diensten in dezelfde lijst |
| **tweede cijfer** (1.x.0) | een knop komt erbij, verandert of verhuist | 1.1.0, de schakelaar "Hier te zien" |
| **eerste cijfer** (x.0.0) | de omvang verandert; dat beslist Jos | bijvoorbeeld synchroniseren tussen toestellen |

Bij elke versie:

1. `VERSION` in `app.js` en de `?v=` achter `app.css` en `app.js` in
   `index.html` krijgen het nieuwe nummer. GitHub Pages bewaart bestanden tot
   10 minuten; met een nieuw nummer haalt de browser ze opnieuw op.
2. Deze changelog krijgt zijn regel **in dezelfde commit** als de
   versieverhoging.
3. Een annotated tag, bijvoorbeeld `git tag -a v1.0.1 -m "Korte omschrijving"`,
   en die tag meepushen.

Wat besproken is maar nog niet gebouwd, staat in [BACKLOG.md](BACKLOG.md).

## 1.0.1 — 2026-10-31

**Belgische diensten bovenaan, en Play, Streamz en Arte erbij.** Dezelfde
lijst, alleen vollediger, dus het derde cijfer.

- **Mijn diensten** toont in België eerst "Diensten in België": VRT MAX, VTM
  GO, RTL Play, RTBF Auvio, Telenet en Be TV Go. TMDB kende die al, maar ze
  stonden tussen zo'n 70 andere diensten. Daarna volgen de overige diensten.
  Welke diensten bovenaan komen, staat per land in `LOCAL` in `app.js`; voor
  andere landen blijft de volgorde van TMDB.
- **Play** (ex-GoPlay, nu play.tv), **Streamz** en **Arte** staan niet bij
  TMDB en ook niet bij JustWatch. Niemand weet dus welke titels ze hebben. Ze
  staan apart onder "Zonder gegevens bij TMDB". Bij elke titel staat een blok
  "Zelf zoeken bij" met een link die op de site van die dienst zoekt: de
  diensten die je aanvinkte, of alle drie als je er geen aanvinkte.
  - Streamz en Arte krijgen de titel mee in de link.
  - Play laat dat niet toe; die link opent de zoekpagina.
  - Arte heeft geen Nederlandstalige site, dus de link gaat naar de Franse.
  - De app opent alleen links naar deze drie sites, en pas als je erop tikt.
    Er gaat geen verwijzing (referrer) mee.
- Het versienummer staat onderaan de pagina en in het venster Mijn diensten.
- `app.css` en `app.js` worden geladen met `?v=` en het versienummer, zodat een
  nieuwe versie meteen volledig doorkomt.

## 1.0.0 — 2026-10-30

**Eerste release.** De versie zoals ze op 30 oktober live ging. De tag is
achteraf gezet, op de laatste commit van die dag.

- Zoeken op film of serie, of de populaire titels van de week, met de keuze
  Alles, Films of Series.
- Per titel vier banen: Abonnement, Gratis, Huren en Kopen. De gegevens komen
  van JustWatch, via TMDB. In de details staat ook in welke andere landen de
  titel in een abonnement zit.
- Het land komt uit je locatie, op het toestel omgezet met country-coder. Je
  coördinaten worden niet verstuurd of bewaard. Je kunt het land ook zelf
  kiezen.
- **Mijn diensten:** vink je abonnementen aan. Titels daarin krijgen een groene
  markering.
- Werkt als app op het iPhone-beginscherm, met een eigen icoon.
- Vensters sluiten met "Klaar", dat altijd in beeld blijft, of met de
  terugknop.
- De TMDB-sleutel kun je laten invullen door 1Password. Een volledige sleutel
  wordt meteen opgeslagen.
