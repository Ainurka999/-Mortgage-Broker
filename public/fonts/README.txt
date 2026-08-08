Положите сюда лицензионные файлы Museo Sans Cyrillic в формате woff2:

  MuseoSansCyrl-300.woff2   (Light)
  MuseoSansCyrl-500.woff2   (Regular/Medium)
  MuseoSansCyrl-700.woff2   (Bold)

Имена должны совпадать с указанными в src/index.css (@font-face).
Файлы из public/ раздаются по корню сайта: /fonts/MuseoSansCyrl-500.woff2

Если нет woff2, а есть otf/ttf — сконвертируйте (например, на transfonter.org,
там же можно собрать woff2) или добавьте их форматы в src/index.css:
  src: url("/fonts/MuseoSansCyrl-500.woff2") format("woff2"),
       url("/fonts/MuseoSansCyrl-500.woff")  format("woff");

Museo Sans — платный шрифт (myfonts.com). Убедитесь, что у вас есть
веб-лицензия перед публикацией.
