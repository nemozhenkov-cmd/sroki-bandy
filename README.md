# СРОКИ БАНДЫ

PWA для двух магазинов: Видова 163В и Видова 190А.

## Стек
- React + Vite
- Supabase Auth/Postgres/Realtime
- Open Food Facts API для поиска товара по EAN
- PWA через manifest; production service worker можно включить через vite-plugin-pwa.

## Запуск
1. Создайте бесплатный проект Supabase.
2. SQL Editor → выполните `supabase.sql`.
3. Authentication → Email включён. Для первого теста можно отключить Confirm email, затем включить обратно.
4. Скопируйте Project URL и anon key в `.env` по образцу `.env.example`.
5. `npm install`
6. `npm run dev`
7. Для production: `npm run build` и разместить `dist` на Cloudflare Pages / GitHub Pages / Vercel.

## Важно про 0 ₽
Supabase Free не требует платного тарифа для такого небольшого проекта, но имеет квоты. Текущие ограничения: 500 MB DB/project, 50k MAU, 1 GB storage, 5 GB egress и 2 млн realtime messages. При превышении квот нужно контролировать использование; приложение не должно подключать биллинг автоматически.

Open Food Facts имеет rate limit на чтение продукта по IP, поэтому приложение сначала проверяет свою базу.

## Ограничения MVP

### Реальное сканирование
В интерфейсе есть камера через нативный `BarcodeDetector` для EAN-13/EAN-8/UPC-A/UPC-E. На Android Chrome это требует HTTPS и разрешения камеры. Для браузеров без BarcodeDetector нужен ZXing fallback на следующей итерации.
- Полноценный системный push и фоновая отправка уведомлений требуют отдельного сервера/cron/edge-функции. В текущем MVP заложена структура данных, но не имитируется отправка уведомлений.
- Нативный barcode scanner зависит от поддержки браузером BarcodeDetector. Для production рекомендуется подключить библиотеку fallback (например, ZXing) и отдельный экран камеры.
- История и админские RLS-политики требуют дальнейшего усиления: в production роль должна проверяться серверной политикой/функцией, а не только клиентом.
- Offline queue в этой первой сборке не реализована намеренно, чтобы не выдавать демо за полноценную синхронизацию.
