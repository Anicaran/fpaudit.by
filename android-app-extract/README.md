# Android App Extract

Папка для постоянного просмотра Android-исходников без повторной распаковки.

## Структура

- `xapk_contents/` — содержимое `FP+Audit_27.5_APKPure.xapk`
- `apk_contents/` — полная распаковка `ru.fixprice.fpa.android.apk`
- `apk_dex/` — только `classes*.dex` для быстрого поиска

## Быстрый поиск

- Все строки по задаче сроков:
  - `rg "expiration|CheckDates|countWriteOff|/check" "c:\proect\proectaudit\android-app-extract\apk_dex"`
- Start/stop задачи:
  - `rg "responses/.*/start|responses/.*/stop|UpdateTaskRequest" "c:\proect\proectaudit\android-app-extract\apk_dex"`
- Поиск API путей:
  - `rg "/api/tasks-manual|/api/goods|/api/xauth" "c:\proect\proectaudit\android-app-extract\apk_dex"`

## Что важно

- Это бинарные файлы APK/DEX (не decompiled Java/Kotlin).
- Для точной логики удобно искать строки через `rg` и сопоставлять с web-кодом.
