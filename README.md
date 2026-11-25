# X Background Color Changer

Extensión Manifest V3 (v2.0.1) para personalizar por completo los colores de fondo, superficies y acento de **X.com / Twitter**.

## Novedades respecto a v1.0.0

1. ** Espejo de hojas de estilo atómicas (CSSOM):** Lee dinámicamente las clases generadas por *React Native for Web* en `document.styleSheets` para cubrir vistas como **Mensajes (`/messages`)**, **Grok**, **Notificaciones**, **Comunidades**, **Listas**, menús y tarjetas sin depender únicamente de atributos `style` en línea.
2. **Soporte para barras fijas translúcidas (`rgba` + `backdrop-filter`):** Las cabeceras superiores (*Para ti / Siguiendo*, perfiles, buscador) adoptan el color elegido conservando el efecto cristal desenfocado, sin volver opaco el fondo oscurecido (`mask`) de los modales.
3. **Cobertura completa del color de acento:** Aplica el color de acento en la línea activa de pestañas, enlaces/`#hashtags`/`@menciones`, bordes de enfoque del buscador, insignias e íconos SVG de la barra de publicación, calculando automáticamente el contraste óptimo del texto en los botones.
4. **Detección de cambios de clases y atributos:** El `MutationObserver` ahora vigila cambios en `class`, `style`, `fill`, `stroke` y estados `aria-*`, además de nodos nuevos.
5. **Restablecimiento limpio sin recargar:** Usa atributos `data-xbg-*` reversibles en lugar de sobrescribir destructivamente `element.style`, permitiendo volver al aspecto original al instante.
6. **Popup mejorado:** Campos HEX editables para pegar códigos de color directamente y selector opcional de relieve sutil en tarjetas y buscador.

## Instalación (Modo Desarrollador)

1. Abre `chrome://extensions/` en tu navegador (Chrome, Brave, Edge).
2. Activa el **Modo de desarrollador**.
3. Haz clic en **Cargar descomprimida** y selecciona la carpeta de este proyecto.
