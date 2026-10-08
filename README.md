# EasyBet Value Radar — Render

Samodzielna wersja skanera Betclic PL × Pinnacle. Ten sam wygląd i rozszerzone dopasowanie rynków: wynik / zwycięzca, sumy, sumy drużyn, handicapy 2-drożne, BTTS i rożne. Obsługiwane części meczu są porównywane osobno. Bez płatnego API, bez kredytów i bez bazy danych.

## Najprostsze wdrożenie

1. Rozpakuj ZIP. Utwórz osobne repozytorium GitHub, np. `easybet-value-radar`.
2. Wgraj **zawartość** katalogu `easybet-render` do głównego katalogu repozytorium. Pliki `package.json`, `package-lock.json` i `render.yaml` mają być w jego głównym katalogu. Nie wgrywaj ZIP-a jako pojedynczego pliku.
3. Na Render wybierz **New → Blueprint**, połącz repozytorium i zatwierdź utworzenie usługi z `render.yaml`. Plan w pliku to **Free**.
4. Po udanym wdrożeniu otwórz adres `https://...onrender.com` podany przez Render.

### Jeśli wybierasz New → Web Service ręcznie

- Language: Node
- Branch: main (lub faktyczna gałąź Twojego repozytorium)
- Root Directory: puste, jeśli pliki są w głównym katalogu repozytorium
- Build Command: `npm ci --include=dev && npm run check && npm run build`
- Start Command: `npm start`
- Instance Type: Free
- Health Check Path: `/api/health`
- Environment: `NODE_VERSION=24.19.0`, `NODE_ENV=production`, `NEXT_TELEMETRY_DISABLED=1`

Nie dodawaj żadnych kluczy API ani konfiguracji bazy danych. Aplikacja uruchamia zwykły serwer Next.js na `0.0.0.0` i porcie `PORT` wskazanym przez Render. To **Web Service**, a nie Static Site.

## Działanie i ograniczenia

- Betclic jest odczytywany przez przeglądarkę użytkownika z publicznego polskiego feedu. Pinnacle jest pobierany przez `/api/reference` na serwerze.
- Skanowanie działa tylko przy otwartym panelu. Odświeżanie co 5 minut zaczyna następny cykl po zakończeniu bieżącego; kursy starsze niż 5 minut są ukrywane.
- Darmowy Render usypia usługę po 15 minutach bez ruchu. Ponowne uruchomienie może potrwać około minuty. Nie jest to skaner pracujący 24/7 w tle.
- Ta wersja nie ma logowania; po wdrożeniu panel jest dostępny dla osób z adresem. Zapisane okazje są lokalne dla przeglądarki.
- Sumy i handicapy wymagają identycznych linii z połówką (np. 2,5 / −3,5). Linie ze zwrotem, linie ćwiartkowe, handicapy 3-drożne i propsy zawodników są pomijane. Brak rożnych wymaga faktycznej linii referencyjnej 0,5 — nie wyliczamy jej z innych sum.
- EV to szacunek na podstawie kursów Pinnacle bez marży, przed podatkiem i kosztami. Dostępność feedów i ich opóźnienia mogą się zmieniać. Samo wdrożenie na Render nie gwarantuje dostępności obu źródeł w każdej lokalizacji.

## Lokalnie

Wymagany Node.js 24 i npm:

```sh
npm ci
npm run check
npm run build
npm start
```

Domyślnie: `http://localhost:3000`. Zmienna `PORT` zmienia port.

Dokumentacja Render: https://render.com/docs/deploy-nextjs-app
Bezpłatny plan: https://render.com/docs/free
