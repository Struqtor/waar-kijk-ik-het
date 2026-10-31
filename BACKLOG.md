# Backlog — nog te bouwen

Deze punten zijn besproken, maar nog niet gebouwd. Ze worden één voor één
opgepakt; bij elk punt staat wat al beslist is.

## A. Volgen, zoals TV Time of Bingers

Besproken op 2026-10-31. Jos koos alle vier de functies en opslag op het
toestel.

**Functies**

- **Kijklijst:** een lijst "Wil ik zien", met per titel waar je hem nu kunt
  kijken.
- **Gezien afvinken:** films, en bij series per aflevering of per seizoen.
- **Verder kijken:** per serie die je volgt de volgende aflevering die je nog
  niet zag en die al uitgezonden is, met de dienst waar ze staat. Met "Gezien"
  schuif je door naar de volgende.
- **Nieuwe afleveringen:** "Net verschenen" (de laatste 14 dagen) en
  "Binnenkort", uit `last_episode_to_air` en `next_episode_to_air` van TMDB.
  De datum is die van de oorspronkelijke uitzending; een Belgische dienst kan
  later zijn.

**Opslag: alleen op het toestel**

- In `localStorage` (`wkih.library`). Er gaat niets naar een server.
- **Back-up:** exporteren naar een bestand (op iPhone via Delen) en importeren.
  Importeren voegt samen en wordt streng gecontroleerd: maximaal 1 MB, alleen
  bekende velden, id's als getal, posterpad volgens een vast patroon.
- **Gegevensverlies vermijden:** Safari wist websitegegevens na 7 dagen zonder
  bezoek. De app op het beginscherm valt daar niet onder, maar heeft wel andere
  opslag dan Safari. Daarom:
  - de app vraagt `navigator.storage.persist()` bij de eerste titel;
  - een tip raadt aan de app vanaf het beginscherm te gebruiken;
  - exporteren dient als back-up.
- **Privacy:** "Verder kijken" vraagt bij TMDB de details op van de series die
  je volgt. TMDB ziet dus welke series je opvraagt met jouw sleutel. Bij zoeken
  is dat nu al zo.

**Opbouw**

- Een tabbalk onderaan: Ontdek · Mijn lijst · Verder · Nieuw.
- Een module `library.js` zonder DOM, met tests via `node:test`: volgende
  aflevering, grenzen van seizoenen, import met foute velden, samenvoegen.
- Details en aanbod in één verzoek:
  `/tv/{id}?append_to_response=watch/providers`. Afleveringen per seizoen
  worden pas geladen als je dat seizoen openklapt.
- Waarschijnlijk 1.2.0: er komen knoppen en tabbladen bij.

## B. Lokale diensten voor andere landen

`LOCAL` in `app.js` heeft nu alleen een regel voor België. Een land toevoegen
is één regel, bijvoorbeeld NPO Start en Videoland voor Nederland.

## C. Pickx

Pickx (Proximus) staat niet bij TMDB. Als extra dienst met een zoeklink,
zoals Play, Streamz en Arte in 1.0.1.

## D. Synchroniseren tussen toestellen

Nu niet gekozen. Mogelijke wegen:

- **Trakt:** volgt ook afleveringen. Vraagt een geheime appsleutel en dus een
  eigen server.
- **Een eigen server.**

Allebei betekenen meer aanvalsoppervlak dan de statische site van nu.
Waarschijnlijk een 2.0.0, want de omvang verandert.
