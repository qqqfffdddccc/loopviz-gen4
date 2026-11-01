# src-tauri

## Экспорт видео через ffmpeg

Rust-команды: `export_begin`, `export_frame` (сырые RGBA через `tauri::ipc::Request`, номер кадра в заголовке `x-frame-index`), `export_finish`, `export_cancel`, `write_temp_wav`, `export_ffmpeg_path`, `default_export_dir`, `reveal_in_finder`.

Поиск ffmpeg: переменная `LOOPVIZ_FFMPEG`, затем `/opt/homebrew/bin/ffmpeg`, `/usr/local/bin/ffmpeg`, затем `PATH`.

Кодеки: H.264 через `h264_videotoolbox` (20M для 1080p, 60M для 4K), HEVC через `hevc_videotoolbox` с тегом `hvc1`. Перед запуском бинарник пробует аппаратный энкодер на пробном кадре, и если тот не стартует, берёт `libx264 -crf 16` или `libx265`.

TODO: положить ffmpeg в бандл как sidecar (`bundle.externalBin` и `tauri-plugin-shell`) и искать его первым, а пути выше оставить запасными.

## Автотест экспорта (только `tauri dev`)

```sh
LOOPVIZ_AUTOTEST_EXPORT="<путь к репозиторию>" LOOPVIZ_AUTOTEST_RES=1080 bun run tauri dev
```

`LOOPVIZ_AUTOTEST_RES` принимает `1080` или `4k`. Приложение читает `fixtures/test-loop.wav` и `fixtures/test-loop.mid`, экспортирует 16 секунд (два повтора лупа) в `/tmp/loopviz-autotest-<1080|4k>.mp4` на 60 fps, H.264, пишет прогресс в stdout и выходит с кодом 0 или 1. Без переменной хук и его команды отключены.
