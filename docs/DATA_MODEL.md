# Modelo de datos

## location

Registro principal de estancos, PVR, tiendas, distribuidores y contactos personales.

| Campo | Uso |
| --- | --- |
| id | Identificador interno |
| type | Estanco, PVR, Tienda, Distribuidor, Contacto personal |
| relevance | Alta, Media, Baja, Sin clasificar |
| name | Nombre visible |
| legalName | Razon social o titular |
| address | Direccion fisica |
| city | Ciudad o municipio |
| province | Provincia |
| country | Pais |
| postalCode | Codigo postal |
| lat / lng | Coordenadas |
| phone | Telefono confirmado o pendiente |
| email | Correo confirmado o pendiente |
| web | Web o redes sociales |
| contact | Persona de contacto |
| status | Estado comercial |
| nextAction | Proxima gestion |
| notes | Notas internas |
| source | Fuente del dato |
| sourceDate | Fecha de carga/verificacion |

## contact_event

Bitacora futura de llamadas, visitas, correos y seguimiento.

| Campo | Uso |
| --- | --- |
| id | Identificador |
| locationId | Relacion con location |
| date | Fecha |
| channel | llamada, visita, email, WhatsApp, evento |
| personName | Persona contactada |
| result | Resultado de la gestion |
| nextAction | Siguiente accion |
| notes | Observaciones |

## route_plan

Agenda diaria, semanal o mensual.

| Campo | Uso |
| --- | --- |
| id | Identificador |
| name | Nombre de ruta |
| dateStart / dateEnd | Periodo |
| fuelPrice | Precio combustible |
| consumption | Consumo L/100km |
| maxDailyHours | Horas maximas por dia |
| visitMinutes | Tiempo promedio por visita |
| status | Planificada, en progreso, cerrada |
