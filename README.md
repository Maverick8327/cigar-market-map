# Cigar Market Map

Prototipo inicial separado para el mapa comercial de estancos, PVR, tiendas y distribuidores.

## Objetivo

Crear una herramienta de prospeccion y logistica comercial para Espana y, despues, otros mercados. La app debe servir para:

- importar datos oficiales de estancos y PVR;
- visualizar puntos en mapa;
- filtrar por provincia, ciudad, tipo, estado comercial y relevancia;
- editar fichas con telefono, correo, web, redes, persona de contacto y notas;
- crear rutas logicas de visita;
- estimar distancia, tiempo y costo de combustible;
- trabajar sin conexion con base local del navegador;
- evolucionar a app multiplataforma Windows, Android e iOS.

## Estado del prototipo

Esta primera version es una app web local. No vende ni oferta tabaco online. Esta orientada a CRM privado, visitas, llamadas personales y seguimiento comercial.

## Como abrirlo

Abrir:

`web/index.html`

Tambien puede servirse con cualquier servidor estatico.

## Datos

La app importa CSV desde el navegador. Esta preparada para archivos como:

- `DatosEstancos.csv`
- `Listado_PVRs.csv`
- listados enriquecidos de tiendas/distribuidores

Los datos importados se guardan en `localStorage`, por lo que quedan disponibles aunque cierres el navegador.

## Siguiente fase

- integrar CSV oficiales reales dentro del repositorio;
- exportar Excel filtrable;
- agregar geocodificacion cuando falten coordenadas;
- conectar rutas con API externa de trafico;
- migrar el nucleo a app instalable.
